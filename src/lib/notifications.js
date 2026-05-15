import { supabase } from './supabase'

export async function getUnreadNotificationCount(userId) {
  if (!userId) return 0

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
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
}) {
  if (!recipientId || !actorId || String(recipientId) === String(actorId)) {
    return
  }

  await supabase.from('notifications').upsert(
    {
      recipient_id: recipientId,
      actor_id: actorId,
      type,
      property_id: propertyId ? String(propertyId) : null,
      comment_id: commentId ? String(commentId) : null,
      title,
      body,
      event_key:
        eventKey ||
        `${type}:${recipientId}:${actorId}:${propertyId || ''}:${commentId || ''}`,
      is_read: false,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'event_key' }
  )
}
