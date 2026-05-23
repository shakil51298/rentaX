import { useCallback, useEffect, useRef, useState } from 'react'
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import * as Notifications from 'expo-notifications'
import { Ionicons } from '@expo/vector-icons'
import { ActivityIndicator, AppState, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import LoginScreen from '../screens/LoginScreen'
import HomeScreen from '../screens/HomeScreen'
import PropertyScreen from '../screens/PropertyScreen'
import CreatePostScreen from '../screens/CreatePostScreen'
import ChatScreen from '../screens/ChatScreen'
import ChatSettingsScreen from '../screens/ChatSettingsScreen'
import ProfileScreen from '../screens/ProfileScreen'
import FavoriteScreen from '../screens/FavoriteScreen'
import OwnerProfileScreen from '../screens/OwnerProfileScreen'
import NotificationsScreen from '../screens/NotificationsScreen'
import SettingsScreen from '../screens/SettingsScreen'
import AdsManagementScreen from '../screens/AdsManagementScreen'
import AudioCallScreen from '../screens/AudioCallScreen'
import VideoCallScreen from '../screens/VideoCallScreen'
import ChatCameraScreen from '../screens/ChatCameraScreen'
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

const LIVE_ALERT_NOTIFICATION_TYPES = new Set([
  'saved_search_match',
  'user_report_submitted',
  'property_report_submitted',
  'property_case_appealed',
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
        lazy: false,
        animation: 'fade',
      }}
      detachInactiveScreens={false}
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

function NotificationCoordinator({ onOpenNotification }) {
  const handledResponseIds = useRef(new Set())
  const activeNotificationKeys = useRef(new Set())

  useEffect(() => {
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
  }, [])

  useEffect(() => {
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

            await Notifications.scheduleNotificationAsync({
              content: {
                title: nextNotification.title || 'Rental X update',
                body: nextNotification.body || 'You have a new admin update.',
                sound: 'default',
                data: {
                  type: nextNotification.type,
                  propertyId: nextNotification.property_id ? String(nextNotification.property_id) : null,
                  actorId: nextNotification.actor_id || null,
                },
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
  }, [])

  useEffect(() => {
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
  }, [onOpenNotification])

  return null
}

export default function AppNavigator() {
  const pendingNotificationPayload = useRef(null)
  const lastOpenedCallKeyRef = useRef(null)
  const [session, setSession] = useState(undefined)
  const [guestMode, setGuestMode] = useState(false)
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

  if (session === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    )
  }

  return (
    <>
      <NotificationCoordinator onOpenNotification={handleOpenNotification} />
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
    </>
  )
}
