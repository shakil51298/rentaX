import Constants from 'expo-constants'
import { NativeModules } from 'react-native'
import { supabase } from './supabase'
import { formatDurationSeconds } from './chatUtils'
import { sendPushToUser } from './pushNotifications'
import { getUserAvatarUrl } from './userDisplay'
import { supabaseAnonKey } from './supabase'

let cachedAgoraModule = undefined
let activeAgoraEngine = null

function getExpoExtra() {
  return Constants?.expoConfig?.extra || {}
}

export function loadAgoraModule() {
  if (cachedAgoraModule !== undefined) {
    return cachedAgoraModule
  }

  try {
    cachedAgoraModule = require('react-native-agora')
    return cachedAgoraModule
  } catch (_error) {
    cachedAgoraModule = null
    return null
  }
}

export function canUseAgoraNativeModule() {
  if (Constants.executionEnvironment === 'storeClient') {
    return false
  }

  const possibleNativeModules = [
    NativeModules.AgoraRtcNg,
    NativeModules.AgoraRtcEngineModule,
    NativeModules.AgoraRtcEngine,
  ]

  return possibleNativeModules.some(Boolean)
}

export function replaceActiveAgoraEngine(nextEngine) {
  if (activeAgoraEngine && activeAgoraEngine !== nextEngine) {
    try {
      activeAgoraEngine.removeAllListeners?.()
      activeAgoraEngine.leaveChannel?.()
      activeAgoraEngine.stopPreview?.()
      activeAgoraEngine.release?.()
    } catch (error) {
      console.warn('Previous Agora engine cleanup failed:', error?.message || error)
    }
  }

  activeAgoraEngine = nextEngine || null
}

export function clearActiveAgoraEngine(engine) {
  if (engine && activeAgoraEngine === engine) {
    activeAgoraEngine = null
  }
}

export function getAgoraRuntimeConfig() {
  const extra = getExpoExtra()
  const agora = extra?.agora || {}

  return {
    appId:
      agora.appId ||
      process.env.EXPO_PUBLIC_AGORA_APP_ID ||
      null,
    tokenServerUrl:
      agora.tokenServerUrl ||
      process.env.EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL ||
      null,
    tempToken:
      agora.tempToken ||
      process.env.EXPO_PUBLIC_AGORA_TEMP_TOKEN ||
      null,
  }
}

export function isAgoraConfigured() {
  return Boolean(getAgoraRuntimeConfig().appId)
}

export function hashAgoraUid(value) {
  const text = String(value || '')

  if (!text) return 1

  let hash = 0

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }

  return (hash % 2147483000) + 1
}

export function createAgoraCallId(prefix = 'call') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function buildAgoraChannelName({
  conversationId,
  callId,
  callerId,
  recipientId,
  kind,
}) {
  const raw = [
    'rentalx',
    kind || 'call',
    conversationId || `${callerId || 'user'}-${recipientId || 'member'}`,
    callId || 'live',
  ]
    .join('-')
    .replace(/[^a-zA-Z0-9_-]/g, '-')

  return raw.slice(0, 62)
}

export async function resolveAgoraToken({
  channelName,
  uid,
  callKind,
}) {
  const { tokenServerUrl, tempToken } = getAgoraRuntimeConfig()

  if (tokenServerUrl) {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const response = await fetch(tokenServerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(supabaseAnonKey ? { apikey: supabaseAnonKey } : {}),
        ...(session?.access_token
          ? {
              Authorization: `Bearer ${session.access_token}`,
            }
          : {}),
      },
      body: JSON.stringify({
        channelName,
        uid,
        callKind,
        role: 'publisher',
      }),
    })

    if (!response.ok) {
      throw new Error(`Agora token server failed (${response.status}).`)
    }

    const payload = await response.json()
    const token = payload?.token || payload?.rtcToken || payload?.data?.token || null

    if (!token) {
      throw new Error('Agora token server did not return a token.')
    }

    return token
  }

  return tempToken || ''
}

export async function sendAgoraCallInvite({
  callKind,
  caller,
  recipientId,
  property,
  conversationId,
  callId,
  channelName,
}) {
  if (!recipientId || !caller?.id) return

  const type = callKind === 'video' ? 'incoming_video_call' : 'incoming_audio_call'
  const title = `${caller.display_name || caller.name || 'Rental X member'} is calling`
  const body =
    callKind === 'video'
      ? 'Tap to join the video call.'
      : 'Tap to join the audio call.'

  await sendPushToUser({
    recipientId,
    title,
    body,
    data: {
      type,
      actorId: caller.id,
      actorName: caller.display_name || caller.name || 'Rental X member',
      actorAvatarUrl: getUserAvatarUrl(caller),
      actorVerified: Boolean(caller.is_verified),
      propertyId: property?.id ? String(property.id) : null,
      propertyTitle: property?.title || '',
      conversationId: conversationId || null,
      callId,
      channelName,
      callKind,
      createdAt: new Date().toISOString(),
    },
  })
}

export function buildCallHistoryContent({
  callKind,
  callStatus,
  startedByMe,
  durationSeconds,
}) {
  const mediaLabel = callKind === 'video' ? 'video call' : 'audio call'

  if (callStatus === 'completed') {
    return {
      body: `${startedByMe ? 'Outgoing' : 'Incoming'} ${mediaLabel}`,
      lastMessage: `${callKind === 'video' ? 'Video' : 'Audio'} call • ${formatDurationSeconds(durationSeconds)}`,
    }
  }

  return {
    body: startedByMe
      ? `Outgoing ${mediaLabel} cancelled`
      : `Missed ${mediaLabel}`,
    lastMessage: startedByMe
      ? `Cancelled ${mediaLabel}`
      : `Missed ${mediaLabel}`,
  }
}

export async function saveAgoraCallHistory({
  conversationId,
  participantId,
  currentUserId,
  callKind,
  callStatus,
  durationSeconds,
  startedByMe,
}) {
  if (!conversationId || !participantId || !currentUserId) return

  const createdAt = new Date().toISOString()
  const { body, lastMessage } = buildCallHistoryContent({
    callKind,
    callStatus,
    startedByMe,
    durationSeconds,
  })

  const { error: messageError } = await supabase.from('chat_messages').insert({
    conversation_id: conversationId,
    sender_id: currentUserId,
    receiver_id: participantId,
    body,
    message_type: 'call',
    call_kind: callKind,
    call_status: callStatus,
    call_duration_seconds: durationSeconds,
    created_at: createdAt,
    updated_at: createdAt,
  })

  if (messageError) {
    throw messageError
  }

  const { error: conversationError } = await supabase
    .from('chat_conversations')
    .update({
      last_message: lastMessage,
      last_message_type: 'call',
      last_message_at: createdAt,
      last_sender_id: currentUserId,
      updated_at: createdAt,
    })
    .eq('id', conversationId)

  if (conversationError) {
    throw conversationError
  }
}
