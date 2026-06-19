import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import * as Device from 'expo-device'
import { supabase } from './supabase'
import { isConversationMuted } from './chatPreferences'
import {
  BEST_LOVE_CALL_CHANNEL_ID,
  BEST_LOVE_SOUND_FILE,
  BRIGHT_CHIME_SOUND_FILE,
  CLASSIC_RING_SOUND_FILE,
  IPHONE_NOTIFICATION_CHANNEL_ID,
  IPHONE_NOTIFICATION_SOUND_FILE,
  PHONE_DEFAULT_SOUND_ID,
  RENTALX_POP_SOUND_FILE,
  SILENT_SOUND_ID,
  getConversationNotificationSoundId,
  getConversationRingtoneSoundId,
} from './sounds'

let warnedAboutExpoGo = false
let warnedAboutPhysicalDevice = false

export const CALL_NOTIFICATION_CATEGORY_ID = 'rentalx_call_actions'
export const CALL_NOTIFICATION_MUTE_ACTION_ID = 'rentalx_call_mute'
export const CALL_NOTIFICATION_DECLINE_ACTION_ID = 'rentalx_call_decline'
export const CALL_NOTIFICATION_ANSWER_ACTION_ID = 'rentalx_call_answer'

const CHAT_NOTIFICATION_TYPES = new Set(['chat_message', 'red_packet_reminder'])
const CALL_NOTIFICATION_TYPES = new Set([
  'incoming_audio_call',
  'incoming_video_call',
])
const OFFER_NOTIFICATION_TYPES = new Set([
  'offer',
  'offers',
  'promotion',
  'promotional_offer',
  'announcement',
  'campaign',
])
const ADMIN_NOTIFICATION_TYPES = new Set([
  'owner_verification_review_requested',
  'property_verification_review_requested',
  'user_report_submitted',
  'property_report_submitted',
  'property_case_appealed',
  'wallet_topup_requested',
  'account_deletion_requested',
])
const SAVED_SEARCH_NOTIFICATION_TYPES = new Set(['saved_search_match'])
const VISIT_REQUEST_OWNER_TYPES = new Set([
  'visit_request_created',
  'visit_request_cancelled',
])
const VISIT_REQUEST_RENTER_TYPES = new Set([
  'visit_request_accepted',
  'visit_request_rejected',
  'visit_request_rescheduled',
])

function getNotificationChannelId(type) {
  if (CHAT_NOTIFICATION_TYPES.has(type)) return 'messages'
  if (CALL_NOTIFICATION_TYPES.has(type)) return 'calls'
  if (OFFER_NOTIFICATION_TYPES.has(type)) return 'offers'
  if (SAVED_SEARCH_NOTIFICATION_TYPES.has(type)) return 'activity'
  if (ADMIN_NOTIFICATION_TYPES.has(type)) return 'admin'
  return 'activity'
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const type = notification?.request?.content?.data?.type
    const conversationId = notification?.request?.content?.data?.conversationId
    const channelId = getNotificationChannelId(type)

    const isChatNotification = CHAT_NOTIFICATION_TYPES.has(type)

    if (isChatNotification && conversationId && (await isConversationMuted(conversationId))) {
      return {
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
        priority: Notifications.AndroidNotificationPriority.MIN,
      }
    }

    const isCallNotification = CALL_NOTIFICATION_TYPES.has(type)
    const messageSoundId =
      isChatNotification
        ? await getConversationNotificationSoundId(conversationId)
        : null
    const ringtoneSoundId =
      isCallNotification
        ? await getConversationRingtoneSoundId(conversationId)
        : null
    const isSilentCall = isCallNotification && ringtoneSoundId === SILENT_SOUND_ID

    return {
      shouldPlaySound:
        (isChatNotification && messageSoundId === PHONE_DEFAULT_SOUND_ID)
        || (isCallNotification && !isSilentCall && ringtoneSoundId === PHONE_DEFAULT_SOUND_ID)
        || type === 'sound_preview'
        || type === 'ringtone_preview',
      shouldSetBadge: true,
      shouldShowBanner: false,
      shouldShowList: true,
      priority:
        channelId === 'messages' || channelId === 'admin' || isCallNotification
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.DEFAULT,
    }
  },
})

