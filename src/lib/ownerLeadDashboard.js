import { supabase } from './supabase'
import { computeOwnerResponseQuality, getEmptyOwnerResponseQuality } from './ownerResponseQuality'

function emptyLeadMetrics(property = {}) {
  return {
    views: Number(property?.view_count || 0),
    saves: Array.isArray(property?.property_favorites) ? property.property_favorites.length : 0,
    chats: 0,
    visitRequests: 0,
    pendingVisitRequests: 0,
    applications: 0,
    pendingApplications: 0,
    responseRate: null,
    responseRateLabel: 'New',
    averageReplyLabel: 'No replies yet',
    usuallyRepliesLabel: 'No reply history yet',
  }
}

function incrementMetric(metricsByPropertyId, propertyId, key, amount = 1) {
  const normalizedPropertyId = String(propertyId || '')

  if (!normalizedPropertyId || !metricsByPropertyId[normalizedPropertyId]) return

  metricsByPropertyId[normalizedPropertyId][key] += amount
}

function canIgnoreMissingTable(error) {
  const message = String(error?.message || '')
  const code = String(error?.code || '')

  return code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table|schema cache/i.test(message)
}

async function fetchPropertyApplications(propertyIds) {
  if (!propertyIds.length) return []

  const { data, error } = await supabase
    .from('property_applications')
    .select('property_id, status')
    .in('property_id', propertyIds)

  if (error) {
    if (canIgnoreMissingTable(error)) return []
    throw error
  }

  return data || []
}

export async function fetchOwnerLeadDashboard({ ownerId, properties = [] }) {
  const propertyIds = properties.map((property) => String(property.id)).filter(Boolean)
  const metricsByPropertyId = properties.reduce((itemsByPropertyId, property) => ({
    ...itemsByPropertyId,
    [String(property.id)]: emptyLeadMetrics(property),
  }), {})

  if (!ownerId || !propertyIds.length) {
    return {
      byPropertyId: metricsByPropertyId,
      totals: buildLeadTotals(metricsByPropertyId),
    }
  }

  const [conversationResponse, visitResponse, applicationRows] = await Promise.all([
    supabase
      .from('chat_conversations')
      .select('id, property_id')
      .in('property_id', propertyIds)
      .or(`participant_one_id.eq.${ownerId},participant_two_id.eq.${ownerId}`),
    supabase
      .from('property_visit_requests')
      .select('property_id, status')
      .in('property_id', propertyIds),
    fetchPropertyApplications(propertyIds),
  ])

  if (conversationResponse.error) throw conversationResponse.error
  if (visitResponse.error && !canIgnoreMissingTable(visitResponse.error)) {
    throw visitResponse.error
  }

  const conversations = conversationResponse.data || []
  const visits = visitResponse.error ? [] : visitResponse.data || []
  const conversationsByPropertyId = conversations.reduce((itemsByPropertyId, conversation) => {
    const propertyId = String(conversation.property_id || '')

    if (!propertyId) return itemsByPropertyId

    itemsByPropertyId[propertyId] = itemsByPropertyId[propertyId] || []
    itemsByPropertyId[propertyId].push(conversation)
    incrementMetric(metricsByPropertyId, propertyId, 'chats')

    return itemsByPropertyId
  }, {})

  visits.forEach((visit) => {
    incrementMetric(metricsByPropertyId, visit.property_id, 'visitRequests')

    if (visit.status === 'pending') {
      incrementMetric(metricsByPropertyId, visit.property_id, 'pendingVisitRequests')
    }
  })

  applicationRows.forEach((application) => {
    incrementMetric(metricsByPropertyId, application.property_id, 'applications')

    if (application.status === 'pending') {
      incrementMetric(metricsByPropertyId, application.property_id, 'pendingApplications')
    }
  })

  const conversationIds = conversations.map((conversation) => conversation.id).filter(Boolean)
  let messagesByConversationId = {}

  if (conversationIds.length) {
    const { data: messages, error: messageError } = await supabase
      .from('chat_messages')
      .select('conversation_id, sender_id, receiver_id, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: true })

    if (messageError) throw messageError

    messagesByConversationId = (messages || []).reduce((itemsByConversationId, message) => {
      itemsByConversationId[message.conversation_id] = itemsByConversationId[message.conversation_id] || []
      itemsByConversationId[message.conversation_id].push(message)
      return itemsByConversationId
    }, {})
  }

  Object.entries(conversationsByPropertyId).forEach(([propertyId, propertyConversations]) => {
    const propertyMessages = propertyConversations.flatMap(
      (conversation) => messagesByConversationId[conversation.id] || []
    )
    const responseQuality = propertyMessages.length
      ? computeOwnerResponseQuality(propertyMessages, ownerId)
      : getEmptyOwnerResponseQuality()
    const responseRate = responseQuality.responseRate

    metricsByPropertyId[propertyId] = {
      ...metricsByPropertyId[propertyId],
      responseRate,
      responseRateLabel: responseRate == null ? 'New' : `${responseRate}%`,
      averageReplyLabel: responseQuality.averageReplyLabel,
      usuallyRepliesLabel: responseQuality.usuallyRepliesLabel,
    }
  })

  return {
    byPropertyId: metricsByPropertyId,
    totals: buildLeadTotals(metricsByPropertyId),
  }
}

export function buildLeadTotals(metricsByPropertyId = {}) {
  const metrics = Object.values(metricsByPropertyId)
  const responseRates = metrics
    .map((item) => item.responseRate)
    .filter((rate) => rate != null && !Number.isNaN(rate))
  const averageResponseRate = responseRates.length
    ? Math.round(responseRates.reduce((total, rate) => total + rate, 0) / responseRates.length)
    : null

  return {
    views: metrics.reduce((total, item) => total + Number(item.views || 0), 0),
    saves: metrics.reduce((total, item) => total + Number(item.saves || 0), 0),
    chats: metrics.reduce((total, item) => total + Number(item.chats || 0), 0),
    visitRequests: metrics.reduce((total, item) => total + Number(item.visitRequests || 0), 0),
    pendingVisitRequests: metrics.reduce((total, item) => total + Number(item.pendingVisitRequests || 0), 0),
    applications: metrics.reduce((total, item) => total + Number(item.applications || 0), 0),
    pendingApplications: metrics.reduce((total, item) => total + Number(item.pendingApplications || 0), 0),
    responseRate: averageResponseRate,
    responseRateLabel: averageResponseRate == null ? 'New' : `${averageResponseRate}%`,
  }
}
