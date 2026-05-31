import { useCallback, useEffect, useRef, useState } from 'react'
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import * as Notifications from 'expo-notifications'
import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, Animated, AppState, Pressable, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

import LoginScreen from '../screens/LoginScreen'
import HomeScreen from '../screens/HomeScreen'
import PropertyScreen from '../screens/PropertyScreen'
import CreatePostScreen from '../screens/CreatePostScreen'
import ChatScreen from '../screens/ChatScreen'
import ChatSettingsScreen from '../screens/ChatSettingsScreen'
import ChatHistorySearchScreen from '../screens/ChatHistorySearchScreen'
import ChatHistoryCategoryScreen from '../screens/ChatHistoryCategoryScreen'
import ChatAppearanceScreen from '../screens/ChatAppearanceScreen'
import CreateGroupChatScreen from '../screens/CreateGroupChatScreen'
import GroupSettingsScreen from '../screens/GroupSettingsScreen'
import ProfileScreen from '../screens/ProfileScreen'
import FavoriteScreen from '../screens/FavoriteScreen'
import OwnerProfileScreen from '../screens/OwnerProfileScreen'
import NotificationsScreen from '../screens/NotificationsScreen'
import SettingsScreen from '../screens/SettingsScreen'
import WalletScreen from '../screens/WalletScreen'
import AdsManagementScreen from '../screens/AdsManagementScreen'
import AudioCallScreen from '../screens/AudioCallScreen'
import VideoCallScreen from '../screens/VideoCallScreen'
import ChatCameraScreen from '../screens/ChatCameraScreen'
import ChatQrScannerScreen from '../screens/ChatQrScannerScreen'
import LocationScreen from '../screens/LocationScreen'
import ConnectionsScreen from '../screens/ConnectionsScreen'
import BlockListScreen from '../screens/BlockListScreen'
import VerificationCenterScreen from '../screens/VerificationCenterScreen'
import AdminPanelScreen from '../screens/AdminPanelScreen'
import ReviewVerifyScreen from '../screens/ReviewVerifyScreen'
import AdminUsersScreen from '../screens/AdminUsersScreen'
import AdminUserDetailScreen from '../screens/AdminUserDetailScreen'
import AdminUserPostsScreen from '../screens/AdminUserPostsScreen'
import CustomerCareScreen from '../screens/CustomerCareScreen'
import AdminReportsScreen from '../screens/AdminReportsScreen'
import AdminBannersScreen from '../screens/AdminBannersScreen'
import AdminWalletScreen from '../screens/AdminWalletScreen'
import ReportIssueScreen from '../screens/ReportIssueScreen'
import VisitRequestsScreen from '../screens/VisitRequestsScreen'
import RecentlyViewedScreen from '../screens/RecentlyViewedScreen'
import ComparePropertiesScreen from '../screens/ComparePropertiesScreen'
import BottomNavBar from '../components/navigation/BottomNavBar'
import { supabase } from '../lib/supabase'
import { clearGuestMode, isGuestModeEnabled } from '../lib/guestSession'
import {
  registerDevicePushToken,
  routeFromNotificationData,
} from '../lib/pushNotifications'
import { useAppSettings } from '../lib/appSettings'
import { isConversationMuted } from '../lib/chatPreferences'
import { playNotificationSound } from '../lib/sounds'

const LIVE_ALERT_NOTIFICATION_TYPES = new Set([
  'saved_search_match',
  'user_report_submitted',
  'property_report_submitted',
  'property_case_appealed',
  'wallet_topup_requested',
  'wallet_topup_approved',
  'wallet_topup_rejected',
  'owner_verification_review_requested',
  'property_verification_review_requested',
])

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()
const navigationRef = createNavigationContainerRef()

const TAB_ACTIVE_KEYS = {
  Home: 'home',
  Chat: 'chat',
  Favorite: 'favorite',
  Notifications: 'notifications',
  Profile: 'profile',
}