export async function ensureAndroidNotificationChannels() {
  if (Platform.OS !== 'android') return

  await Notifications.setNotificationCategoryAsync(CALL_NOTIFICATION_CATEGORY_ID, [
    {
      identifier: CALL_NOTIFICATION_MUTE_ACTION_ID,
      buttonTitle: 'Mute',
      options: {
        opensAppToForeground: true,
      },
    },
    {
      identifier: CALL_NOTIFICATION_DECLINE_ACTION_ID,
      buttonTitle: 'Decline',
      options: {
        isDestructive: true,
        opensAppToForeground: true,
      },
    },
    {
      identifier: CALL_NOTIFICATION_ANSWER_ACTION_ID,
      buttonTitle: 'Answer',
      options: {
        opensAppToForeground: true,
      },
    },
  ])

  const messageAudioAttributes = {
    usage: Notifications.AndroidAudioUsage.NOTIFICATION_COMMUNICATION_INSTANT,
    contentType: Notifications.AndroidAudioContentType.SONIFICATION,
  }
  const callAudioAttributes = {
    usage: Notifications.AndroidAudioUsage.NOTIFICATION_RINGTONE,
    contentType: Notifications.AndroidAudioContentType.SONIFICATION,
  }

  const channels = [
    {
      id: 'default',
      name: 'General',
      description: 'General Rental X updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200, 150, 200],
      lightColor: '#1877F2',
      sound: 'default',
    },
    {
      id: 'activity',
      name: 'Activity',
      description: 'Likes, comments, verification, and account activity',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 220, 180, 220],
      lightColor: '#1877F2',
      sound: 'default',
    },
    {
      id: 'messages',
      name: 'Messages',
      description: 'Direct messages and chat updates',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 200, 250],
      lightColor: '#34C759',
      sound: 'default',
      audioAttributes: messageAudioAttributes,
    },
    {
      id: 'messages_rentalx_pop',
      name: 'Messages - Rental X pop',
      description: 'Direct messages using the Rental X pop sound',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 200, 250],
      lightColor: '#34C759',
      sound: RENTALX_POP_SOUND_FILE,
      audioAttributes: messageAudioAttributes,
    },
    {
      id: 'messages_bright_chime',
      name: 'Messages - Bright chime',
      description: 'Direct messages using the bright chime sound',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 180, 80, 180],
      lightColor: '#34C759',
      sound: BRIGHT_CHIME_SOUND_FILE,
      audioAttributes: messageAudioAttributes,
    },
    {
      id: IPHONE_NOTIFICATION_CHANNEL_ID,
      name: 'Messages - iPhone notification',
      description: 'Direct messages using the uploaded iPhone notification sound',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 180, 80, 180],
      lightColor: '#34C759',
      sound: IPHONE_NOTIFICATION_SOUND_FILE,
      audioAttributes: messageAudioAttributes,
    },
    {
      id: 'messages_silent',
      name: 'Messages - silent',
      description: 'Direct messages with no notification sound',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 160],
      lightColor: '#34C759',
      sound: null,
    },
    {
      id: 'calls',
      name: 'Calls',
      description: 'Incoming audio and video calls',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 320, 180, 320, 180, 320],
      lightColor: '#22c55e',
      sound: 'default',
      audioAttributes: callAudioAttributes,
    },
    {
      id: 'calls_rentalx_pop',
      name: 'Calls - Rental X ring',
      description: 'Incoming audio and video calls using the Rental X tone',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 320, 180, 320, 180, 320],
      lightColor: '#22c55e',
      sound: RENTALX_POP_SOUND_FILE,
      audioAttributes: callAudioAttributes,
    },
    {
      id: 'calls_classic_ring',
      name: 'Calls - Classic ring',
      description: 'Incoming audio and video calls using the classic ring tone',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 360, 160, 360, 420, 360],
      lightColor: '#22c55e',
      sound: CLASSIC_RING_SOUND_FILE,
      audioAttributes: callAudioAttributes,
    },
    {
      id: BEST_LOVE_CALL_CHANNEL_ID,
      name: 'Calls - Best Love',
      description: 'Incoming audio and video calls using the uploaded Best Love ringtone',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 360, 160, 360, 420, 360],
      lightColor: '#22c55e',
      sound: BEST_LOVE_SOUND_FILE,
      audioAttributes: callAudioAttributes,
    },
    {
      id: 'calls_silent',
      name: 'Calls - silent',
      description: 'Incoming audio and video calls with no notification sound',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 320, 180],
      lightColor: '#22c55e',
      sound: null,
      audioAttributes: callAudioAttributes,
    },
    {
      id: 'offers',
      name: 'Offers',
      description: 'Offers, promotions, and special announcements',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: '#F59E0B',
      sound: 'default',
    },
    {
      id: 'admin',
      name: 'Admin reviews',
      description: 'Urgent moderation and verification review requests',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 280, 180, 280],
      lightColor: '#EF4444',
      sound: 'default',
    },
  ]

  await Promise.all(
    channels.map((channel) => {
      const channelConfig = {
        name: channel.name,
        description: channel.description,
        importance: channel.importance,
        vibrationPattern: channel.vibrationPattern,
        lightColor: channel.lightColor,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
        sound: channel.sound,
      }

      if (channel.audioAttributes) {
        channelConfig.audioAttributes = channel.audioAttributes
      }

      return Notifications.setNotificationChannelAsync(channel.id, channelConfig)
    })
  )
}

