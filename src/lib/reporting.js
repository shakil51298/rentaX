import { supabase } from './supabase'
import { createNotification } from './notifications'
import { getPrimaryAdminUserIds } from './admin'
import { blockUser, fetchProfilesByUserIds } from './social'

export const REPORT_REASONS = [
  { id: 'scam', title: 'Scam or fraud' },
  { id: 'spam', title: 'Spam' },
  { id: 'fake', title: 'Fake information' },
  { id: 'abuse', title: 'Abusive or unsafe' },
  { id: 'duplicate', title: 'Duplicate listing' },
  { id: 'other', title: 'Other' },
]

function normalizeText(value) {
  return String(value || '').trim()
}

export async function fetchHiddenContentState(currentUserId) {
  if (!currentUserId) {
    return {
      blockedUserIds: new Set(),
      reportedUserIds: new Set(),
      reportedPropertyIds: new Set(),
    }
  }

  const [{ data: blockedRows }, { data: userReportRows }, { data: propertyReportRows }] = await Promise.all([
    supabase
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', currentUserId),
    supabase
      .from('user_reports')
      .select('target_user_id')
      .eq('reporter_id', currentUserId),
    supabase
      .from('property_reports')
      .select('property_id')
      .eq('reporter_id', currentUserId),
  ])

  return {
    blockedUserIds: new Set((blockedRows || []).map((item) => item.blocked_id).filter(Boolean)),
    reportedUserIds: new Set((userReportRows || []).map((item) => item.target_user_id).filter(Boolean)),
    reportedPropertyIds: new Set((propertyReportRows || []).map((item) => String(item.property_id)).filter(Boolean)),
  }
}

async function notifyAdmins({
  actorId,
  type,
  title,
  body,
  propertyId,
  actorName,
  actorAvatarUrl,
  targetUserId,
  targetUserName,
  reportReason,
}) {
  const adminIds = await getPrimaryAdminUserIds()

  await Promise.all(
    adminIds.map((adminId) =>
      createNotification({
        recipientId: adminId,
        actorId,
        type,
        propertyId,
        title,
        body,
        eventKey: `${type}:${adminId}:${actorId}:${propertyId || targetUserId || ''}:${Date.now()}`,
        pushData: {
          actorName: actorName || '',
          actorAvatarUrl: actorAvatarUrl || '',
          targetUserId: targetUserId || null,
          targetUserName: targetUserName || '',
          reportReason: reportReason || '',
        },
      })
    )
  )
}

