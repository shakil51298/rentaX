import { supabase } from './supabase'

const MAX_RESPONSE_MESSAGES = 500

export function getEmptyOwnerResponseQuality() {
  return {
    inboundCount: 0,
    respondedCount: 0,
    responseRate: null,
    averageReplyMinutes: null,
    averageReplyLabel: 'No replies yet',
    usuallyRepliesLabel: 'No reply history yet',
    sampledMessageCount: 0,
  }
}

function getCounterpartId(message, ownerId) {
  if (String(message.sender_id) === String(ownerId)) {
    return message.receiver_id
  }

  if (String(message.receiver_id) === String(ownerId)) {
    return message.sender_id
  }

  return null
}

export function formatAverageReplyTime(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return 'No replies yet'

  const safeMinutes = Math.max(Math.round(minutes), 0)

  if (safeMinutes <= 1) return '< 1 min'
  if (safeMinutes < 60) return `${safeMinutes} min`

  const hours = Math.floor(safeMinutes / 60)
  const remainingMinutes = safeMinutes % 60

  if (hours < 24) {
    return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`
  }

  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24

  return remainingHours ? `${days} d ${remainingHours} hr` : `${days} d`
}

export function getUsuallyRepliesLabel(minutes, respondedCount) {
  if (!respondedCount || minutes == null || Number.isNaN(minutes)) {
    return 'No reply history yet'
  }

  if (minutes <= 60) return 'Usually replies within 1 hour'
  if (minutes <= 180) return 'Usually replies within 3 hours'
  if (minutes <= 720) return 'Usually replies within 12 hours'
  if (minutes <= 1440) return 'Usually replies within 1 day'
  if (minutes <= 2880) return 'Usually replies within 2 days'
  return 'Usually replies within a few days'
}

export function computeOwnerResponseQuality(messages = [], ownerId) {
  if (!ownerId || !Array.isArray(messages) || !messages.length) {
    return getEmptyOwnerResponseQuality()
  }

  const pendingByCounterpart = new Map()
  let inboundCount = 0
  let respondedCount = 0
  let totalReplyMinutes = 0

  const sortedMessages = [...messages]
    .filter((message) => {
      const senderMatches = String(message.sender_id) === String(ownerId)
      const receiverMatches = String(message.receiver_id) === String(ownerId)
      return senderMatches || receiverMatches
    })
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())

  for (const message of sortedMessages) {
    const counterpartId = getCounterpartId(message, ownerId)

    if (!counterpartId) continue

    const isIncoming = String(message.receiver_id) === String(ownerId)
    const pendingAt = pendingByCounterpart.get(counterpartId) || null

    if (isIncoming) {
      if (!pendingAt) {
        inboundCount += 1
        pendingByCounterpart.set(counterpartId, message.created_at)
      }
      continue
    }

    if (!pendingAt) continue

    const replyMinutes =
      (new Date(message.created_at).getTime() - new Date(pendingAt).getTime()) / 60000

    if (Number.isFinite(replyMinutes) && replyMinutes >= 0) {
      respondedCount += 1
      totalReplyMinutes += replyMinutes
    }

    pendingByCounterpart.delete(counterpartId)
  }

  const averageReplyMinutes = respondedCount ? totalReplyMinutes / respondedCount : null
  const responseRate = inboundCount ? Math.round((respondedCount / inboundCount) * 100) : null

  return {
    inboundCount,
    respondedCount,
    responseRate,
    averageReplyMinutes,
    averageReplyLabel: formatAverageReplyTime(averageReplyMinutes),
    usuallyRepliesLabel: getUsuallyRepliesLabel(averageReplyMinutes, respondedCount),
    sampledMessageCount: sortedMessages.length,
  }
}

export async function fetchOwnerResponseQuality(ownerId) {
  if (!ownerId) {
    return getEmptyOwnerResponseQuality()
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .select('sender_id, receiver_id, created_at')
    .or(`sender_id.eq.${ownerId},receiver_id.eq.${ownerId}`)
    .order('created_at', { ascending: false })
    .limit(MAX_RESPONSE_MESSAGES)

  if (error) {
    throw error
  }

  return computeOwnerResponseQuality(data || [], ownerId)
}

export function formatJoinedDate(date) {
  if (!date) return 'Not available'

  return new Date(date).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