function getProjectId() {
  return Constants?.expoConfig?.extra?.eas?.projectId || Constants?.easConfig?.projectId || null
}

function supportsRemotePushNotifications() {
  return Constants.executionEnvironment !== 'storeClient'
}

function warnExpoGoPushLimitation() {
  if (warnedAboutExpoGo) return

  warnedAboutExpoGo = true
  console.warn(
    'Remote push notifications require a development build or production app. Expo Go can still be used for the rest of the app.'
  )
}

function warnPhysicalDeviceRequirement() {
  if (warnedAboutPhysicalDevice) return

  warnedAboutPhysicalDevice = true
  console.warn('Remote push notifications require a physical device.')
}

async function getFunctionErrorMessage(error) {
  const fallback = error?.message || 'Push notification request failed.'
  const response = error?.context

  if (!response || typeof response.clone !== 'function') {
    return fallback
  }

  try {
    const payload = await response.clone().json()
    return payload?.error || payload?.message || fallback
  } catch (_error) {
    return fallback
  }
}

async function invokePushFunction(body, allowAuthRetry = true) {
  const { data, error } = await supabase.functions.invoke('send-push-notification', {
    body,
  })

  if (!error && data?.success !== false) {
    return data || { success: true }
  }

  const status = error?.context?.status

  if (allowAuthRetry && status === 401) {
    const { error: refreshError } = await supabase.auth.refreshSession()

    if (!refreshError) {
      return invokePushFunction(body, false)
    }
  }

  throw new Error(
    error
      ? await getFunctionErrorMessage(error)
      : data?.error || 'Push notification request failed.'
  )
}

async function getCurrentExpoPushToken() {
  if (!supportsRemotePushNotifications()) {
    warnExpoGoPushLimitation()
    return null
  }

  if (!Device.isDevice) {
    warnPhysicalDeviceRequirement()
    return null
  }

  await ensureAndroidNotificationChannels()

  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    return null
  }

  const projectId = getProjectId()

  if (!projectId) {
    throw new Error('Expo project ID is missing for push notifications.')
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId })
  return tokenResponse.data || null
}

export async function registerDevicePushToken(userId) {
  if (!userId) return null

  try {
    if (!supportsRemotePushNotifications()) {
      warnExpoGoPushLimitation()
      return null
    }

    const expoPushToken = await getCurrentExpoPushToken()

    if (!expoPushToken) return null

    await invokePushFunction({
      action: 'register_device',
      expoPushToken,
      platform: Platform.OS,
    })

    return expoPushToken
  } catch (error) {
    console.warn('Push notification setup failed:', error?.message || error)
    return null
  }
}

export async function deactivateDevicePushToken() {
  try {
    if (!supportsRemotePushNotifications()) {
      return
    }

    const { status } = await Notifications.getPermissionsAsync()

    if (status !== 'granted') return

    const projectId = getProjectId()

    if (!projectId) return

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId })
    const expoPushToken = tokenResponse.data

    if (!expoPushToken) return

    await invokePushFunction({
      action: 'deactivate_device',
      expoPushToken,
      platform: Platform.OS,
    })
  } catch (error) {
    console.warn('Push token deactivation failed:', error?.message || error)
  }
}

export function canUseRemotePushNotifications() {
  return supportsRemotePushNotifications()
}

export async function sendPushToUser({ recipientId, title, body, data }) {
  if (!recipientId) {
    return { success: false, delivered: 0, error: 'A recipient is required.' }
  }

  try {
    const type = data?.type

    const result = await invokePushFunction({
      action: 'send',
      recipientId,
      title,
      body,
      data: {
        ...(data || {}),
        channelId: data?.channelId || getNotificationChannelId(type),
      },
    })

    if (!result?.delivered) {
      console.warn(
        'Push notification was not delivered:',
        result?.warning || result?.error || 'The recipient has no active push-enabled device.'
      )
    }

    return result
  } catch (error) {
    console.warn('Push notification send failed:', error?.message || error)
    return {
      success: false,
      delivered: 0,
      error: error?.message || 'Push notification send failed.',
    }
  }
}

export function buildPropertyNotificationPayload(property) {
  if (!property?.id) return null

  return {
    id: String(property.id),
    title: property.title || '',
  }
}

