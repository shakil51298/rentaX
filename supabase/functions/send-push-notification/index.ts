import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type PushRequest = {
  action?: 'send' | 'register_device' | 'deactivate_device'
  recipientId?: string
  title?: string
  body?: string
  data?: Record<string, unknown>
  expoPushToken?: string
  platform?: string
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
const CALL_NOTIFICATION_CATEGORY_ID = 'rentalx_call_actions'
const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function isValidExpoPushToken(value?: string) {
  return typeof value === 'string'
    && /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(value.trim())
}

async function deactivateTokensFromReceipts(
  adminClient: any,
  receiptTargets: Array<{ receiptId: string; tokenId: string }>,
) {
  if (!receiptTargets.length) return

  try {
    await new Promise((resolve) => setTimeout(resolve, 10000))

    const response = await fetch(EXPO_PUSH_RECEIPTS_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ids: receiptTargets.map((item) => item.receiptId),
      }),
    })

    if (!response.ok) {
      console.warn(`Expo push receipt request failed (${response.status}).`)
      return
    }

    const result = await response.json()
    const receiptMap = result?.data || {}
    const inactiveTokenIds = receiptTargets
      .filter((item) => receiptMap[item.receiptId]?.details?.error === 'DeviceNotRegistered')
      .map((item) => item.tokenId)

    if (!inactiveTokenIds.length) return

    const { error } = await adminClient
      .from('user_push_tokens')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .in('id', inactiveTokenIds)

    if (error) {
      console.warn('Push receipt cleanup failed:', error.message)
    }
  } catch (error) {
    console.warn('Push receipt processing failed:', error instanceof Error ? error.message : error)
  }
}

function getChannelId(type?: string, requestedChannelId?: string) {
  if (typeof requestedChannelId === 'string' && requestedChannelId.trim()) {
    return requestedChannelId
  }

  if (type === 'chat_message' || type === 'red_packet_reminder') return 'messages'
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
        : type === 'chat_message' || type === 'red_packet_reminder'
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

  if (type === 'chat_message' || type === 'red_packet_reminder') {
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

  if (
    !payload.recipientId
    || !conversationId
    || (
      type !== 'chat_message'
      && type !== 'red_packet_reminder'
      && type !== 'incoming_audio_call'
      && type !== 'incoming_video_call'
    )
  ) {
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
    return jsonResponse({ success: false, error: 'Supabase environment variables are missing.' }, 500)
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
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401)
  }

  let payload: PushRequest

  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ success: false, error: 'Invalid request body.' }, 400)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  if (payload.action === 'register_device') {
    if (!isValidExpoPushToken(payload.expoPushToken)) {
      return jsonResponse({ success: false, error: 'A valid Expo push token is required.' }, 400)
    }

    const timestamp = new Date().toISOString()
    const { error } = await adminClient
      .from('user_push_tokens')
      .upsert(
        {
          user_id: user.id,
          expo_push_token: payload.expoPushToken?.trim(),
          platform: payload.platform === 'ios' ? 'ios' : 'android',
          is_active: true,
          last_registered_at: timestamp,
          updated_at: timestamp,
        },
        { onConflict: 'expo_push_token' },
      )

    if (error) {
      return jsonResponse({ success: false, error: error.message }, 400)
    }

    return jsonResponse({ success: true, registered: true })
  }

  if (payload.action === 'deactivate_device') {
    if (!isValidExpoPushToken(payload.expoPushToken)) {
      return jsonResponse({ success: false, error: 'A valid Expo push token is required.' }, 400)
    }

    const { error } = await adminClient
      .from('user_push_tokens')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('expo_push_token', payload.expoPushToken?.trim())

    if (error) {
      return jsonResponse({ success: false, error: error.message }, 400)
    }

    return jsonResponse({ success: true, deactivated: true })
  }

  if (!payload.recipientId || !payload.title || !payload.body) {
    return jsonResponse({ success: false, error: 'recipientId, title, and body are required.' }, 400)
  }

  const { data: pushTokens, error: tokenError } = await adminClient
    .from('user_push_tokens')
    .select('id, expo_push_token')
    .eq('user_id', payload.recipientId)
    .eq('is_active', true)

  if (tokenError) {
    return jsonResponse({ success: false, error: tokenError.message }, 400)
  }

  if (!pushTokens?.length) {
    return jsonResponse({
      success: true,
      delivered: 0,
      warning: 'The recipient has no active push-enabled device.',
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
      message.categoryIdentifier = CALL_NOTIFICATION_CATEGORY_ID
      message.sticky = true
      message.autoDismiss = false
      message.data = {
        ...(payload.data || {}),
        categoryId: CALL_NOTIFICATION_CATEGORY_ID,
        sticky: 'true',
        autoDismiss: 'false',
      }
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

  const expoResult = await expoResponse.json().catch(() => ({}))

  if (!expoResponse.ok) {
    return jsonResponse({
      success: false,
      delivered: 0,
      error:
        expoResult?.errors?.[0]?.message
        || `Expo push service failed (${expoResponse.status}).`,
      expoResult,
    }, 502)
  }

  const inactiveTokenIds: string[] = []
  const receiptTargets: Array<{ receiptId: string; tokenId: string }> = []

  if (Array.isArray(expoResult?.data)) {
    expoResult.data.forEach((item: { id?: string; status?: string; details?: { error?: string } }, index: number) => {
      if (item?.status === 'error' && item?.details?.error === 'DeviceNotRegistered') {
        inactiveTokenIds.push(pushTokens[index].id)
      }

      if (item?.status === 'ok' && item?.id) {
        receiptTargets.push({
          receiptId: item.id,
          tokenId: pushTokens[index].id,
        })
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

  if (receiptTargets.length) {
    EdgeRuntime.waitUntil(deactivateTokensFromReceipts(adminClient, receiptTargets))
  }

  const acceptedCount = Array.isArray(expoResult?.data)
    ? expoResult.data.filter((item: { status?: string }) => item?.status === 'ok').length
    : 0

  return jsonResponse({
    success: acceptedCount > 0,
    delivered: acceptedCount,
    attempted: messages.length,
    error:
      acceptedCount > 0
        ? null
        : expoResult?.data?.[0]?.message || 'Expo rejected every push notification.',
    expoResult,
  }, acceptedCount > 0 ? 200 : 502)
})
