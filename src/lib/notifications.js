import { supabase } from './supabase'
import { sendPushToUser } from './pushNotifications'

export async function getUnreadNotificationCount(userId) {
  if (!userId) return 0

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .neq('type', 'chat_message')
    .eq('is_read', false)

  if (error) return 0

  return count || 0
}

export async function createNotification({
  recipientId,
  actorId,
  type,
  propertyId,
  commentId,
  title,
  body,
  eventKey,
  pushTitle,
  pushBody,
  pushData,
  skipPush = false,
}) {
  if (!recipientId || !actorId || String(recipientId) === String(actorId)) {
    return { skipped: true }
  }

  const createdAt = new Date().toISOString()
  const notificationEventKey =
    eventKey ||
    `${type}:${recipientId}:${actorId}:${propertyId || ''}:${commentId || ''}`

  const { error } = await supabase.from('notifications').upsert(
    {
      recipient_id: recipientId,
      actor_id: actorId,
      type,
      property_id: propertyId ? String(propertyId) : null,
      comment_id: commentId ? String(commentId) : null,
      title,
      body,
      event_key: notificationEventKey,
      is_read: false,
      created_at: createdAt,
    },
    { onConflict: 'event_key' }
  )

  if (error) {
    console.warn('Notification write failed:', error.message)
    throw error
  }

  if (!skipPush) {
    await sendPushToUser({
      recipientId,
      title: pushTitle || title || 'Rental X',
      body: pushBody || body || 'You have a new update.',
      data: {
        type,
        actorId,
        propertyId: propertyId ? String(propertyId) : null,
        commentId: commentId ? String(commentId) : null,
        createdAt,
        eventKey: notificationEventKey,
        ...(pushData || {}),
      },
    })
  }

  return { skipped: false }
}
