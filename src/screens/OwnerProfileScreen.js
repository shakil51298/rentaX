import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { createNotification } from '../lib/notifications'
import { blockUser, fetchUserSocialCounts } from '../lib/social'
import {
  fetchOwnerResponseQuality,
  formatJoinedDate,
  getEmptyOwnerResponseQuality,
} from '../lib/ownerResponseQuality'
import { getOwnerVerificationStatus, getPropertyVerificationStatus } from '../lib/verification'
import { useAppSettings } from '../lib/appSettings'

function displayNameFromEmail(email) {
  if (!email) return 'Rental X member'

  return email.split('@')[0]
}

function getOwnerName(owner, profile) {
  return profile?.display_name || owner?.name || displayNameFromEmail(owner?.email)
}

function Avatar({ name, uri, size = 96, theme }) {
  const initial = name?.trim()?.charAt(0)?.toUpperCase() || 'O'

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.surfaceMuted,
          borderWidth: 4,
          borderColor: theme.surface,
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
        backgroundColor: theme.accentSoft,
        borderWidth: 4,
        borderColor: theme.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: theme.accentStrong, fontSize: 34, fontWeight: '800' }}>
        {initial}
      </Text>
    </View>
  )
}

function TrustMetric({ label, value, accent = '#111827', theme }) {
  return (
    <View
      style={{
        width: '48.5%',
        backgroundColor: theme.surfaceMuted,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.border,
        paddingHorizontal: 12,
        paddingVertical: 11,
        marginBottom: 10,
      }}
    >
      <Text style={{ color: accent, fontSize: 16, fontWeight: '900' }}>{value}</Text>
      <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '700', marginTop: 4 }}>
        {label}
      </Text>
    </View>
  )
}

