import { Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { supabase } from './supabase'

let warnedAboutExpoGo = false

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const type = notification?.request?.content?.data?.type
    const isChatMessage = type === 'chat_message'

    return {
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowBanner: !isChatMessage,
      shouldShowList: !isChatMessage,
    }
  },
})

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return

  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1877F2',
  })
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
    await supabase.functions.invoke('send-push-notification', {
      body: {
        recipientId,
        title,
        body,
        data: data || {},
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
    navigation.navigate('Chat', {
      participant: {
        id: payload.actorId,
        name: payload.actorName || 'Rental X member',
        avatar_url: payload.actorAvatarUrl || null,
        is_verified: Boolean(payload.actorVerified),
      },
      property,
    })
    return
  }

  if (['property_comment', 'comment_reply', 'comment_like'].includes(type) && property?.id) {
    navigation.navigate('Home', {
      openCommentsForPostId: property.id,
      openCommentsForPost: property,
      openCommentsTargetCommentId: payload.commentId || null,
      openCommentsRequestId:
        payload.requestId ||
        `push-${type}-${property.id}-${payload.commentId || ''}-${payload.createdAt || Date.now()}`,
    })
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
