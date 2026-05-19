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

export function formatReportReason(reason) {
  const map = {
    scam: 'Scam or fraud',
    spam: 'Spam',
    fake: 'Fake information',
    abuse: 'Abusive or unsafe',
    duplicate: 'Duplicate listing',
    other: 'Other',
  }

  return map[reason] || 'Report'
}

export function getCaseStatusMeta(status) {
  switch (status) {
    case 'appealed':
      return {
        label: 'Appeal submitted',
        tint: '#7c3aed',
        background: '#f5f3ff',
        border: '#ddd6fe',
        icon: 'chatbubble-ellipses-outline',
      }
    case 'resolved':
      return {
        label: 'Resolved',
        tint: '#059669',
        background: '#ecfdf5',
        border: '#bbf7d0',
        icon: 'checkmark-circle-outline',
      }
    case 'unresolved':
      return {
        label: 'Needs attention',
        tint: '#ea580c',
        background: '#fff7ed',
        border: '#fdba74',
        icon: 'alert-circle-outline',
      }
    default:
      return {
        label: 'Open case',
        tint: '#2563eb',
        background: '#eff6ff',
        border: '#bfdbfe',
        icon: 'folder-open-outline',
      }
  }
}

function normalizeText(value) {
  return String(value || '').trim()
}

