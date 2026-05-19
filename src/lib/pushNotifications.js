import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { supabase } from './supabase'

let warnedAboutExpoGo = false

const CHAT_NOTIFICATION_TYPES = new Set(['chat_message'])
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
  if (OFFER_NOTIFICATION_TYPES.has(type)) return 'offers'
  if (SAVED_SEARCH_NOTIFICATION_TYPES.has(type)) return 'activity'
  if (ADMIN_NOTIFICATION_TYPES.has(type)) return 'admin'
  return 'activity'
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const type = notification?.request?.content?.data?.type
    const channelId = getNotificationChannelId(type)

    return {
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
      priority:
        channelId === 'messages' || channelId === 'admin'
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.DEFAULT,
    }
  },
})

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return

  const channels = [
    {
      id: 'default',
      name: 'General',
      description: 'General Rental X updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200, 150, 200],
      lightColor: '#1877F2',
    },
    {
      id: 'activity',
      name: 'Activity',
      description: 'Likes, comments, verification, and account activity',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 220, 180, 220],
      lightColor: '#1877F2',
    },
    {
      id: 'messages',
      name: 'Messages',
      description: 'Direct messages and chat updates',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 200, 250],
      lightColor: '#34C759',
    },
    {
      id: 'offers',
      name: 'Offers',
      description: 'Offers, promotions, and special announcements',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: '#F59E0B',
    },
    {
      id: 'admin',
      name: 'Admin reviews',
      description: 'Urgent moderation and verification review requests',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 280, 180, 280],
      lightColor: '#EF4444',
    },
  ]

  await Promise.all(
    channels.map((channel) =>
      Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        description: channel.description,
        importance: channel.importance,
        vibrationPattern: channel.vibrationPattern,
        lightColor: channel.lightColor,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
        sound: 'default',
      })
    )
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

async function getCurrentExpoPushToken() {
  if (!supportsRemotePushNotifications()) {
    warnExpoGoPushLimitation()
    return null
  }

  await ensureAndroidChannel()

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

    const timestamp = new Date().toISOString()

    const { error } = await supabase.from('user_push_tokens').upsert(
      {
        user_id: userId,
        expo_push_token: expoPushToken,
        platform: Platform.OS,
        is_active: true,
        last_registered_at: timestamp,
        updated_at: timestamp,
      },
      { onConflict: 'expo_push_token' }
    )

    if (error) {
      console.warn('Push token registration failed:', error.message)
      return null
    }

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

    await supabase
      .from('user_push_tokens')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('expo_push_token', expoPushToken)
  } catch (error) {
    console.warn('Push token deactivation failed:', error?.message || error)
  }
}

export function canUseRemotePushNotifications() {
  return supportsRemotePushNotifications()
}

export async function sendPushToUser({ recipientId, title, body, data }) {
  if (!recipientId) return

  try {
    const type = data?.type

    await supabase.functions.invoke('send-push-notification', {
      body: {
        recipientId,
        title,
        body,
        data: {
          ...(data || {}),
          channelId: data?.channelId || getNotificationChannelId(type),
        },
      },
    })
  } catch (error) {
    console.warn('Push notification send failed:', error?.message || error)
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
