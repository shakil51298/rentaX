import { useCallback, useEffect, useRef } from 'react'
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import * as Notifications from 'expo-notifications'
import { ActivityIndicator, View } from 'react-native'

import LoginScreen from '../screens/LoginScreen'
import HomeScreen from '../screens/HomeScreen'
import PropertyScreen from '../screens/PropertyScreen'
import CreatePostScreen from '../screens/CreatePostScreen'
import ChatScreen from '../screens/ChatScreen'
import ProfileScreen from '../screens/ProfileScreen'
import FavoriteScreen from '../screens/FavoriteScreen'
import OwnerProfileScreen from '../screens/OwnerProfileScreen'
import NotificationsScreen from '../screens/NotificationsScreen'
import SettingsScreen from '../screens/SettingsScreen'
import AdsManagementScreen from '../screens/AdsManagementScreen'
import AudioCallScreen from '../screens/AudioCallScreen'
import LocationScreen from '../screens/LocationScreen'
import ConnectionsScreen from '../screens/ConnectionsScreen'
import BlockListScreen from '../screens/BlockListScreen'
import VerificationCenterScreen from '../screens/VerificationCenterScreen'
import AdminPanelScreen from '../screens/AdminPanelScreen'
import ReviewVerifyScreen from '../screens/ReviewVerifyScreen'
import AdminUsersScreen from '../screens/AdminUsersScreen'
import AdminUserDetailScreen from '../screens/AdminUserDetailScreen'
import { supabase } from '../lib/supabase'
import {
  registerDevicePushToken,
  routeFromNotificationData,
} from '../lib/pushNotifications'
import { useState } from 'react'

const Stack = createNativeStackNavigator()
const navigationRef = createNavigationContainerRef()

function NotificationCoordinator({ onOpenNotification }) {
  const handledResponseIds = useRef(new Set())

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user?.id) {
        await registerDevicePushToken(session.user.id)
      }
    })

    return () => {
      subscription.unsubscribe()
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
      <Stack.Navigator initialRouteName={session ? 'Home' : 'Login'}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Property" component={PropertyScreen} />
        <Stack.Screen name="CreatePost" component={CreatePostScreen} />
        <Stack.Screen
          name="Chat"
          component={ChatScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AudioCall"
          component={AudioCallScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen
          name="Notifications"
          component={NotificationsScreen}
          options={{ title: 'Notifications' }}
        />
        <Stack.Screen
          name="OwnerProfile"
          component={OwnerProfileScreen}
          options={{ title: 'Public Profile' }}
        />
        <Stack.Screen name="Favorite" component={FavoriteScreen} />
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
          name="AdminUserDetail"
          component={AdminUserDetailScreen}
          options={{ title: 'User Detail' }}
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
      </Stack.Navigator>
      </NavigationContainer>
    </>
  )
}