export default function OwnerProfileScreen({ route, navigation }) {
  const { theme } = useAppSettings()
  const owner = route.params?.owner || {}
  const ownerId = owner.id
  const [currentUser, setCurrentUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [responseQuality, setResponseQuality] = useState(getEmptyOwnerResponseQuality())
  const [loading, setLoading] = useState(true)
  const [imageViewer, setImageViewer] = useState({
    visible: false,
    title: '',
    uri: null,
  })

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
    setPosts((postData || []).filter((item) => !item.admin_is_banned && item.status !== 'paused'))
    const counts = await fetchUserSocialCounts(ownerId)
    const quality = await fetchOwnerResponseQuality(ownerId).catch(() =>
      getEmptyOwnerResponseQuality()
    )

    setFollowers(followersCount || counts.followers || 0)
    setFollowing(counts.following || 0)
    setResponseQuality(quality)
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
    await createNotification({
      recipientId: ownerId,
      actorId: currentUser.id,
      type: 'user_follow',
      title: 'New follower',
      body: 'started following you',
      eventKey: `user_follow:${ownerId}:${currentUser.id}`,
    })
  }

  async function handleBlockOwner() {
    if (!currentUser?.id || !ownerId || currentUser.id === ownerId) return

    Alert.alert(
      'Block this user?',
      'They will be moved to your block list and any follow connection between you will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const { error } = await blockUser(currentUser.id, ownerId)

            if (error) {
              Alert.alert('Block failed', error.message)
              return
            }

            navigation.goBack()
          },
        },
      ]
    )
  }

  function openImageViewer(title, uri) {
    if (!uri) return

    setImageViewer({
      visible: true,
      title,
      uri,
    })
  }

  function closeImageViewer() {
    setImageViewer({
      visible: false,
      title: '',
      uri: null,
    })
  }

  function renderPost({ item }) {
    const isVerifiedProperty = getPropertyVerificationStatus(item) === 'verified'

    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('Property', { property: item })}
        style={{
          backgroundColor: theme.surface,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.border,
          padding: 12,
          marginBottom: 10,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '800', color: theme.text }}>
          {item.title}
        </Text>

        <Text style={{ color: theme.mutedText, marginTop: 4 }} numberOfLines={2}>
          {item.description || 'No description added'}
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <Text style={{ color: '#1877F2', fontWeight: '800' }}>
            Rent: ৳ {item.price}
          </Text>

          {isVerifiedProperty ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#eff6ff',
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 3,
                marginLeft: 8,
              }}
            >
              <Ionicons name="checkmark-circle" size={12} color="#2563eb" />
              <Text style={{ color: '#2563eb', fontSize: 11, fontWeight: '800', marginLeft: 4 }}>
                Verified
              </Text>
            </View>
          ) : null}
        </View>

          <Text style={{ color: theme.mutedText, marginTop: 3 }}>
            {item.location || 'Location not added'}
          </Text>
        </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} />
      </SafeAreaView>
    )
  }

  const ownerName = getOwnerName(owner, profile)
  const isOwnProfile = currentUser?.id && currentUser.id === ownerId
  const isVerifiedOwner = getOwnerVerificationStatus(profile) === 'verified'
  const activeListingsCount = posts.filter(
    (item) => !item.admin_is_banned && (item.status || 'open') === 'open'
  ).length
  const joinedDateLabel = formatJoinedDate(profile?.created_at)
  const responseRateLabel =
    responseQuality.responseRate == null ? 'New owner' : `${responseQuality.responseRate}%`

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        ListHeaderComponent={
          <>
            <View style={{ backgroundColor: theme.surface, marginBottom: 12 }}>
              <View style={{ height: 118, backgroundColor: theme.accent }}>
                {profile?.cover_url ? (
                  <Image
                    source={{ uri: profile.cover_url }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                ) : null}
              </View>

              <View style={{ paddingHorizontal: 18, paddingBottom: 18, marginTop: -48 }}>
                <Avatar name={ownerName} uri={profile?.avatar_url} theme={theme} />

                <View style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 25, fontWeight: '900', color: theme.text }}>
                        {ownerName}
                      </Text>

                      {isVerifiedOwner ? (
                        <Ionicons
                          name="checkmark-circle"
                        size={22}
                        color="#1877F2"
                          style={{ marginLeft: 6 }}
                        />
                      ) : null}
                    </View>

                  <Text style={{ color: theme.mutedText, marginTop: 4 }}>
                      {profile?.user_type === 'property_owner' ? 'Property owner' : 'Rental X member'}
                    </Text>
                </View>

                <View style={{ flexDirection: 'row', marginTop: 16 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '900', fontSize: 18, color: theme.text }}>{posts.length}</Text>
                    <Text style={{ color: theme.mutedText, fontSize: 12 }}>Posts</Text>
                  </View>

                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('Connections', {
                        userId: ownerId,
                        kind: 'followers',
                        title: 'Followers',
                        isOwnProfile,
                      })
                    }
                    style={{ flex: 1 }}
                  >
                    <Text style={{ fontWeight: '900', fontSize: 18, color: theme.text }}>{followers}</Text>
                    <Text style={{ color: theme.mutedText, fontSize: 12 }}>Followers</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('Connections', {
                        userId: ownerId,
                        kind: 'following',
                        title: 'Following',
                        isOwnProfile,
                      })
                    }
                    style={{ flex: 1 }}
                  >
                    <Text style={{ fontWeight: '900', fontSize: 18, color: theme.text }}>{following}</Text>
                    <Text style={{ color: theme.mutedText, fontSize: 12 }}>Following</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  {!isOwnProfile ? (
                    <TouchableOpacity
                      onPress={toggleFollow}
                      activeOpacity={0.85}
                      style={{
                        width: 52,
                        height: 52,
                        backgroundColor: isFollowing ? theme.surfaceMuted : theme.accent,
                        borderRadius: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: isFollowing ? 1 : 0,
                        borderColor: theme.border,
                      }}
                    >
                      <Ionicons
                        name={isFollowing ? 'person-remove-outline' : 'person-add-outline'}
                        size={20}
                        color={isFollowing ? theme.text : '#fff'}
                      />
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate('MainTabs', {
                        screen: 'Chat',
                        params: { owner, profile },
                      })
                    }
                    activeOpacity={0.85}
                    style={{
                      width: 52,
                      backgroundColor: theme.accent,
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 52,
                      borderRadius: 16,
                    }}
                  >
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
                  </TouchableOpacity>

                  {!isOwnProfile ? (
                    <TouchableOpacity
                      onPress={() =>
                        navigation.navigate('ReportIssue', {
                          kind: 'user',
                          owner: {
                            id: ownerId,
                            name: ownerName,
                          },
                        })
                      }
                      activeOpacity={0.85}
                      style={{
                        width: 52,
                        height: 52,
                        backgroundColor: theme.surfaceMuted,
                        borderRadius: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Ionicons name="flag-outline" size={18} color="#f59e0b" />
                    </TouchableOpacity>
                  ) : null}

                  {!isOwnProfile ? (
                    <TouchableOpacity
                      onPress={handleBlockOwner}
                      activeOpacity={0.85}
                      style={{
                        width: 52,
                        height: 52,
                        backgroundColor: theme.surfaceMuted,
                        borderRadius: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Ionicons name="ban-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>

            <View
              style={{
                backgroundColor: theme.surface,
                padding: 16,
                marginBottom: 12,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: theme.text }}>
                    Owner response quality
                  </Text>
                  <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 4, lineHeight: 18 }}>
                    Based on recent chat replies and currently active rental listings.
                  </Text>
                </View>

                <View
                  style={{
                    backgroundColor: isVerifiedOwner ? theme.accentSoft : theme.surfaceMuted,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: isVerifiedOwner ? theme.accent : theme.border,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <Ionicons
                    name={isVerifiedOwner ? 'checkmark-circle' : 'shield-outline'}
                    size={13}
                    color={isVerifiedOwner ? theme.accent : theme.mutedText}
                  />
                  <Text
                    style={{
                      color: isVerifiedOwner ? theme.accent : theme.text,
                      fontSize: 11,
                      fontWeight: '900',
                      marginLeft: 5,
                    }}
                  >
                    {isVerifiedOwner ? 'Verified owner' : 'Unverified owner'}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  marginTop: 14,
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                }}
              >
                <TrustMetric label="Response rate" value={responseRateLabel} accent={theme.accent} theme={theme} />
                <TrustMetric label="Average reply time" value={responseQuality.averageReplyLabel} accent="#0f766e" theme={theme} />
                <TrustMetric label="Active listings" value={String(activeListingsCount)} accent="#7c3aed" theme={theme} />
                <TrustMetric label="Joined" value={joinedDateLabel} accent={theme.text} theme={theme} />
              </View>

              <View
                style={{
                  marginTop: 2,
                  backgroundColor: theme.surfaceMuted,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: theme.border,
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                }}
              >
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
                  {responseQuality.usuallyRepliesLabel}
                </Text>
                <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
                  {responseQuality.respondedCount
                    ? `Built from ${responseQuality.respondedCount} answered renter conversation${responseQuality.respondedCount === 1 ? '' : 's'}.`
                    : 'This owner has not answered enough renter chats yet to build a reply pattern.'}
                </Text>
              </View>
            </View>

            <View
              style={{
                backgroundColor: theme.surface,
                padding: 16,
                marginBottom: 12,
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: theme.border,
                borderRadius: 16,
              }}
            >
              <Text style={{ fontSize: 18, fontWeight: '900', color: theme.text }}>
                Profile details
              </Text>

              <Text style={{ color: theme.mutedText, lineHeight: 20, marginTop: 8 }}>
                {profile?.bio || 'No profile bio added yet.'}
              </Text>

              <View style={{ marginTop: 12, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="location-outline" size={17} color={theme.mutedText} />
                  <Text style={{ color: theme.mutedText, marginLeft: 8 }}>
                    {profile?.location || 'Location not added'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="mail-outline" size={17} color={theme.mutedText} />
                  <Text style={{ color: theme.mutedText, marginLeft: 8 }}>
                    {profile?.email || owner.email || 'Email not available'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="call-outline" size={17} color={theme.mutedText} />
                  <Text style={{ color: theme.mutedText, marginLeft: 8 }}>
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
                color: theme.text,
              }}
            >
              Posts
            </Text>
          </>
        }
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: theme.mutedText, marginTop: 20 }}>
            No posts yet.
          </Text>
        }
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 28 }}
      />
    </SafeAreaView>
  )
}
