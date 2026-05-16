import { useEffect, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { getUnreadNotificationCount } from '../../lib/notifications'

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
}) {
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
    let userId = null

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

      userId = user.id
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

    refreshCounts()

    const notificationChannel = supabase
      .channel(`bottom-nav-notifications-${Date.now()}-${Math.random()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: userId ? `recipient_id=eq.${userId}` : undefined,
        },
        refreshCounts
      )
      .subscribe()

    const messageChannel = supabase
      .channel(`bottom-nav-messages-${Date.now()}-${Math.random()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
        },
        refreshCounts
      )
      .subscribe()

    return () => {
      isMounted = false
      supabase.removeChannel(notificationChannel)
      supabase.removeChannel(messageChannel)
    }
  }, [messageUnreadCount, notificationUnreadCount])

  const tabs = [
    { key: 'home', icon: 'home', inactiveIcon: 'home-outline', screen: 'Home' },
    { key: 'chat', icon: 'chatbubble', inactiveIcon: 'chatbubble-outline', screen: 'Chat' },
    { key: 'favorite', icon: 'heart', inactiveIcon: 'heart-outline', screen: 'Favorite' },
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
        paddingVertical: 10,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#eee',
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key
        const color = isActive ? '#1877F2' : '#111'
        const badgeCount =
          tab.key === 'chat'
            ? counts.messageUnreadCount
            : tab.key === 'notifications'
              ? counts.notificationUnreadCount
              : 0

        return (
          <TouchableOpacity
            key={tab.key}
            onPress={() => navigation.navigate(tab.screen)}
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
