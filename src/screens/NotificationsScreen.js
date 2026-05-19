import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { getUnreadNotificationCount } from '../lib/notifications'
import BottomNavBar from '../components/navigation/BottomNavBar'
import SwipeTabView from '../components/navigation/SwipeTabView'

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)

  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function getActorName(notification) {
  return (
    notification.actor_profile?.display_name ||
    notification.actor_name ||
    'Someone'
  )
}

function getNotificationIcon(type) {
  if (type === 'saved_search_match') {
    return 'notifications-circle'
  }
  if (type === 'visit_request_created' || type === 'visit_request_cancelled') {
    return 'calendar-outline'
  }
  if (type === 'visit_request_accepted') {
    return 'calendar-clear'
  }
  if (type === 'visit_request_rejected') {
    return 'calendar-clear-outline'
  }
  if (type === 'visit_request_rescheduled') {
    return 'calendar'
  }
  if (type === 'user_report_submitted' || type === 'property_report_submitted') {
    return 'flag'
  }
  if (type === 'owner_verification_review_requested' || type === 'property_verification_review_requested') {
    return 'shield-checkmark'
  }
  if (type === 'property_banned_by_admin') return 'help-buoy'
  if (type === 'property_comment') return 'chatbubble-ellipses'
  if (type === 'comment_reply') return 'return-down-forward'
  if (type === 'comment_like') return 'thumbs-up'
  if (type === 'property_like') return 'thumbs-up'
  if (type === 'property_favorite') return 'heart'
  if (type === 'user_follow') return 'person-add'
  if (type === 'owner_verification_approved' || type === 'property_verification_approved') {
    return 'checkmark-circle'
  }
  if (type === 'owner_verification_rejected' || type === 'property_verification_rejected') {
    return 'alert-circle'
  }
  return 'notifications'
}

function getNotificationColor(type) {
  if (type === 'saved_search_match') {
    return '#2563eb'
  }
  if (type === 'visit_request_created') {
    return '#b45309'
  }
  if (type === 'visit_request_cancelled') {
    return '#64748b'
  }
  if (type === 'visit_request_accepted') {
    return '#16a34a'
  }
  if (type === 'visit_request_rejected') {
    return '#dc2626'
  }
  if (type === 'visit_request_rescheduled') {
    return '#7c3aed'
  }
  if (type === 'user_report_submitted' || type === 'property_report_submitted') {
    return '#dc2626'
  }
  if (type === 'owner_verification_review_requested' || type === 'property_verification_review_requested') {
    return '#7c3aed'
  }
  if (type === 'property_banned_by_admin') return '#dc2626'
  if (type === 'property_favorite') return '#ef4444'
  if (type === 'user_follow') return '#16a34a'
  if (type === 'owner_verification_approved' || type === 'property_verification_approved') {
    return '#16a34a'
  }
  if (type === 'owner_verification_rejected' || type === 'property_verification_rejected') {
    return '#dc2626'
  }
  return '#1877F2'
}

function shouldOpenCommentSheet(type) {
  return ['property_comment', 'comment_reply', 'comment_like'].includes(type)
}