function GuestLockedScreen({
  navigation,
  icon,
  titleKey,
  subtitleKey,
}) {
  const { theme, t } = useAppSettings()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 22,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={34} color={theme.accent} />
        </View>

        <Text
          style={{
            marginTop: 18,
            color: theme.text,
            fontSize: 22,
            fontWeight: '900',
            textAlign: 'center',
          }}
        >
          {t(titleKey, '')}
        </Text>

        <Text
          style={{
            marginTop: 10,
            color: theme.mutedText,
            fontSize: 14,
            lineHeight: 21,
            textAlign: 'center',
            maxWidth: 280,
          }}
        >
          {t(subtitleKey, '')}
        </Text>

        <TouchableOpacity
          onPress={() => navigation.getParent()?.navigate('Login')}
          style={{
            marginTop: 20,
            backgroundColor: theme.accent,
            borderRadius: 14,
            paddingHorizontal: 22,
            paddingVertical: 13,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>
            {t('guestLoginOrRegister', 'Login or Register')}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

function MainTabsNavigator({ guestMode = false }) {
  const [userType, setUserType] = useState('renter')

  useEffect(() => {
    let isMounted = true

    async function loadUserType() {
      if (guestMode) {
        if (isMounted) {
          setUserType('renter')
        }
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!isMounted) return

      if (!user?.id) {
        setUserType('renter')
        return
      }

      const metadataUserType = user.user_metadata?.user_type || 'renter'

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('user_type')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!isMounted) return

      setUserType(profile?.user_type || metadataUserType || 'renter')
    }

    loadUserType()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadUserType()
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [guestMode])

  function HomeTabScreen(props) {
    return <HomeScreen {...props} embeddedTabShell guestMode={guestMode} />
  }

  function ChatTabScreen(props) {
    return guestMode ? (
      <GuestLockedScreen
        {...props}
        icon="chatbubble-ellipses-outline"
        titleKey="guestChatTitle"
        subtitleKey="guestChatSubtitle"
      />
    ) : (
      <ChatScreen {...props} embeddedTabShell />
    )
  }

  function FavoriteTabScreen(props) {
    return guestMode ? (
      <GuestLockedScreen
        {...props}
        icon="heart-outline"
        titleKey="guestFavoriteTitle"
        subtitleKey="guestFavoriteSubtitle"
      />
    ) : (
      <FavoriteScreen {...props} embeddedTabShell />
    )
  }

  function NotificationsTabScreen(props) {
    return guestMode ? (
      <GuestLockedScreen
        {...props}
        icon="notifications-outline"
        titleKey="guestNotificationTitle"
        subtitleKey="guestNotificationSubtitle"
      />
    ) : (
      <NotificationsScreen {...props} embeddedTabShell />
    )
  }

  function ProfileTabScreen(props) {
    return guestMode ? (
      <GuestLockedScreen
        {...props}
        icon="person-outline"
        titleKey="guestProfileTitle"
        subtitleKey="guestProfileSubtitle"
      />
    ) : (
      <ProfileScreen {...props} embeddedTabShell />
    )
  }

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        lazy: true,
        animation: 'fade',
      }}
      detachInactiveScreens
      tabBar={({ navigation, state }) => (
        <BottomNavBar
          navigation={navigation}
          activeTab={TAB_ACTIVE_KEYS[state.routes[state.index]?.name] || 'home'}
          userType={userType}
          onTabPress={(_tabKey, { screen }) => {
            if (screen === 'CreatePost') {
              navigation.getParent()?.navigate('CreatePost')
              return true
            }

            const targetRoute = state.routes.find((route) => route.name === screen)
            const event = navigation.emit({
              type: 'tabPress',
              target: targetRoute?.key,
              canPreventDefault: true,
            })

            return event.defaultPrevented
          }}
        />
      )}
    >
      <Tab.Screen name="Home" component={HomeTabScreen} />
      <Tab.Screen name="Chat" component={ChatTabScreen} />
      <Tab.Screen name="Favorite" component={FavoriteTabScreen} />
      <Tab.Screen name="Notifications" component={NotificationsTabScreen} />
      <Tab.Screen name="Profile" component={ProfileTabScreen} />
    </Tab.Navigator>
  )
}