export async function fetchHiddenContentState(currentUserId) {
  if (!currentUserId) {
    return {
      blockedUserIds: new Set(),
      hiddenOwnerIds: new Set(),
      hiddenPropertyIds: new Set(),
      reportedUserIds: new Set(),
      reportedPropertyIds: new Set(),
    }
  }

  const [
    { data: blockedRows },
    { data: hiddenOwnerRows },
    { data: hiddenPropertyRows },
    { data: userReportRows },
    { data: propertyReportRows },
  ] = await Promise.all([
    supabase
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', currentUserId),
    supabase
      .from('user_hidden_owners')
      .select('owner_id')
      .eq('user_id', currentUserId),
    supabase
      .from('user_hidden_properties')
      .select('property_id')
      .eq('user_id', currentUserId),
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
    hiddenOwnerIds: new Set((hiddenOwnerRows || []).map((item) => item.owner_id).filter(Boolean)),
    hiddenPropertyIds: new Set((hiddenPropertyRows || []).map((item) => String(item.property_id)).filter(Boolean)),
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
      case_status: 'open',
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
      case_status: 'open',
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
  const [
    { data: userReports, error: userError },
    { data: propertyReports, error: propertyError },
    { data: resolvedUserReports, error: resolvedUserError },
    { data: resolvedPropertyReports, error: resolvedPropertyError },
  ] = await Promise.all([
    supabase
      .from('user_reports')
      .select('*')
      .neq('case_status', 'resolved')
      .order('created_at', { ascending: false }),
    supabase
      .from('property_reports')
      .select('*')
      .neq('case_status', 'resolved')
      .order('created_at', { ascending: false }),
    supabase
      .from('user_reports')
      .select('*')
      .eq('case_status', 'resolved')
      .order('resolved_at', { ascending: false })
      .limit(12),
    supabase
      .from('property_reports')
      .select('*')
      .eq('case_status', 'resolved')
      .order('created_at', { ascending: false })
      .limit(12),
  ])

  if (userError) throw userError
  if (propertyError) throw propertyError
  if (resolvedUserError) throw resolvedUserError
  if (resolvedPropertyError) throw resolvedPropertyError

  const reporterIds = [...new Set([
    ...(userReports || []).map((item) => item.reporter_id),
    ...(propertyReports || []).map((item) => item.reporter_id),
    ...(resolvedUserReports || []).map((item) => item.reporter_id),
    ...(resolvedPropertyReports || []).map((item) => item.reporter_id),
  ].filter(Boolean))]
  const targetUserIds = [...new Set([
    ...(userReports || []).map((item) => item.target_user_id),
    ...(propertyReports || []).map((item) => item.target_user_id),
    ...(resolvedUserReports || []).map((item) => item.target_user_id),
    ...(resolvedPropertyReports || []).map((item) => item.target_user_id),
  ].filter(Boolean))]
  const propertyIds = [...new Set([
    ...(propertyReports || []).map((item) => String(item.property_id)),
    ...(resolvedPropertyReports || []).map((item) => String(item.property_id)),
  ].filter(Boolean))]

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
    resolvedUserReports: (resolvedUserReports || []).map((item) => ({
      ...item,
      reporter_profile: profilesByReporter[item.reporter_id] || null,
      target_profile: profilesByTarget[item.target_user_id] || null,
    })),
    resolvedPropertyReports: (resolvedPropertyReports || []).map((item) => ({
      ...item,
      reporter_profile: profilesByReporter[item.reporter_id] || null,
      target_profile: profilesByTarget[item.target_user_id] || null,
      property: propertiesById[String(item.property_id)] || null,
    })),
  }
}

export async function dismissUserReport(reportId, reviewerEmail, adminReply) {
  return supabase
    .from('user_reports')
    .update({
      status: 'dismissed',
      case_status: 'resolved',
      reviewed_at: new Date().toISOString(),
      reviewed_by_email: reviewerEmail || null,
      admin_reply: normalizeText(adminReply) || null,
      admin_replied_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
      resolved_by_email: reviewerEmail || null,
    })
    .eq('id', reportId)
}

export async function dismissPropertyReport(reportId, reviewerEmail, adminReply) {
  return supabase
    .from('property_reports')
    .update({
      status: 'dismissed',
      case_status: 'resolved',
      reviewed_at: new Date().toISOString(),
      reviewed_by_email: reviewerEmail || null,
      admin_reply: normalizeText(adminReply) || null,
      admin_replied_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
      resolved_by_email: reviewerEmail || null,
    })
    .eq('id', reportId)
}

export async function updatePropertyCase({
  reportId,
  reviewerEmail,
  reportStatus,
  caseStatus,
  adminReply,
}) {
  return supabase
    .from('property_reports')
    .update({
      status: reportStatus,
      case_status: caseStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by_email: reviewerEmail || null,
      admin_reply: normalizeText(adminReply) || null,
      admin_replied_at: new Date().toISOString(),
      resolved_at: caseStatus === 'resolved' ? new Date().toISOString() : null,
      resolved_by_email: caseStatus === 'resolved' ? reviewerEmail || null : null,
    })
    .eq('id', reportId)
}

export async function updateUserCase({
  reportId,
  reviewerEmail,
  reportStatus,
  caseStatus,
  adminReply,
}) {
  return supabase
    .from('user_reports')
    .update({
      status: reportStatus,
      case_status: caseStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by_email: reviewerEmail || null,
      admin_reply: normalizeText(adminReply) || null,
      admin_replied_at: new Date().toISOString(),
      resolved_at: caseStatus === 'resolved' ? new Date().toISOString() : null,
      resolved_by_email: caseStatus === 'resolved' ? reviewerEmail || null : null,
    })
    .eq('id', reportId)
}

export async function submitPropertyAppeal({ reportId, userId, message }) {
  const appealMessage = normalizeText(message)

  if (!reportId || !userId || !appealMessage) {
    throw new Error('Please write a short appeal message first.')
  }

  const { data, error } = await supabase
    .from('property_reports')
    .update({
      case_status: 'appealed',
      appeal_message: appealMessage,
      appeal_submitted_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .eq('target_user_id', userId)
    .select('*')
    .single()

  if (error) throw error

  const profilesById = await fetchProfilesByUserIds([userId])
  const reporterProfile = profilesById[userId]

  await notifyAdmins({
    actorId: userId,
    type: 'property_case_appealed',
    title: 'New customer care appeal',
    body: 'submitted an appeal for a moderated property case',
    propertyId: data.property_id,
    actorName: reporterProfile?.display_name || reporterProfile?.email || 'Rental X member',
    actorAvatarUrl: reporterProfile?.avatar_url || '',
    targetUserId: userId,
    targetUserName: reporterProfile?.display_name || reporterProfile?.email || 'Property owner',
    reportReason: data.reason,
  })

  return data
}

export async function fetchPropertyCaseForUser({ userId, propertyId }) {
  if (!userId || !propertyId) return null

  const { data, error } = await supabase
    .from('property_reports')
    .select('*')
    .eq('property_id', String(propertyId))
    .eq('target_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data || null
}

export async function fetchCustomerCareHistory(userId) {
  if (!userId) {
    return {
      propertyCases: [],
      submittedPropertyReports: [],
      submittedUserReports: [],
    }
  }

  const [
    { data: propertyCases, error: propertyCaseError },
    { data: submittedPropertyReports, error: submittedPropertyError },
    { data: submittedUserReports, error: submittedUserError },
  ] = await Promise.all([
    supabase
      .from('property_reports')
      .select('*')
      .eq('target_user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('property_reports')
      .select('*')
      .eq('reporter_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_reports')
      .select('*')
      .eq('reporter_id', userId)
      .order('created_at', { ascending: false }),
  ])

  if (propertyCaseError) throw propertyCaseError
  if (submittedPropertyError) throw submittedPropertyError
  if (submittedUserError) throw submittedUserError

  const propertyIds = [...new Set([
    ...(propertyCases || []).map((item) => String(item.property_id)),
    ...(submittedPropertyReports || []).map((item) => String(item.property_id)),
  ].filter(Boolean))]

  const targetUserIds = [...new Set([
    ...(submittedUserReports || []).map((item) => item.target_user_id),
    ...(submittedPropertyReports || []).map((item) => item.target_user_id),
  ].filter(Boolean))]

  const [propertyResponse, profilesById] = await Promise.all([
    propertyIds.length
      ? supabase.from('properties').select('*').in('id', propertyIds)
      : Promise.resolve({ data: [] }),
    fetchProfilesByUserIds(targetUserIds),
  ])

  const propertiesById = (propertyResponse?.data || []).reduce((accumulator, item) => {
    accumulator[String(item.id)] = item
    return accumulator
  }, {})

  return {
    propertyCases: (propertyCases || []).map((item) => ({
      ...item,
      property: propertiesById[String(item.property_id)] || null,
    })),
    submittedPropertyReports: (submittedPropertyReports || []).map((item) => ({
      ...item,
      property: propertiesById[String(item.property_id)] || null,
      target_profile: profilesById[item.target_user_id] || null,
    })),
    submittedUserReports: (submittedUserReports || []).map((item) => ({
      ...item,
      target_profile: profilesById[item.target_user_id] || null,
    })),
  }
}
