import { useCallback, useEffect, useRef } from 'react'
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import * as Notifications from 'expo-notifications'

import LoginScreen from '../screens/LoginScreen'
import HomeScreen from '../screens/HomeScreen'
import PropertyScreen from '../screens/PropertyScreen'
import CreatePostScreen from '../screens/CreatePostScreen'
import ChatScreen from '../screens/ChatScreen'
import ProfileScreen from '../screens/ProfileScreen'
import FavoriteScreen from '../screens/FavoriteScreen'
import OwnerProfileScreen from '../screens/OwnerProfileScreen'
import NotificationsScreen from '../screens/NotificationsScreen'
import { supabase } from '../lib/supabase'
import {
  registerDevicePushToken,
  routeFromNotificationData,
} from '../lib/pushNotifications'

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

  const handleOpenNotification = useCallback((payload) => {
    if (!payload) return

    if (navigationRef.isReady()) {
      routeFromNotificationData(navigationRef, payload)
      return
    }

    pendingNotificationPayload.current = payload
  }, [])

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
      <Stack.Navigator>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Property" component={PropertyScreen} />
        <Stack.Screen name="CreatePost" component={CreatePostScreen} />
        <Stack.Screen
          name="Chat"
          component={ChatScreen}
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
      </Stack.Navigator>
      </NavigationContainer>
    </>
  )
}