export async function submitUserReport({
  reporterId,
  targetUserId,
  reason,
  details,
  blockToo = false,
}) {
  const normalizedReason = normalizeText(reason)
  const normalizedDetails = normalizeText(details)

  if (!reporterId || !targetUserId || !normalizedReason) {
    throw new Error('Missing report details.')
  }

  const [profilesById] = await Promise.all([
    fetchProfilesByUserIds([reporterId, targetUserId]),
  ])

  const { data, error } = await supabase
    .from('user_reports')
    .insert({
      reporter_id: reporterId,
      target_user_id: targetUserId,
      reason: normalizedReason,
      details: normalizedDetails || null,
      status: 'pending',
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  if (blockToo) {
    const { error: blockError } = await blockUser(reporterId, targetUserId)
    if (blockError) {
      throw blockError
    }
  }

  const reporterProfile = profilesById[reporterId]
  const targetProfile = profilesById[targetUserId]

  await notifyAdmins({
    actorId: reporterId,
    type: 'user_report_submitted',
    title: 'New user report',
    body: `reported ${targetProfile?.display_name || targetProfile?.email || 'a user'}`,
    actorName: reporterProfile?.display_name || reporterProfile?.email || 'Rental X member',
    actorAvatarUrl: reporterProfile?.avatar_url || '',
    targetUserId,
    targetUserName: targetProfile?.display_name || targetProfile?.email || 'Rental X member',
    reportReason: normalizedReason,
  })

  return data
}

export async function submitPropertyReport({
  reporterId,
  property,
  reason,
  details,
  blockOwnerToo = false,
}) {
  const normalizedReason = normalizeText(reason)
  const normalizedDetails = normalizeText(details)
  const propertyId = property?.id ? String(property.id) : null
  const ownerId = property?.owner_id || null

  if (!reporterId || !propertyId || !ownerId || !normalizedReason) {
    throw new Error('Missing report details.')
  }

  const [profilesById] = await Promise.all([
    fetchProfilesByUserIds([reporterId, ownerId]),
  ])

  const { data, error } = await supabase
    .from('property_reports')
    .insert({
      reporter_id: reporterId,
      property_id: propertyId,
      target_user_id: ownerId,
      reason: normalizedReason,
      details: normalizedDetails || null,
      status: 'pending',
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  if (blockOwnerToo) {
    const { error: blockError } = await blockUser(reporterId, ownerId)
    if (blockError) {
      throw blockError
    }
  }

  const reporterProfile = profilesById[reporterId]
  const ownerProfile = profilesById[ownerId]

  await notifyAdmins({
    actorId: reporterId,
    type: 'property_report_submitted',
    title: 'New post report',
    body: `reported "${property?.title || 'a property post'}"`,
    propertyId,
    actorName: reporterProfile?.display_name || reporterProfile?.email || 'Rental X member',
    actorAvatarUrl: reporterProfile?.avatar_url || '',
    targetUserId: ownerId,
    targetUserName: ownerProfile?.display_name || ownerProfile?.email || 'Property owner',
    reportReason: normalizedReason,
  })

  return data
}

export async function fetchAdminReportCounts() {
  const [{ count: userReportCount }, { count: propertyReportCount }] = await Promise.all([
    supabase
      .from('user_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('property_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ])

  return {
    userReportCount: userReportCount || 0,
    propertyReportCount: propertyReportCount || 0,
  }
}

export async function fetchAdminReportQueue() {
  const [{ data: userReports, error: userError }, { data: propertyReports, error: propertyError }] = await Promise.all([
    supabase
      .from('user_reports')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('property_reports')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ])

  if (userError) throw userError
  if (propertyError) throw propertyError

  const reporterIds = [...new Set([
    ...(userReports || []).map((item) => item.reporter_id),
    ...(propertyReports || []).map((item) => item.reporter_id),
  ].filter(Boolean))]
  const targetUserIds = [...new Set([
    ...(userReports || []).map((item) => item.target_user_id),
    ...(propertyReports || []).map((item) => item.target_user_id),
  ].filter(Boolean))]
  const propertyIds = [...new Set((propertyReports || []).map((item) => String(item.property_id)).filter(Boolean))]

  const [profilesByReporter, profilesByTarget, propertyResponse] = await Promise.all([
    fetchProfilesByUserIds(reporterIds),
    fetchProfilesByUserIds(targetUserIds),
    propertyIds.length > 0
      ? supabase
          .from('properties')
          .select('*')
          .in('id', propertyIds)
      : Promise.resolve({ data: [] }),
  ])

  const propertiesById = (propertyResponse?.data || []).reduce((accumulator, property) => {
    accumulator[String(property.id)] = property
    return accumulator
  }, {})

  return {
    userReports: (userReports || []).map((item) => ({
      ...item,
      reporter_profile: profilesByReporter[item.reporter_id] || null,
      target_profile: profilesByTarget[item.target_user_id] || null,
    })),
    propertyReports: (propertyReports || []).map((item) => ({
      ...item,
      reporter_profile: profilesByReporter[item.reporter_id] || null,
      target_profile: profilesByTarget[item.target_user_id] || null,
      property: propertiesById[String(item.property_id)] || null,
    })),
  }
}

export async function dismissUserReport(reportId, reviewerEmail) {
  return supabase
    .from('user_reports')
    .update({
      status: 'dismissed',
      reviewed_at: new Date().toISOString(),
      reviewed_by_email: reviewerEmail || null,
    })
    .eq('id', reportId)
}

export async function dismissPropertyReport(reportId, reviewerEmail) {
  return supabase
    .from('property_reports')
    .update({
      status: 'dismissed',
      reviewed_at: new Date().toISOString(),
      reviewed_by_email: reviewerEmail || null,
    })
    .eq('id', reportId)
}