function getInAppNotificationIcon(type) {
  if (type === 'chat_message') return 'chatbubble-ellipses'
  if (type === 'incoming_audio_call' || type === 'incoming_video_call') return 'call'
  if (type === 'saved_search_match') return 'search'
  if (type?.startsWith?.('wallet_topup')) return 'wallet'
  if (type?.includes?.('report') || type?.includes?.('verification')) return 'shield-checkmark'
  return 'notifications'
}

function isCallNotificationType(type) {
  return type === 'incoming_audio_call' || type === 'incoming_video_call'
}

function buildInAppNotificationKey(item) {
  const data = item?.data || {}

  return (
    item?.key ||
    data.eventKey ||
    data.notificationId ||
    [
      data.type,
      data.actorId,
      data.propertyId,
      data.conversationId,
      data.callId,
      data.searchId,
      data.createdAt,
      item?.title,
      item?.body,
    ]
      .filter(Boolean)
      .map(String)
      .join(':') ||
    String(Date.now())
  )
}

function InAppNotificationBanner({ notification, theme, onPress, onDismiss }) {
  const insets = useSafeAreaInsets()
  const translateY = useRef(new Animated.Value(-120)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!notification) return undefined

    translateY.setValue(-120)
    opacity.setValue(0)

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 16,
        stiffness: 180,
        mass: 0.8,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start()

    return undefined
  }, [notification?.id, opacity, translateY])

  if (!notification) return null

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: insets.top + 8,
        left: 12,
        right: 12,
        zIndex: 9999,
        opacity,
        transform: [{ translateY }],
      }}
    >
      <Pressable
        onPress={() => onPress(notification)}
        style={({ pressed }) => ({
          minHeight: 72,
          borderRadius: 18,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          opacity: pressed ? 0.92 : 1,
          shadowColor: '#000',
          shadowOpacity: 0.16,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        })}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons
            name={getInAppNotificationIcon(notification?.data?.type)}
            size={21}
            color={theme.accent}
          />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              color: theme.text,
              fontSize: 14,
              fontWeight: '900',
            }}
          >
            {notification.title || 'Rental X'}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              marginTop: 2,
              color: theme.mutedText,
              fontSize: 12,
              lineHeight: 17,
              fontWeight: '600',
            }}
          >
            {notification.body || 'You have a new update.'}
          </Text>
        </View>

        <TouchableOpacity
          onPress={onDismiss}
          activeOpacity={0.8}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.accentSoft,
          }}
        >
          <Ionicons name="close" size={18} color={theme.accent} />
        </TouchableOpacity>
      </Pressable>
    </Animated.View>
  )
}

