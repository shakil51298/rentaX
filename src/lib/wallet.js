import { supabase } from './supabase'
import { getPrimaryAdminUserIds } from './admin'
import { createNotification } from './notifications'

export const WALLET_CURRENCY = 'BDT'
export const WALLET_MAX_REQUEST_AMOUNT = 500000

export function parseWalletAmount(value) {
  return Number(String(value || '').replace(/[^\d.]/g, ''))
}

export function formatWalletAmount(amount, currency = WALLET_CURRENCY) {
  const value = Number(amount || 0)
  const formatted = Number.isFinite(value)
    ? value.toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    })
    : '0'

  if (currency === 'BDT') return `৳ ${formatted}`

  return `${currency} ${formatted}`
}

export function getWalletEntryTitle(entry = {}) {
  if (entry.source === 'admin_topup') return 'Admin added e-money'
  if (entry.source === 'red_packet_sent') return 'Red packet sent'
  if (entry.source === 'red_packet_received') return 'Red packet received'

  return 'Wallet update'
}

export function getWalletRequestStatusMeta(status) {
  if (status === 'approved') {
    return {
      label: 'Approved',
      color: '#16a34a',
      bg: '#dcfce7',
      icon: 'checkmark-circle',
    }
  }

  if (status === 'rejected') {
    return {
      label: 'Rejected',
      color: '#dc2626',
      bg: '#fee2e2',
      icon: 'close-circle',
    }
  }

  return {
    label: 'Pending',
    color: '#b45309',
    bg: '#fef3c7',
    icon: 'time',
  }
}

export async function fetchWalletEntries(userId, limit = 80) {
  if (!userId) return []

  const { data, error } = await supabase
    .from('wallet_entries')
    .select('id, user_id, red_packet_id, topup_request_id, amount, currency, source, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return data || []
}

export async function fetchWalletBalance(userId, currency = WALLET_CURRENCY) {
  if (!userId) return 0

  const { data: walletRow, error: walletError } = await supabase
    .from('user_wallets')
    .select('balance, currency')
    .eq('currency', currency)
    .maybeSingle()

  if (!walletError) {
    return Number(walletRow?.balance || 0)
  }

  const entries = await fetchWalletEntries(userId, 500)

  return entries
    .filter((entry) => (entry.currency || WALLET_CURRENCY) === currency)
    .reduce((total, entry) => total + Number(entry.amount || 0), 0)
}

export async function fetchWalletTopupRequests(userId, limit = 30) {
  if (!userId) return []

  const { data, error } = await supabase
    .from('wallet_topup_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return data || []
}

export async function fetchPendingWalletTopupRequestCount() {
  const { count, error } = await supabase
    .from('wallet_topup_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  if (error) return 0

  return count || 0
}

export async function requestWalletTopup({
  user,
  amount,
  note,
  currency = WALLET_CURRENCY,
}) {
  if (!user?.id) {
    throw new Error('Login is required to request e-money.')
  }

  const cleanAmount = Number(amount)

  if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
    throw new Error('Enter a valid e-money amount.')
  }

  if (cleanAmount > WALLET_MAX_REQUEST_AMOUNT) {
    throw new Error('You can request up to 500,000 BDT at a time.')
  }

  const { data: request, error } = await supabase
    .from('wallet_topup_requests')
    .insert({
      user_id: user.id,
      amount: cleanAmount,
      currency,
      note: note?.trim() || null,
      status: 'pending',
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
        type: 'wallet_topup_requested',
        title: 'E-money request',
        body: `requested ${formatWalletAmount(cleanAmount, currency)} for wallet balance.`,
        eventKey: `wallet_topup_requested:${adminId}:${user.id}:${request.id}`,
        pushTitle: 'New e-money request',
        pushBody: `A user requested ${formatWalletAmount(cleanAmount, currency)}.`,
        pushData: {
          requestId: request.id,
        },
      }).catch(() => null)
    )
  )

  return request
}

export async function fetchAdminWalletTopupRequests(limit = 100) {
  const { data, error } = await supabase
    .from('wallet_topup_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  const requests = data || []
  const userIds = [...new Set(requests.map((request) => request.user_id).filter(Boolean))]

  if (userIds.length === 0) return requests

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

export async function reviewWalletTopupRequest({
  request,
  adminUser,
  status,
  adminNote,
}) {
  if (!request?.id || !adminUser?.id) {
    throw new Error('Missing wallet request details.')
  }

  if (!['approved', 'rejected'].includes(status)) {
    throw new Error('Choose approve or reject.')
  }

  const reviewedAt = new Date().toISOString()

  if (status === 'approved') {
    const { error: entryError } = await supabase
      .from('wallet_entries')
      .insert({
        user_id: request.user_id,
        topup_request_id: request.id,
        amount: Number(request.amount || 0),
        currency: request.currency || WALLET_CURRENCY,
        source: 'admin_topup',
      })

    if (entryError && !String(entryError.message || '').toLowerCase().includes('duplicate')) {
      throw entryError
    }
  }

  const { data: updatedRequest, error } = await supabase
    .from('wallet_topup_requests')
    .update({
      status,
      admin_id: adminUser.id,
      admin_note: adminNote?.trim() || null,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt,
    })
    .eq('id', request.id)
    .select('*')
    .single()

  if (error) throw error

  await createNotification({
    recipientId: request.user_id,
    actorId: adminUser.id,
    type: status === 'approved' ? 'wallet_topup_approved' : 'wallet_topup_rejected',
    title: status === 'approved' ? 'E-money approved' : 'E-money request rejected',
    body:
      status === 'approved'
        ? `${formatWalletAmount(request.amount, request.currency)} was added to your wallet.`
        : 'Admin rejected your e-money request.',
    eventKey: `wallet_topup_${status}:${request.user_id}:${request.id}`,
    pushTitle: status === 'approved' ? 'Wallet updated' : 'Wallet request rejected',
    pushBody:
      status === 'approved'
        ? `${formatWalletAmount(request.amount, request.currency)} was added to your wallet.`
        : 'Admin rejected your e-money request.',
    pushData: {
      requestId: request.id,
    },
  }).catch(() => null)

  return updatedRequest
}
