import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type PushRequest = {
  recipientId?: string
  title?: string
  body?: string
  data?: Record<string, unknown>
}

const PHONE_DEFAULT_SOUND_ID = 'phone_default'
const SILENT_SOUND_ID = 'silent'
const RENTALX_POP_SOUND_ID = 'rentalx_pop'
const RENTALX_POP_SOUND_FILE = 'notification.mp3'
const BRIGHT_CHIME_SOUND_ID = 'bright_chime'
const BRIGHT_CHIME_SOUND_FILE = 'bright_chime.wav'
const CLASSIC_RING_SOUND_ID = 'classic_ring'
const CLASSIC_RING_SOUND_FILE = 'classic_ring.wav'
const IPHONE_NOTIFICATION_SOUND_ID = 'iphone_notification'
const IPHONE_NOTIFICATION_SOUND_FILE = 'iphone_notification.mp3'
const IPHONE_NOTIFICATION_CHANNEL_ID = 'messages_iphone_notification_v2'
const BEST_LOVE_SOUND_ID = 'best_love'
const BEST_LOVE_SOUND_FILE = 'best_love.mp3'
const BEST_LOVE_CALL_CHANNEL_ID = 'calls_best_love_v2'

function getChannelId(type?: string, requestedChannelId?: string) {
  if (typeof requestedChannelId === 'string' && requestedChannelId.trim()) {
    return requestedChannelId
  }

  if (type === 'chat_message') return 'messages'
  if (type === 'incoming_audio_call' || type === 'incoming_video_call') return 'calls'

  if (
    type === 'owner_verification_review_requested'
    || type === 'property_verification_review_requested'
    || type === 'user_report_submitted'
    || type === 'property_report_submitted'
    || type === 'account_deletion_requested'
  ) {
    return 'admin'
  }

  if (
    type === 'offer'
    || type === 'offers'
    || type === 'promotion'
    || type === 'promotional_offer'
    || type === 'announcement'
    || type === 'campaign'
  ) {
    return 'offers'
  }

  return 'activity'
}

function getPreferredSoundConfig(type?: string, soundId?: string | null) {
  const safeSoundId =
    soundId
    || (
      type === 'incoming_audio_call' || type === 'incoming_video_call'
        ? BEST_LOVE_SOUND_ID
        : type === 'chat_message'
          ? IPHONE_NOTIFICATION_SOUND_ID
          : PHONE_DEFAULT_SOUND_ID
    )

  if (type === 'incoming_audio_call' || type === 'incoming_video_call') {
    if (safeSoundId === SILENT_SOUND_ID) {
      return { channelId: 'calls_silent', sound: null }
    }

    if (safeSoundId === RENTALX_POP_SOUND_ID) {
      return { channelId: 'calls_rentalx_pop', sound: RENTALX_POP_SOUND_FILE }
    }

    if (safeSoundId === CLASSIC_RING_SOUND_ID) {
      return { channelId: 'calls_classic_ring', sound: CLASSIC_RING_SOUND_FILE }
    }

    if (safeSoundId === BEST_LOVE_SOUND_ID) {
      return { channelId: BEST_LOVE_CALL_CHANNEL_ID, sound: BEST_LOVE_SOUND_FILE }
    }

    return { channelId: 'calls', sound: 'default' }
  }

  if (type === 'chat_message') {
    if (safeSoundId === SILENT_SOUND_ID) {
      return { channelId: 'messages_silent', sound: null }
    }

    if (safeSoundId === RENTALX_POP_SOUND_ID) {
      return { channelId: 'messages_rentalx_pop', sound: RENTALX_POP_SOUND_FILE }
    }

    if (safeSoundId === BRIGHT_CHIME_SOUND_ID) {
      return { channelId: 'messages_bright_chime', sound: BRIGHT_CHIME_SOUND_FILE }
    }

    if (safeSoundId === IPHONE_NOTIFICATION_SOUND_ID) {
      return { channelId: IPHONE_NOTIFICATION_CHANNEL_ID, sound: IPHONE_NOTIFICATION_SOUND_FILE }
    }

    return { channelId: 'messages', sound: 'default' }
  }

  return null
}

async function resolveRecipientSoundConfig(adminClient: any, payload: PushRequest) {
  const type = typeof payload.data?.type === 'string' ? payload.data.type : undefined
  const conversationId = typeof payload.data?.conversationId === 'string' ? payload.data.conversationId : null

  if (!payload.recipientId || !conversationId || (type !== 'chat_message' && type !== 'incoming_audio_call' && type !== 'incoming_video_call')) {
    return null
  }

  const { data, error } = await adminClient
    .from('chat_sound_preferences')
    .select('notification_sound_id, ringtone_sound_id')
    .eq('user_id', payload.recipientId)
    .eq('conversation_id', conversationId)
    .maybeSingle()

  if (error) {
    console.warn('Chat sound preference lookup failed:', error.message)
    return null
  }

  const soundId =
    type === 'incoming_audio_call' || type === 'incoming_video_call'
      ? data?.ringtone_sound_id
      : data?.notification_sound_id

  return getPreferredSoundConfig(type, soundId)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const authHeader = request.headers.get('Authorization') || ''

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Supabase environment variables are missing.' }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser()

  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }

  let payload: PushRequest

  try {
    payload = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }

  if (!payload.recipientId || !payload.title || !payload.body) {
    return new Response(JSON.stringify({ error: 'recipientId, title, and body are required.' }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: pushTokens, error: tokenError } = await adminClient
    .from('user_push_tokens')
    .select('id, expo_push_token')
    .eq('user_id', payload.recipientId)
    .eq('is_active', true)

  if (tokenError) {
    return new Response(JSON.stringify({ error: tokenError.message }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }

  if (!pushTokens?.length) {
    return new Response(JSON.stringify({ success: true, delivered: 0 }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }

  const soundConfig = await resolveRecipientSoundConfig(adminClient, payload)
  const channelId =
    soundConfig?.channelId ||
    getChannelId(
      typeof payload.data?.type === 'string' ? payload.data.type : undefined,
      typeof payload.data?.channelId === 'string' ? payload.data.channelId : undefined
    )

  const type = typeof payload.data?.type === 'string' ? payload.data.type : undefined
  const isCall = type === 'incoming_audio_call' || type === 'incoming_video_call'
  const callNotificationKey = isCall
    ? String(payload.data?.callId || payload.data?.channelName || `${payload.recipientId}-call`)
    : null

  const messages = pushTokens.map((item) => {
    const message: Record<string, unknown> = {
      to: item.expo_push_token,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      channelId,
      priority: 'high',
    }

    if (isCall) {
      message.ttl = 45
      message.expiration = Math.floor(Date.now() / 1000) + 45
      message.collapseId = callNotificationKey
      message.tag = callNotificationKey
    }

    const sound = soundConfig ? soundConfig.sound : 'default'

    if (sound) {
      message.sound = sound
    }

    return message
  })

  const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  })

  const expoResult = await expoResponse.json()
  const inactiveTokenIds: string[] = []

  if (Array.isArray(expoResult?.data)) {
    expoResult.data.forEach((item: { status?: string; details?: { error?: string } }, index: number) => {
      if (item?.status === 'error' && item?.details?.error === 'DeviceNotRegistered') {
        inactiveTokenIds.push(pushTokens[index].id)
      }
    })
  }

  if (inactiveTokenIds.length > 0) {
    await adminClient
      .from('user_push_tokens')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .in('id', inactiveTokenIds)
  }

  return new Response(JSON.stringify({ success: true, delivered: messages.length, expoResult }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
})
