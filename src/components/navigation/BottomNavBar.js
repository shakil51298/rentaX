import { useEffect, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { getUnreadNotificationCount } from '../../lib/notifications'
import { playNotificationSound } from '../../lib/sounds'
import { navigateToMainTab } from './tabNavigation'
import { useAppSettings } from '../../lib/appSettings'

function Badge({ count }) {
  if (!count) return null

  return (
    <View
      style={{
        position: 'absolute',
        top: -7,
        right: -10,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: '#ef4444',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
        borderWidth: 1,
        borderColor: '#fff',
      }}
    >
      <Text
        style={{
          color: '#fff',
          fontSize: 10,
          fontWeight: '900',
          fontVariant: ['tabular-nums'],
        }}
      >
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  )
}

export default function BottomNavBar({
  navigation,
  activeTab = 'home',
  messageUnreadCount,
  notificationUnreadCount,
  onTabPress,
  userType = 'renter',
}) {
  const insets = useSafeAreaInsets()
  const { theme } = useAppSettings()
  const [counts, setCounts] = useState({
    messageUnreadCount: messageUnreadCount ?? 0,
    notificationUnreadCount: notificationUnreadCount ?? 0,
  })

  useEffect(() => {
    if (
      typeof messageUnreadCount === 'number'
      || typeof notificationUnreadCount === 'number'
    ) {
      setCounts((current) => ({
        messageUnreadCount:
          typeof messageUnreadCount === 'number'
            ? messageUnreadCount
            : current.messageUnreadCount,
        notificationUnreadCount:
          typeof notificationUnreadCount === 'number'
            ? notificationUnreadCount
            : current.notificationUnreadCount,
      }))
    }
  }, [messageUnreadCount, notificationUnreadCount])

  useEffect(() => {
    if (
      typeof messageUnreadCount === 'number'
      && typeof notificationUnreadCount === 'number'
    ) {
      return undefined
    }

    let isMounted = true
    let notificationChannel = null
    let messageChannel = null

    async function refreshCounts() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user?.id || !isMounted) {
        if (isMounted) {
          setCounts({
            messageUnreadCount: 0,
            notificationUnreadCount: 0,
          })
        }
        return
      }

      const [{ count: messageCount, error: messageError }, notificationCount] = await Promise.all([
        supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('receiver_id', user.id)
          .is('seen_at', null),
        getUnreadNotificationCount(user.id),
      ])

      if (!isMounted) return

      setCounts({
        messageUnreadCount: messageError ? 0 : (messageCount || 0),
        notificationUnreadCount: notificationCount || 0,
      })
    }

    async function bootstrap() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!isMounted) return

      await refreshCounts()

      if (!user?.id) return

      notificationChannel = supabase
        .channel(`bottom-nav-notifications-${user.id}-${Date.now()}-${Math.random()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`,
          },
          (payload) => {
            refreshCounts()

            if (
              payload.eventType === 'INSERT'
              && ['owner_verification_review_requested', 'property_verification_review_requested'].includes(payload.new?.type)
            ) {
              playNotificationSound()
            }
          }
        )
        .subscribe()

      messageChannel = supabase
        .channel(`bottom-nav-messages-${user.id}-${Date.now()}-${Math.random()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chat_messages',
            filter: `receiver_id=eq.${user.id}`,
          },
          refreshCounts
        )
        .subscribe()
    }

    bootstrap()

    return () => {
      isMounted = false
      if (notificationChannel) {
        supabase.removeChannel(notificationChannel)
      }
      if (messageChannel) {
        supabase.removeChannel(messageChannel)
      }
    }
  }, [messageUnreadCount, notificationUnreadCount])

  const isOwner = userType === 'property_owner'

  const tabs = [
    { key: 'home', icon: 'home', inactiveIcon: 'home-outline', screen: 'Home' },
    { key: 'chat', icon: 'chatbubble', inactiveIcon: 'chatbubble-outline', screen: 'Chat' },
    isOwner
      ? { key: 'create', icon: 'add-circle', inactiveIcon: 'add-circle-outline', screen: 'CreatePost' }
      : { key: 'favorite', icon: 'heart', inactiveIcon: 'heart-outline', screen: 'Favorite' },
    {
      key: 'notifications',
      icon: 'notifications',
      inactiveIcon: 'notifications-outline',
      screen: 'Notifications',
    },
    { key: 'profile', icon: 'person', inactiveIcon: 'person-outline', screen: 'Profile' },
  ]

  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 10),
        minHeight: 58 + Math.max(insets.bottom, 10),
        backgroundColor: theme.navBackground,
        borderTopWidth: 1,
        borderTopColor: theme.navBorder,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === 'create' ? false : activeTab === tab.key
        const color = isActive ? theme.accent : theme.text
        const badgeCount =
          tab.key === 'chat'
            ? counts.messageUnreadCount
            : tab.key === 'notifications'
              ? counts.notificationUnreadCount
              : 0

        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => {
              const wasHandled = onTabPress?.(tab.key, { isActive, screen: tab.screen })

              if (!wasHandled) {
                navigateToMainTab(navigation, tab.screen)
              }
            }}
            style={{ minWidth: 44, alignItems: 'center' }}
          >
            <View>
              <Ionicons
                name={isActive ? tab.icon : tab.inactiveIcon}
                size={25}
                color={color}
              />
              <Badge count={badgeCount} />
            </View>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}