function NotificationCoordinator({ enabled, onOpenNotification, onShowInAppBanner }) {
  const handledResponseIds = useRef(new Set())
  const activeNotificationKeys = useRef(new Set())
  const appStateRef = useRef(AppState.currentState)

  useEffect(() => {
    if (!enabled) return undefined

    async function syncPushToken() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user?.id) {
        await registerDevicePushToken(user.id)
      }
    }

    syncPushToken()

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      appStateRef.current = state

      if (state === 'active') {
        syncPushToken()
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user?.id) {
        await registerDevicePushToken(session.user.id)
      }
    })

    return () => {
      appStateSubscription.remove()
      subscription.unsubscribe()
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return undefined

    const receivedListener = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification?.request?.content || {}
      const data = content.data || {}
      const conversationId = data.conversationId

      Promise.resolve(
        data.type === 'chat_message' && conversationId
          ? isConversationMuted(conversationId)
          : false
      ).then((isMuted) => {
        if (isMuted || appStateRef.current !== 'active') {
          return
        }

        onShowInAppBanner?.({
          id: notification?.request?.identifier || String(Date.now()),
          key: data.eventKey || data.notificationId,
          title: content.title || 'Rental X',
          body: content.body || 'You have a new update.',
          data,
        })
      })
    })

    return () => {
      receivedListener.remove()
    }
  }, [enabled, onShowInAppBanner])

  useEffect(() => {
    if (!enabled) return undefined

    let isMounted = true
    let notificationChannel = null

    async function subscribeSavedSearchAlerts() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!isMounted || !user?.id) return

      notificationChannel = supabase
        .channel(`app-live-notifications-${user.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`,
          },
          async (payload) => {
            const nextNotification = payload.new

            if (!LIVE_ALERT_NOTIFICATION_TYPES.has(nextNotification?.type)) {
              return
            }

            const dedupeKey = nextNotification.event_key || nextNotification.id

            if (!dedupeKey || activeNotificationKeys.current.has(dedupeKey)) {
              return
            }

            activeNotificationKeys.current.add(dedupeKey)

            const bannerPayload = {
              id: String(nextNotification.id || dedupeKey),
              key: dedupeKey,
              title: nextNotification.title || 'Rental X update',
              body: nextNotification.body || 'You have a new admin update.',
              data: {
                type: nextNotification.type,
                propertyId: nextNotification.property_id ? String(nextNotification.property_id) : null,
                actorId: nextNotification.actor_id || null,
                eventKey: dedupeKey,
              },
            }

            if (appStateRef.current === 'active') {
              onShowInAppBanner?.(bannerPayload)
              return
            }

            await Notifications.scheduleNotificationAsync({
              content: {
                title: bannerPayload.title,
                body: bannerPayload.body,
                sound: 'default',
                data: bannerPayload.data,
              },
              trigger: null,
            })
          }
        )
        .subscribe()
    }

    subscribeSavedSearchAlerts()

    return () => {
      isMounted = false
      if (notificationChannel) {
        supabase.removeChannel(notificationChannel)
      }
    }
  }, [enabled, onShowInAppBanner])

  useEffect(() => {
    if (!enabled) return undefined

    function openResponse(response) {
      const identifier = response?.notification?.request?.identifier

      if (identifier && handledResponseIds.current.has(identifier)) {
        return
      }

      if (identifier) {
        handledResponseIds.current.add(identifier)
      }

      onOpenNotification(response?.notification?.request?.content?.data || {})
    }

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        openResponse(response)
      }
    })

    const responseListener = Notifications.addNotificationResponseReceivedListener(openResponse)

    return () => {
      responseListener.remove()
    }
  }, [enabled, onOpenNotification])

  return null
}

