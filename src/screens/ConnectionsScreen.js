import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Avatar from '../components/common/Avatar'
import { createNotification } from '../lib/notifications'
import { fetchConnections, followUser, unfollowUser, blockUser } from '../lib/social'
import { getProfileName } from '../lib/userDisplay'
import { supabase } from '../lib/supabase'

function ConnectionActions({
  item,
  kind,
  isOwnProfile,
  currentUserId,
  navigation,
  onReload,
  onOptimisticUpdate,
}) {
  const targetUserId = item.related_user_id

  async function handleToggleFollow() {
    if (!currentUserId || !targetUserId || currentUserId === targetUserId) return

    if (item.is_following) {
      const { error } = await unfollowUser(currentUserId, targetUserId)

      if (error) {
        Alert.alert('Unfollow failed', error.message)
        return
      }

      onOptimisticUpdate(targetUserId, { is_following: false }, kind === 'following')
      return
    }

    const { error } = await followUser(currentUserId, targetUserId)

    if (error) {
      Alert.alert('Follow failed', error.message)
      return
    }

    onOptimisticUpdate(targetUserId, { is_following: true })
    await createNotification({
      recipientId: targetUserId,
      actorId: currentUserId,
      type: 'user_follow',
      title: 'New follower',
      body: 'started following you',
      eventKey: `user_follow:${targetUserId}:${currentUserId}`,
    })
  }

  async function handleBlock() {
    if (!currentUserId || !targetUserId || currentUserId === targetUserId) return

    Alert.alert(
      'Block this user?',
      'They will move to your block list and any follow connection between you will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const { error } = await blockUser(currentUserId, targetUserId)

            if (error) {
              Alert.alert('Block failed', error.message)
              return
            }

            onReload()
          },
        },
      ]
    )
  }

  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
      {isOwnProfile ? (
        <TouchableOpacity
          onPress={handleToggleFollow}
          style={{
            height: 34,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: item.is_following ? '#e5e7eb' : '#1877F2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: item.is_following ? '#111827' : '#fff', fontSize: 12, fontWeight: '900' }}>
            {kind === 'following'
              ? 'Unfollow'
              : item.is_following
                ? 'Following'
                : 'Follow'}
          </Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        onPress={() =>
          navigation.navigate('Chat', {
            owner: {
              id: targetUserId,
              email: item.profile?.email,
              name: getProfileName(item.profile, 'Rental X member'),
            },
            profile: item.profile || null,
          })
        }
        style={{
          height: 34,
          paddingHorizontal: 12,
          borderRadius: 12,
          backgroundColor: '#111827',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
        }}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={14} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900', marginLeft: 5 }}>
          Message
        </Text>
      </TouchableOpacity>

      {isOwnProfile ? (
        <TouchableOpacity
          onPress={handleBlock}
          style={{
            height: 34,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: '#fef2f2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '900' }}>
            Block
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

export default function ConnectionsScreen({ navigation, route }) {
  const userId = route.params?.userId || null
  const kind = route.params?.kind || 'followers'
  const title = route.params?.title || (kind === 'following' ? 'Following' : 'Followers')
  const isOwnProfile = Boolean(route.params?.isOwnProfile)
  const [currentUserId, setCurrentUserId] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const screenSubtitle = useMemo(
    () => (kind === 'following' ? 'People this account follows' : 'People following this account'),
    [kind]
  )

  const loadConnections = useCallback(async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    setCurrentUserId(user?.id || null)

    try {
      const rows = await fetchConnections({
        userId,
        kind,
        currentUserId: user?.id || null,
      })

      setItems(rows)
    } catch (error) {
      Alert.alert('Load failed', error.message)
    }

    setLoading(false)
  }, [kind, userId])

  useEffect(() => {
    loadConnections()
  }, [loadConnections])

  function updateConnectionItem(targetUserId, updates, removeItem = false) {
    setItems((currentItems) => {
      if (removeItem) {
        return currentItems.filter((item) => item.related_user_id !== targetUserId)
      }

      return currentItems.map((item) =>
        item.related_user_id === targetUserId
          ? {
              ...item,
              ...updates,
            }
          : item
      )
    })
  }

  function renderItem({ item }) {
    const name = getProfileName(item.profile, 'Rental X member')

    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() =>
          navigation.navigate('OwnerProfile', {
            owner: {
              id: item.related_user_id,
              email: item.profile?.email,
              name,
            },
          })
        }
        style={{
          backgroundColor: '#fff',
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#e2e8f0',
          padding: 14,
          marginBottom: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Avatar
            profile={item.profile}
            name={name}
            size={52}
            backgroundColor="#dbeafe"
            textColor="#1d4ed8"
          />

          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '900' }}>
                {name}
              </Text>

              {item.profile?.is_verified ? (
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color="#1877F2"
                  style={{ marginLeft: 5 }}
                />
              ) : null}
            </View>

            <Text style={{ marginTop: 3, color: '#64748b', fontSize: 12 }}>
              {item.profile?.location || item.profile?.email || 'Rental X member'}
            </Text>
          </View>
        </View>

        <ConnectionActions
          item={item}
          kind={kind}
          isOwnProfile={isOwnProfile}
          currentUserId={currentUserId}
          navigation={navigation}
          onReload={loadConnections}
          onOptimisticUpdate={updateConnectionItem}
        />
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 14,
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: '#e2e8f0',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: '#f1f5f9',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#0f172a" />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 19, fontWeight: '900', color: '#0f172a' }}>
              {title}
            </Text>
            <Text style={{ marginTop: 2, color: '#64748b', fontSize: 12 }}>
              {screenSubtitle}
            </Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 14, paddingBottom: 28 }}
          ListEmptyComponent={
            <Text style={{ marginTop: 24, textAlign: 'center', color: '#64748b' }}>
              No users found here yet.
            </Text>
          }
        />
      )}
    </SafeAreaView>
  )
}
