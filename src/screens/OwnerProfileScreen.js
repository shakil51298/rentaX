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
import { supabase } from '../lib/supabase'

function displayNameFromEmail(email) {
  if (!email) return 'Property Owner'

  return email.split('@')[0]
}

function getOwnerName(owner, profile) {
  return profile?.display_name || owner?.name || displayNameFromEmail(owner?.email)
}

function Avatar({ name, uri, size = 96 }) {
  const initial = name?.trim()?.charAt(0)?.toUpperCase() || 'O'

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#e5e7eb',
          borderWidth: 4,
          borderColor: '#fff',
        }}
      />
    )
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#dbeafe',
        borderWidth: 4,
        borderColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#1d4ed8', fontSize: 34, fontWeight: '800' }}>
        {initial}
      </Text>
    </View>
  )
}

export default function OwnerProfileScreen({ route, navigation }) {
  const owner = route.params?.owner || {}
  const ownerId = owner.id
  const [currentUser, setCurrentUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadOwnerProfile = useCallback(async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    setCurrentUser(user)

    if (!ownerId) {
      setLoading(false)
      return
    }

    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', ownerId)
      .maybeSingle()

    const { data: postData } = await supabase
      .from('properties')
      .select(`
        *,
        property_comments(id),
        property_favorites(id)
      `)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })

    const { count: followersCount } = await supabase
      .from('user_follows')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', ownerId)

    const { count: followingCount } = await supabase
      .from('user_follows')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', ownerId)

    if (user && user.id !== ownerId) {
      const { data: followData } = await supabase
        .from('user_follows')
        .select('id')
        .eq('follower_id', user.id)
        .eq('following_id', ownerId)
        .maybeSingle()

      setIsFollowing(Boolean(followData))
    }

    setProfile(profileData || null)
    setPosts(postData || [])
    setFollowers(followersCount || 0)
    setFollowing(followingCount || 0)
    setLoading(false)
  }, [ownerId])

  useEffect(() => {
    loadOwnerProfile()
  }, [loadOwnerProfile])

  async function toggleFollow() {
    if (!currentUser || !ownerId || currentUser.id === ownerId) return

    if (isFollowing) {
      const { error } = await supabase
        .from('user_follows')
        .delete()
        .eq('follower_id', currentUser.id)
        .eq('following_id', ownerId)

      if (error) {
        Alert.alert('Follow failed', error.message)
        return
      }

      setIsFollowing(false)
      setFollowers((count) => Math.max(count - 1, 0))
      return
    }

    const { error } = await supabase.from('user_follows').insert({
      follower_id: currentUser.id,
      following_id: ownerId,
    })

    if (error) {
      Alert.alert('Follow failed', error.message)
      return
    }

    setIsFollowing(true)
    setFollowers((count) => count + 1)
  }

  function renderPost({ item }) {
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('Property', { property: item })}
        style={{
          backgroundColor: '#fff',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#e5e7eb',
          padding: 12,
          marginBottom: 10,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '800', color: '#111827' }}>
          {item.title}
        </Text>

        <Text style={{ color: '#4b5563', marginTop: 4 }} numberOfLines={2}>
          {item.description || 'No description added'}
        </Text>

        <Text style={{ color: '#1877F2', fontWeight: '800', marginTop: 8 }}>
          Rent: ৳ {item.price}
        </Text>

        <Text style={{ color: '#6b7280', marginTop: 3 }}>
          {item.location || 'Location not added'}
        </Text>
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f3f4f6', justifyContent: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    )
  }

  const ownerName = getOwnerName(owner, profile)
  const isOwnProfile = currentUser?.id && currentUser.id === ownerId

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f3f4f6' }}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        ListHeaderComponent={
          <>
            <View style={{ backgroundColor: '#fff', marginBottom: 12 }}>
              <View style={{ height: 118, backgroundColor: '#1877F2' }} />

              <View style={{ paddingHorizontal: 18, paddingBottom: 18, marginTop: -48 }}>
                <Avatar name={ownerName} uri={profile?.avatar_url} />

                <View style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 25, fontWeight: '900', color: '#111827' }}>
                      {ownerName}
                    </Text>

                    {profile?.is_verified ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color="#1877F2"
                        style={{ marginLeft: 6 }}
                      />
                    ) : null}
                  </View>

                  <Text style={{ color: '#64748b', marginTop: 4 }}>
                    {profile?.user_type === 'property_owner' ? 'Property owner' : 'Rental X member'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', marginTop: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '900', fontSize: 18 }}>{posts.length}</Text>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>Posts</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '900', fontSize: 18 }}>{followers}</Text>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>Followers</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '900', fontSize: 18 }}>{following}</Text>
                    <Text style={{ color: '#64748b', fontSize: 12 }}>Following</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  {!isOwnProfile ? (
                    <TouchableOpacity
                      onPress={toggleFollow}
                      style={{
                        flex: 1,
                        backgroundColor: isFollowing ? '#e5e7eb' : '#1877F2',
                        paddingVertical: 12,
                        borderRadius: 10,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: isFollowing ? '#111827' : '#fff', fontWeight: '800' }}>
                        {isFollowing ? 'Following' : 'Follow'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    onPress={() => navigation.navigate('Chat', { owner, profile })}
                    style={{
                      flex: 1,
                      backgroundColor: '#111827',
                      paddingVertical: 12,
                      borderRadius: 10,
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '800', marginLeft: 6 }}>
                      Message
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View
              style={{
                backgroundColor: '#fff',
                padding: 16,
                marginBottom: 12,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: '#e5e7eb',
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#111827' }}>
                Owner details
              </Text>

              <Text style={{ color: '#4b5563', lineHeight: 20, marginTop: 8 }}>
                {profile?.bio || 'No owner bio added yet.'}
              </Text>

              <View style={{ marginTop: 12, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="location-outline" size={17} color="#64748b" />
                  <Text style={{ color: '#4b5563', marginLeft: 8 }}>
                    {profile?.location || 'Location not added'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="mail-outline" size={17} color="#64748b" />
                  <Text style={{ color: '#4b5563', marginLeft: 8 }}>
                    {profile?.email || owner.email || 'Email not available'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="call-outline" size={17} color="#64748b" />
                  <Text style={{ color: '#4b5563', marginLeft: 8 }}>
                    {profile?.phone || 'Phone not added'}
                  </Text>
                </View>
              </View>
            </View>

            <Text
              style={{
                paddingHorizontal: 16,
                marginBottom: 10,
                fontSize: 18,
                fontWeight: '900',
                color: '#111827',
              }}
            >
              Posts
            </Text>
          </>
        }
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#64748b', marginTop: 20 }}>
            No posts from this owner yet.
          </Text>
        }
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 28 }}
      />
    </SafeAreaView>
  )
}