export default function AppNavigator() {
  const pendingNotificationPayload = useRef(null)
  const lastOpenedCallKeyRef = useRef(null)
  const bannerDismissTimerRef = useRef(null)
  const recentlyShownBannerKeysRef = useRef(new Map())
  const [session, setSession] = useState(undefined)
  const [guestMode, setGuestMode] = useState(false)
  const [inAppNotification, setInAppNotification] = useState(null)
  const { theme, t } = useAppSettings()

  const handleOpenNotification = useCallback((payload) => {
    if (!payload) return

    if (
      payload.type
      && (payload.type === 'incoming_audio_call' || payload.type === 'incoming_video_call')
    ) {
      const callKey = `${payload.type}:${payload.callId || payload.channelName || payload.actorId || 'unknown'}`

      if (lastOpenedCallKeyRef.current === callKey) {
        return
      }

      lastOpenedCallKeyRef.current = callKey
    }

    if (navigationRef.isReady()) {
      routeFromNotificationData(navigationRef, payload)
      return
    }

    pendingNotificationPayload.current = payload
  }, [])

  const dismissInAppNotification = useCallback(() => {
    if (bannerDismissTimerRef.current) {
      clearTimeout(bannerDismissTimerRef.current)
      bannerDismissTimerRef.current = null
    }

    setInAppNotification(null)
  }, [])

  const showInAppNotification = useCallback((nextNotification) => {
    if (!nextNotification) return

    const key = buildInAppNotificationKey(nextNotification)
    const now = Date.now()
    const lastShownAt = recentlyShownBannerKeysRef.current.get(key)

    if (lastShownAt && now - lastShownAt < 3500) {
      return
    }

    recentlyShownBannerKeysRef.current.set(key, now)
    recentlyShownBannerKeysRef.current.forEach((shownAt, shownKey) => {
      if (now - shownAt > 60000) {
        recentlyShownBannerKeysRef.current.delete(shownKey)
      }
    })

    if (nextNotification.playSound !== false && !isCallNotificationType(nextNotification?.data?.type)) {
      const conversationId = nextNotification?.data?.conversationId
      playNotificationSound({
        conversationId,
        playPhoneDefaultFallback: !conversationId,
      })
    }

    if (bannerDismissTimerRef.current) {
      clearTimeout(bannerDismissTimerRef.current)
    }

    setInAppNotification({
      ...nextNotification,
      id: nextNotification.id || key,
      key,
    })

    bannerDismissTimerRef.current = setTimeout(() => {
      setInAppNotification(null)
      bannerDismissTimerRef.current = null
    }, 4800)
  }, [])

  const handlePressInAppNotification = useCallback((notification) => {
    dismissInAppNotification()
    handleOpenNotification(notification?.data || {})
  }, [dismissInAppNotification, handleOpenNotification])

  useEffect(() => {
    let isMounted = true

    async function bootstrapSession() {
      const { data, error } = await supabase.auth.getSession()

      if (!isMounted) return

      if (error) {
        setSession(null)
        setGuestMode(await isGuestModeEnabled())
        return
      }

      setSession(data.session || null)
      setGuestMode(!data.session && await isGuestModeEnabled())
    }

    bootstrapSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (isMounted) {
        setSession(nextSession || null)
        if (nextSession) {
          setGuestMode(false)
          clearGuestMode()
        } else if (event === 'SIGNED_OUT') {
          setGuestMode(false)
        }
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => () => {
    if (bannerDismissTimerRef.current) {
      clearTimeout(bannerDismissTimerRef.current)
    }
  }, [])

  if (session === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <NotificationCoordinator
        enabled={Boolean(session)}
        onOpenNotification={handleOpenNotification}
        onShowInAppBanner={showInAppNotification}
      />
      <NavigationContainer
        ref={navigationRef}
        onReady={() => {
          if (pendingNotificationPayload.current) {
            routeFromNotificationData(navigationRef, pendingNotificationPayload.current)
            pendingNotificationPayload.current = null
          }
        }}
      >
      <Stack.Navigator
        initialRouteName={session || guestMode ? 'MainTabs' : 'Login'}
        screenOptions={{
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.text,
          headerTitleStyle: { color: theme.text, fontWeight: '800' },
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="MainTabs"
          children={() => <MainTabsNavigator guestMode={guestMode} />}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Property">
          {(props) => <PropertyScreen {...props} guestMode={guestMode} />}
        </Stack.Screen>
        <Stack.Screen
          name="CreatePost"
          component={CreatePostScreen}
          options={{ title: t('stackCreatePost', 'Create Post') }}
        />
        <Stack.Screen
          name="ChatSettings"
          component={ChatSettingsScreen}
          options={{ title: t('stackChatSettings', 'Chat settings') }}
        />
        <Stack.Screen
          name="ChatHistorySearch"
          component={ChatHistorySearchScreen}
          options={{ title: t('stackChatHistorySearch', 'Search chat history') }}
        />
        <Stack.Screen
          name="ChatHistoryCategory"
          component={ChatHistoryCategoryScreen}
          options={({ route }) => ({ title: route?.params?.title || t('stackChatHistorySearch', 'Search chat history') })}
        />
        <Stack.Screen
          name="ChatAppearance"
          component={ChatAppearanceScreen}
          options={{ title: t('stackChatAppearance', 'Chat appearance') }}
        />
        <Stack.Screen
          name="CreateGroupChat"
          component={CreateGroupChatScreen}
          options={({ route }) => ({
            title: route?.params?.isAddingToGroup
              ? t('stackAddGroupMembers', 'Add members')
              : t('stackCreateGroupChat', 'Create group'),
          })}
        />
        <Stack.Screen
          name="GroupSettings"
          component={GroupSettingsScreen}
          options={{ title: t('stackGroupSettings', 'Group settings') }}
        />
        <Stack.Screen
          name="AudioCall"
          component={AudioCallScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="VideoCall"
          component={VideoCallScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ChatCamera"
          component={ChatCameraScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ChatQrScanner"
          component={ChatQrScannerScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="OwnerProfile"
          component={OwnerProfileScreen}
          options={{ title: t('stackOwnerProfile', 'Public Profile') }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Profile' }}
        />
        <Stack.Screen
          name="Wallet"
          component={WalletScreen}
          options={{ title: 'Wallet' }}
        />
        <Stack.Screen
          name="VerificationCenter"
          component={VerificationCenterScreen}
          options={{ title: t('stackVerificationCenter', 'Verification center') }}
        />
        <Stack.Screen
          name="AdminPanel"
          component={AdminPanelScreen}
          options={{ title: t('stackAdminPanel', 'Admin panel') }}
        />
        <Stack.Screen
          name="ReviewVerify"
          component={ReviewVerifyScreen}
          options={{ title: t('stackReviewVerify', 'Review Verify') }}
        />
        <Stack.Screen
          name="AdminUsers"
          component={AdminUsersScreen}
          options={{ title: t('stackAdminUsers', 'Total Users') }}
        />
        <Stack.Screen
          name="AdminReports"
          component={AdminReportsScreen}
          options={{ title: t('stackAdminReports', 'Report Queue') }}
        />
        <Stack.Screen
          name="AdminBanners"
          component={AdminBannersScreen}
          options={{ title: t('stackAdminBanners', 'Home Banners') }}
        />
        <Stack.Screen
          name="AdminWallet"
          component={AdminWalletScreen}
          options={{ title: 'E-money requests' }}
        />
        <Stack.Screen
          name="AdminUserDetail"
          component={AdminUserDetailScreen}
          options={{ title: t('stackAdminUserDetail', 'User Detail') }}
        />
        <Stack.Screen
          name="AdminUserPosts"
          component={AdminUserPostsScreen}
          options={{ title: t('stackAdminUserPosts', 'User Posts') }}
        />
        <Stack.Screen
          name="CustomerCare"
          component={CustomerCareScreen}
          options={{ title: t('stackCustomerCare', 'Customer Care') }}
        />
        <Stack.Screen
          name="ReportIssue"
          component={ReportIssueScreen}
          options={{ title: t('stackReportIssue', 'Report') }}
        />
        <Stack.Screen
          name="Connections"
          component={ConnectionsScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="BlockList"
          component={BlockListScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Location"
          component={LocationScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdsManagement"
          component={AdsManagementScreen}
          options={{ title: t('stackAdsManagement', 'Ads Management') }}
        />
        <Stack.Screen
          name="VisitRequests"
          component={VisitRequestsScreen}
          options={{ title: t('stackVisitRequests', 'Visit Requests') }}
        />
        <Stack.Screen
          name="RecentlyViewed"
          component={RecentlyViewedScreen}
          options={{ title: t('stackRecentlyViewed', 'Recently Viewed') }}
        />
        <Stack.Screen
          name="CompareProperties"
          component={ComparePropertiesScreen}
          options={{ title: t('stackCompareProperties', 'Compare Properties') }}
        />
      </Stack.Navigator>
      </NavigationContainer>
      <InAppNotificationBanner
        notification={inAppNotification}
        theme={theme}
        onPress={handlePressInAppNotification}
        onDismiss={dismissInAppNotification}
      />
    </View>
  )
}
