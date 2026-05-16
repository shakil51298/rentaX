import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatLastSeen } from '../lib/chatUtils'

function isMissingRelation(error) {
  return error?.code === '42P01'
}

export default function useChatPresence({
  currentUserId,
  mode,
  conversationId,
  otherUserId,
}) {
  const [otherPresence, setOtherPresence] = useState(null)
  const [presenceByUserId, setPresenceByUserId] = useState({})

  const updateMyPresence = useCallback(async ({ online = true, typing = false } = {}) => {
    if (!currentUserId) return

    const { error } = await supabase.from('user_presence').upsert({
      user_id: currentUserId,
      is_online: online,
      last_seen_at: new Date().toISOString(),
      typing_conversation_id: typing ? conversationId : null,
      typing_to_user_id: typing ? otherUserId : null,
      typing_updated_at: typing ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })

    if (error && !isMissingRelation(error)) {
      console.log('Presence update error:', error.message)
    }
  }, [conversationId, currentUserId, otherUserId])

  const getChatStatusText = useCallback(() => {
    const typingFresh =
      otherPresence?.typing_conversation_id === conversationId &&
      otherPresence?.typing_to_user_id === currentUserId &&
      otherPresence?.typing_updated_at &&
      Date.now() - new Date(otherPresence.typing_updated_at).getTime() < 5000

    if (typingFresh) return 'typing...'
    if (otherPresence?.is_online) return 'Online'

    return formatLastSeen(otherPresence?.last_seen_at)
  }, [conversationId, currentUserId, otherPresence])

  useEffect(() => {
    if (!currentUserId) return undefined

    updateMyPresence({ online: true })

    const interval = setInterval(() => {
      updateMyPresence({ online: true })
    }, 30000)

    return () => {
      clearInterval(interval)
      updateMyPresence({ online: false, typing: false })
    }
  }, [currentUserId, updateMyPresence])

  useEffect(() => {
    if (mode !== 'list' || !currentUserId) return undefined

    const channel = supabase
      .channel(`message-list-presence-${currentUserId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
        },
        (payload) => {
          const row = payload.new
          if (!row?.user_id) return

          setPresenceByUserId((previous) => ({
            ...previous,
            [row.user_id]: row,
          }))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId, mode])

  useEffect(() => {
    if (!otherUserId || mode !== 'chat') {
      setOtherPresence(null)
      return undefined
    }

    const loadOtherPresence = async () => {
      const { data, error } = await supabase
        .from('user_presence')
        .select('*')
        .eq('user_id', otherUserId)
        .maybeSingle()

      if (!error) {
        setOtherPresence(data)
      } else if (!isMissingRelation(error)) {
        console.log('Presence load error:', error.message)
      }
    }

    loadOtherPresence()

    const channel = supabase
      .channel(`presence-${otherUserId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
          filter: `user_id=eq.${otherUserId}`,
        },
        (payload) => {
          setOtherPresence(payload.new)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [mode, otherUserId])

  return {
    otherPresence,
    presenceByUserId,
    setPresenceByUserId,
    updateMyPresence,
    getChatStatusText,
  }
}
