import { useCallback, useEffect, useState } from 'react'
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
import { fetchBlockedUsers, unblockUser } from '../lib/social'
import { getProfileName } from '../lib/userDisplay'
import { supabase } from '../lib/supabase'

function formatDate(value) {
  if (!value) return 'Unknown time'

  try {
    return new Date(value).toLocaleString()
  } catch (_error) {
    return 'Unknown time'
  }
}

export default function BlockListScreen({ navigation, route }) {
  const blockerUserId = route?.params?.userId || null
  const isOwnProfile = Boolean(route?.params?.isOwnProfile)
  const readOnly = Boolean(route?.params?.readOnly)
  const title = route?.params?.title || 'Block list'
  const [currentUserId, setCurrentUserId] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const loadBlockedUsers = useCallback(async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    setCurrentUserId(user?.id || null)

    try {
      const rows = await fetchBlockedUsers(blockerUserId || user?.id || null)
      setItems(rows)
    } catch (error) {
      Alert.alert('Load failed', error.message)
    }

    setLoading(false)
  }, [blockerUserId])

  useEffect(() => {
    loadBlockedUsers()
  }, [loadBlockedUsers])

  async function handleUnblock(targetUserId) {
    if (!currentUserId || !targetUserId || readOnly || !isOwnProfile) return

    const { error } = await unblockUser(currentUserId, targetUserId)

    if (error) {
      Alert.alert('Unblock failed', error.message)
      return
    }

    setItems((currentItems) =>
      currentItems.filter((item) => item.blocked_id !== targetUserId)
    )
  }

  function renderItem({ item }) {
    const name = getProfileName(item.profile, 'Rental X member')

    return (
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() =>
          navigation.navigate('OwnerProfile', {
            owner: {
              id: item.blocked_id,
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
            <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '900' }}>
              {name}
            </Text>
            <Text style={{ marginTop: 3, color: '#64748b', fontSize: 12 }}>
              {item.profile?.location || item.profile?.email || 'Rental X member'}
            </Text>
            <Text style={{ marginTop: 4, color: '#94a3b8', fontSize: 11, fontWeight: '700' }}>
              Blocked on {formatDate(item.created_at)}
            </Text>
          </View>

          {isOwnProfile && !readOnly ? (
            <TouchableOpacity
              onPress={() => handleUnblock(item.blocked_id)}
              style={{
                height: 34,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: '#ecfdf5',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#059669', fontSize: 12, fontWeight: '900' }}>
                Unblock
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
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
              {isOwnProfile && !readOnly
                ? 'Manage the people you have blocked.'
                : 'Lifetime block history for this account.'}
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
              No blocked users right now.
            </Text>
          }
        />
      )}
    </SafeAreaView>
  )
}