export function routeFromNotificationData(navigation, payload = {}) {
  const type = payload.type
  const property = payload.propertyId
    ? {
      id: String(payload.propertyId),
      title: payload.propertyTitle || '',
    }
    : null

  if (CALL_NOTIFICATION_TYPES.has(type) && payload.actorId) {
    navigation.navigate(type === 'incoming_video_call' ? 'VideoCall' : 'AudioCall', {
      participant: {
        id: payload.actorId,
        name: payload.actorName || 'Rental X member',
        avatar_url: payload.actorAvatarUrl || null,
        is_verified: Boolean(payload.actorVerified),
      },
      property,
      conversationId: payload.conversationId || null,
      callId: payload.callId || null,
      channelName: payload.channelName || null,
      startedByMe: false,
    })
    return
  }

  if (type === 'chat_message' && payload.isGroup && payload.conversationId) {
    navigation.navigate('MainTabs', {
      screen: 'Chat',
      params: {
        conversationId: payload.conversationId,
      },
    })
    return
  }

  if (type === 'chat_message' && payload.actorId) {
    navigation.navigate('MainTabs', {
      screen: 'Chat',
      params: {
        participant: {
          id: payload.actorId,
          name: payload.actorName || 'Rental X member',
          avatar_url: payload.actorAvatarUrl || null,
          is_verified: Boolean(payload.actorVerified),
        },
        property,
      },
    })
    return
  }

  if (['property_comment', 'comment_reply', 'comment_like'].includes(type) && property?.id) {
    navigation.navigate('MainTabs', {
      screen: 'Home',
      params: {
        openCommentsForPostId: property.id,
        openCommentsForPost: property,
        openCommentsTargetCommentId: payload.commentId || null,
        openCommentsRequestId:
          payload.requestId ||
          `push-${type}-${property.id}-${payload.commentId || ''}-${payload.createdAt || Date.now()}`,
      },
    })
    return
  }

  if (VISIT_REQUEST_OWNER_TYPES.has(type)) {
    navigation.navigate('VisitRequests')
    return
  }

  if (VISIT_REQUEST_RENTER_TYPES.has(type)) {
    if (property?.id) {
      navigation.navigate('Property', { property })
      return
    }

    navigation.navigate('MainTabs', { screen: 'Home' })
    return
  }

  if (type === 'saved_search_match') {
    if (property?.id) {
      navigation.navigate('Property', { property })
      return
    }

    navigation.navigate('MainTabs', { screen: 'Home' })
    return
  }

  if (type === 'owner_verification_rejected') {
    navigation.navigate('VerificationCenter')
    return
  }

  if (type === 'owner_verification_review_requested' || type === 'property_verification_review_requested') {
    navigation.navigate('ReviewVerify')
    return
  }

  if (type === 'user_report_submitted' || type === 'property_report_submitted') {
    navigation.navigate('AdminReports')
    return
  }

  if (type === 'property_case_appealed') {
    navigation.navigate('AdminReports')
    return
  }

  if (type === 'wallet_topup_requested') {
    navigation.navigate('AdminWallet')
    return
  }

  if (type === 'account_deletion_requested') {
    navigation.navigate('AdminAccountDeletion')
    return
  }

  if (type === 'account_deletion_rejected') {
    navigation.navigate('MainTabs', { screen: 'Profile' })
    return
  }

  if (type === 'wallet_topup_approved' || type === 'wallet_topup_rejected') {
    navigation.navigate('Wallet')
    return
  }

  if (type === 'owner_verification_approved') {
    navigation.navigate('VerificationCenter')
    return
  }

  if (type === 'property_verification_rejected') {
    if (property?.id) {
      navigation.navigate('Property', { property })
      return
    }

    navigation.navigate('VerificationCenter')
    return
  }

  if (type === 'property_verification_approved') {
    if (property?.id) {
      navigation.navigate('Property', { property })
      return
    }

    navigation.navigate('VerificationCenter')
    return
  }

  if (type === 'property_banned_by_admin') {
    navigation.navigate('CustomerCare', {
      property: property
        ? {
            ...property,
            location: payload.propertyLocation || '',
            price: payload.propertyPrice || '',
            admin_ban_reason: payload.banReason || '',
          }
        : null,
      notification: {
        title: payload.propertyTitle || 'Ad hidden by admin',
        body: payload.banReason || 'Your ad was hidden from live feeds.',
      },
    })
    return
  }

  if (type === 'customer_care_case_updated') {
    navigation.navigate('CustomerCare', {
      property: property
        ? {
            ...property,
            location: payload.propertyLocation || '',
            price: payload.propertyPrice || '',
            admin_ban_reason: payload.banReason || '',
          }
        : null,
      notification: {
        title: payload.propertyTitle || 'Customer care case updated',
        body: payload.banReason || 'Admin replied to your customer care case.',
      },
    })
    return
  }

  if (property?.id) {
    navigation.navigate('Property', { property })
    return
  }

  if (payload.actorId) {
    navigation.navigate('OwnerProfile', {
      owner: {
        id: payload.actorId,
        name: payload.actorName || 'Rental X member',
      },
    })
  }
}
