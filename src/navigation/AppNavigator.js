import { useCallback, useEffect, useRef, useState } from 'react'
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import * as Notifications from 'expo-notifications'
import { ActivityIndicator, AppState, View } from 'react-native'

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
import ReportIssueScreen from '../screens/ReportIssueScreen'
import VisitRequestsScreen from '../screens/VisitRequestsScreen'
import RecentlyViewedScreen from '../screens/RecentlyViewedScreen'
import ComparePropertiesScreen from '../screens/ComparePropertiesScreen'
import BottomNavBar from '../components/navigation/BottomNavBar'
import { supabase } from '../lib/supabase'
import {
  registerDevicePushToken,
  routeFromNotificationData,
} from '../lib/pushNotifications'

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

function HomeTabScreen(props) {
  return <HomeScreen {...props} embeddedTabShell />
}

function ChatTabScreen(props) {
  return <ChatScreen {...props} embeddedTabShell />
}

function FavoriteTabScreen(props) {
  return <FavoriteScreen {...props} embeddedTabShell />
}

function NotificationsTabScreen(props) {
  return <NotificationsScreen {...props} embeddedTabShell />
}

function ProfileTabScreen(props) {
  return <ProfileScreen {...props} embeddedTabShell />
}

function MainTabsNavigator() {
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
          onTabPress={(_tabKey, { screen }) => {
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
  const [session, setSession] = useState(undefined)

  const handleOpenNotification = useCallback((payload) => {
    if (!payload) return

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
        return
      }

      setSession(data.session || null)
    }

    bootstrapSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (isMounted) {
        setSession(nextSession || null)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (session === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f4f7fb' }}>
        <ActivityIndicator size="large" color="#1877F2" />
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
      <Stack.Navigator initialRouteName={session ? 'MainTabs' : 'Login'}>
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="MainTabs"
          component={MainTabsNavigator}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Property" component={PropertyScreen} />
        <Stack.Screen name="CreatePost" component={CreatePostScreen} />
        <Stack.Screen
          name="ChatSettings"
          component={ChatSettingsScreen}
          options={{ title: 'Chat settings' }}
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
          options={{ title: 'Public Profile' }}
        />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen
          name="VerificationCenter"
          component={VerificationCenterScreen}
          options={{ title: 'Verification center' }}
        />
        <Stack.Screen
          name="AdminPanel"
          component={AdminPanelScreen}
          options={{ title: 'Admin panel' }}
        />
        <Stack.Screen
          name="ReviewVerify"
          component={ReviewVerifyScreen}
          options={{ title: 'Review Verify' }}
        />
        <Stack.Screen
          name="AdminUsers"
          component={AdminUsersScreen}
          options={{ title: 'Total Users' }}
        />
        <Stack.Screen
          name="AdminReports"
          component={AdminReportsScreen}
          options={{ title: 'Report Queue' }}
        />
        <Stack.Screen
          name="AdminUserDetail"
          component={AdminUserDetailScreen}
          options={{ title: 'User Detail' }}
        />
        <Stack.Screen
          name="AdminUserPosts"
          component={AdminUserPostsScreen}
          options={{ title: 'User Posts' }}
        />
        <Stack.Screen
          name="CustomerCare"
          component={CustomerCareScreen}
          options={{ title: 'Customer Care' }}
        />
        <Stack.Screen
          name="ReportIssue"
          component={ReportIssueScreen}
          options={{ title: 'Report' }}
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
          options={{ title: 'Ads Management' }}
        />
        <Stack.Screen
          name="VisitRequests"
          component={VisitRequestsScreen}
          options={{ title: 'Visit Requests' }}
        />
        <Stack.Screen
          name="RecentlyViewed"
          component={RecentlyViewedScreen}
          options={{ title: 'Recently Viewed' }}
        />
        <Stack.Screen
          name="CompareProperties"
          component={ComparePropertiesScreen}
          options={{ title: 'Compare Properties' }}
        />
      </Stack.Navigator>
      </NavigationContainer>
    </>
  )
}
