import { getPrimaryAdminUserIds } from './admin'
import { createNotification } from './notifications'
import { supabase } from './supabase'

export const ACCOUNT_DELETION_GRACE_DAYS = 14

export function formatAccountDeletionDate(date) {
  if (!date) return ''

  try {
    return new Date(date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

export function getAccountDeletionStatusMeta(status) {
  if (status === 'pending') {
    return {
      label: 'Pending',
      color: '#b45309',
      bg: '#fef3c7',
      icon: 'time-outline',
    }
  }

  if (status === 'approved') {
    return {
      label: 'Approved',
      color: '#2563eb',
      bg: '#dbeafe',
      icon: 'checkmark-done-outline',
    }
  }

  if (status === 'deleted') {
    return {
      label: 'Deleted',
      color: '#64748b',
      bg: '#e2e8f0',
      icon: 'trash-outline',
    }
  }

  if (status === 'rejected') {
    return {
      label: 'Rejected',
      color: '#dc2626',
      bg: '#fee2e2',
      icon: 'close-circle-outline',
    }
  }

  return {
    label: 'Cancelled',
    color: '#16a34a',
    bg: '#dcfce7',
    icon: 'refresh-outline',
  }
}

export async function fetchMyActiveAccountDeletionRequest(userId) {
  if (!userId) return null

  const { data, error } = await supabase
    .from('account_deletion_requests')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'approved'])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error

  return data || null
}

export async function requestAccountDeletion({ reason } = {}) {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) {
    throw new Error('Please log in again first.')
  }

  const activeRequest = await fetchMyActiveAccountDeletionRequest(user.id)

  if (activeRequest) {
    return activeRequest
  }

  const requestedAt = new Date()
  const scheduledDeletionAt = new Date(
    requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000
  ).toISOString()

  const { data: request, error } = await supabase
    .from('account_deletion_requests')
    .insert({
      user_id: user.id,
      user_email: user.email || null,
      user_name:
        user.user_metadata?.name ||
        user.user_metadata?.full_name ||
        user.email ||
        'Rental X user',
      reason: reason?.trim() || null,
      status: 'pending',
      scheduled_deletion_at: scheduledDeletionAt,
    })
    .select('*')
    .single()

  if (error) throw error

  const adminIds = await getPrimaryAdminUserIds()

  await Promise.all(
    adminIds.map((adminId) =>
      createNotification({
        recipientId: adminId,
        actorId: user.id,
        type: 'account_deletion_requested',
        title: 'Account deletion request',
        body: 'requested account deletion. Approve it or it will be due after 14 days.',
        eventKey: `account_deletion_requested:${adminId}:${user.id}:${request.id}`,
        pushTitle: 'Account deletion request',
        pushBody: 'A user requested account deletion.',
        pushData: {
          requestId: request.id,
        },
      }).catch(() => null)
    )
  )

  return request
}

export async function cancelAccountDeletionRequest(requestId) {
  if (!requestId) return null

  const cancelledAt = new Date().toISOString()

  const { data, error } = await supabase
    .from('account_deletion_requests')
    .update({
      status: 'cancelled',
      cancelled_at: cancelledAt,
      updated_at: cancelledAt,
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('*')
    .single()

  if (error) throw error

  return data
}

export async function fetchPendingAccountDeletionRequestCount() {
  const { count, error } = await supabase
    .from('account_deletion_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  if (error) return 0

  return count || 0
}

export async function fetchAdminAccountDeletionRequests(limit = 100) {
  const { data, error } = await supabase
    .from('account_deletion_requests')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  const requests = data || []
  const userIds = [...new Set(requests.map((request) => request.user_id).filter(Boolean))]

  if (!userIds.length) return requests

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('user_id, display_name, email, avatar_url, rentalx_id, is_verified, owner_verification_status')
    .in('user_id', userIds)

  const profilesById = (profiles || []).reduce((itemsById, profile) => {
    itemsById[profile.user_id] = profile
    return itemsById
  }, {})

  return requests.map((request) => ({
    ...request,
    user_profile: profilesById[request.user_id] || null,
  }))
}

export async function reviewAccountDeletionRequest({
  request,
  adminUser,
  status,
  adminNote,
}) {
  if (!request?.id || !adminUser?.id) {
    throw new Error('Missing deletion request details.')
  }

  if (status === 'approved') {
    const { data, error } = await supabase.functions.invoke('account-deletion', {
      body: {
        action: 'approve',
        requestId: request.id,
        adminNote: adminNote?.trim() || null,
      },
    })

    if (error) throw error
    if (data?.error) throw new Error(data.error)

    return data?.request || null
  }

  if (status !== 'rejected') {
    throw new Error('Choose approve or reject.')
  }

  const reviewedAt = new Date().toISOString()
  const { data: updatedRequest, error } = await supabase
    .from('account_deletion_requests')
    .update({
      status: 'rejected',
      reviewed_by_user_id: adminUser.id,
      reviewed_by_email: adminUser.email || null,
      reviewed_at: reviewedAt,
      admin_note: adminNote?.trim() || null,
      updated_at: reviewedAt,
    })
    .eq('id', request.id)
    .select('*')
    .single()

  if (error) throw error

  await createNotification({
    recipientId: request.user_id,
    actorId: adminUser.id,
    type: 'account_deletion_rejected',
    title: 'Deletion request rejected',
    body: 'Admin rejected your account deletion request.',
    eventKey: `account_deletion_rejected:${request.user_id}:${request.id}`,
    pushTitle: 'Deletion request rejected',
    pushBody: 'Admin rejected your account deletion request.',
    pushData: {
      requestId: request.id,
    },
  }).catch(() => null)

  return updatedRequest
}