function Avatar({ name, uri }) {
  const initial = name?.trim()?.charAt(0)?.toUpperCase() || 'U'

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#ddd' }}
      />
    )
  }

  return (
    <View
      style={{
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: '#dbeafe',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#1d4ed8', fontWeight: '900' }}>{initial}</Text>
    </View>
  )
}

function enrichNotifications(notifications, profilesById, propertiesById) {
  return notifications.map((notification) => ({
    ...notification,
    actor_profile: profilesById[notification.actor_id] || null,
    property: propertiesById[String(notification.property_id)] || null,
  }))
}

export default function NotificationsScreen({ navigation, embeddedTabShell = false }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const loadNotifications = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true)
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    setCurrentUser(user)

    if (!user) {
      setNotifications([])
      setUnreadCount(0)
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', user.id)
      .neq('type', 'chat_message')
      .order('created_at', { ascending: false })
      .limit(80)

    if (error) {
      if (showLoader) {
        Alert.alert('Database update needed', error.message)
      }

      setLoading(false)
      return
    }

    const actorIds = [...new Set((data || []).map((item) => item.actor_id).filter(Boolean))]
    const propertyIds = [
      ...new Set((data || []).map((item) => item.property_id).filter(Boolean).map(String)),
    ]
    let profilesById = {}
    let propertiesById = {}

    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, display_name, avatar_url, is_verified')
        .in('user_id', actorIds)

      profilesById = (profiles || []).reduce((itemsById, profile) => {
        itemsById[profile.user_id] = profile
        return itemsById
      }, {})
    }

    if (propertyIds.length > 0) {
      const { data: properties } = await supabase
        .from('properties')
        .select('*')
        .in('id', propertyIds)

      propertiesById = (properties || []).reduce((itemsById, property) => {
        itemsById[String(property.id)] = property
        return itemsById
      }, {})
    }

    setNotifications(enrichNotifications(data || [], profilesById, propertiesById))
    setUnreadCount(await getUnreadNotificationCount(user.id))
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (embeddedTabShell) {
        return undefined
      }

      loadNotifications()
    }, [embeddedTabShell, loadNotifications])
  )

  useEffect(() => {
    if (!embeddedTabShell) return

    loadNotifications()
  }, [embeddedTabShell, loadNotifications])

  useEffect(() => {
    if (!currentUser?.id) return undefined

    const refreshNotifications = () => {
      loadNotifications(false)
    }

    const channelName = `notifications-page-${currentUser.id}-${Date.now()}-${Math.random()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${currentUser.id}`,
        },
        refreshNotifications
      )
      .subscribe()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [currentUser?.id, loadNotifications])

  async function markNotificationRead(notification) {
    if (!notification?.id || notification.is_read) return

    await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('id', notification.id)

    setNotifications((oldItems) =>
      oldItems.map((item) =>
        item.id === notification.id ? { ...item, is_read: true } : item
      )
    )
    setUnreadCount((count) => Math.max(count - 1, 0))
  }

  async function markAllRead() {
    if (!currentUser?.id || unreadCount === 0) return

    await supabase
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq('recipient_id', currentUser.id)
      .neq('type', 'chat_message')
      .eq('is_read', false)

    setNotifications((oldItems) =>
      oldItems.map((item) => ({ ...item, is_read: true }))
    )
    setUnreadCount(0)
  }

  async function openNotification(notification) {
    await markNotificationRead(notification)

    if (
      notification.type === 'visit_request_created'
      || notification.type === 'visit_request_cancelled'
    ) {
      navigation.navigate('VisitRequests')
      return
    }

    if (
      notification.type === 'visit_request_accepted'
      || notification.type === 'visit_request_rejected'
      || notification.type === 'visit_request_rescheduled'
    ) {
      if (notification.property) {
        navigation.navigate('Property', { property: notification.property })
        return
      }

      navigation.navigate('MainTabs', { screen: 'Home' })
      return
    }

    if (notification.type === 'saved_search_match') {
      if (notification.property) {
        navigation.navigate('Property', { property: notification.property })
        return
      }

      navigation.navigate('MainTabs', { screen: 'Home' })
      return
    }

    if (
      notification.type === 'user_report_submitted'
      || notification.type === 'property_report_submitted'
    ) {
      navigation.navigate('AdminReports')
      return
    }

    if (
      notification.type === 'owner_verification_review_requested'
      || notification.type === 'property_verification_review_requested'
    ) {
      navigation.navigate('ReviewVerify')
      return
    }

    if (notification.type === 'owner_verification_rejected') {
      navigation.navigate('VerificationCenter')
      return
    }

    if (notification.type === 'owner_verification_approved') {
      navigation.navigate('VerificationCenter')
      return
    }

    if (notification.type === 'property_verification_rejected') {
      if (notification.property) {
        navigation.navigate('Property', { property: notification.property })
        return
      }

      navigation.navigate('VerificationCenter')
      return
    }

    if (notification.type === 'property_verification_approved') {
      if (notification.property) {
        navigation.navigate('Property', { property: notification.property })
        return
      }

      navigation.navigate('VerificationCenter')
      return
    }

    if (notification.type === 'property_banned_by_admin') {
      navigation.navigate('CustomerCare', {
        property: notification.property || null,
        notification,
      })
      return
    }

    if (shouldOpenCommentSheet(notification.type) && notification.property_id) {
      navigation.navigate('MainTabs', {
        screen: 'Home',
        params: {
          openCommentsForPostId: String(notification.property_id),
          openCommentsForPost: notification.property || null,
          openCommentsTargetCommentId: notification.comment_id || null,
          openCommentsRequestId: notification.id,
          openCommentsReturnTo: 'Notifications',
        },
      })
      return
    }

    if (notification.property) {
      navigation.navigate('Property', { property: notification.property })
      return
    }

    if (notification.actor_id) {
      navigation.navigate('OwnerProfile', {
        owner: {
          id: notification.actor_id,
          name: getActorName(notification),
        },
      })
    }
  }

  function renderNotification({ item }) {
    const actorName = getActorName(item)
    const iconColor = getNotificationColor(item.type)

    return (
      <TouchableOpacity
        onPress={() => openNotification(item)}
        activeOpacity={0.82}
        style={{
          backgroundColor: item.is_read ? '#fff' : '#eef6ff',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: item.is_read ? '#e5e7eb' : '#bfdbfe',
          padding: 12,
          marginBottom: 10,
          flexDirection: 'row',
          alignItems: 'flex-start',
        }}
      >
        <View>
          <Avatar name={actorName} uri={item.actor_profile?.avatar_url} />

          <View
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: iconColor,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: '#fff',
            }}
          >
            <Ionicons name={getNotificationIcon(item.type)} size={11} color="#fff" />
          </View>
        </View>

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={{ color: '#111827', lineHeight: 20 }}>
            <Text style={{ fontWeight: '900' }}>{actorName}</Text>
            {' '}
            {item.body || item.title || 'sent you a notification'}
          </Text>

          {item.property?.title ? (
            <Text style={{ color: '#64748b', marginTop: 4 }} numberOfLines={1}>
              {item.property.title}
            </Text>
          ) : null}

          <Text style={{ color: '#1877F2', fontSize: 12, marginTop: 6, fontWeight: '700' }}>
            {timeAgo(item.created_at)}
          </Text>
        </View>

        {!item.is_read ? (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: '#1877F2',
              marginTop: 8,
            }}
          />
        ) : null}
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', backgroundColor: '#f0f2f5' }}>
        <ActivityIndicator />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SwipeTabView navigation={navigation} activeTab="notifications">
      <View style={{ flex: 1 }}>
        <View
          style={{
            backgroundColor: '#fff',
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: '#e5e7eb',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827' }}>
            Notifications
          </Text>

          <TouchableOpacity
            onPress={markAllRead}
            disabled={unreadCount === 0}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 18,
              backgroundColor: unreadCount > 0 ? '#1877F2' : '#e5e7eb',
            }}
          >
            <Text
              style={{
                color: unreadCount > 0 ? '#fff' : '#6b7280',
                fontWeight: '800',
                fontSize: 12,
              }}
            >
              Mark read
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderNotification}
          refreshing={loading}
          onRefresh={loadNotifications}
          contentContainerStyle={{ padding: 14, paddingBottom: 28 }}
          ListEmptyComponent={
            <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 40 }}>
              No notifications yet
            </Text>
          }
        />
      </View>

      {!embeddedTabShell ? (
        <BottomNavBar navigation={navigation} activeTab="notifications" />
      ) : null}
      </SwipeTabView>
    </SafeAreaView>
  )
}
