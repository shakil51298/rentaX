import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { getCachedAuthUser } from '../lib/authSession'
import { createNotification } from '../lib/notifications'
import { blockUser, fetchUserSocialCounts } from '../lib/social'
import {
  fetchOwnerResponseQuality,
  formatJoinedDate,
  getEmptyOwnerResponseQuality,
} from '../lib/ownerResponseQuality'
import { getOwnerVerificationStatus, getPropertyVerificationStatus } from '../lib/verification'
import { useAppSettings } from '../lib/appSettings'
import {
  fetchUserReviewState,
  getRelationshipSourceLabel,
  getReviewSummary,
  saveUserReview,
} from '../lib/realReviews'
import { getProfileName } from '../lib/userDisplay'

function displayNameFromEmail(email) {
  if (!email) return 'Rental X member'

  return email.split('@')[0]
}

function getOwnerName(owner, profile) {
  return profile?.display_name || owner?.name || displayNameFromEmail(owner?.email)
}

function maskPhoneNumber(value) {
  const text = String(value || '').trim()

  if (!text) return ''
  if (text.length <= 5) return text[0] + '*'.repeat(Math.max(text.length - 1, 0))

  return `${text.slice(0, 3)}${'*'.repeat(Math.max(text.length - 5, 3))}${text.slice(-2)}`
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

function ReviewStars({ value, onChange, size = 17, theme }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const active = Number(value || 0) >= star
        const icon = active ? 'star' : 'star-outline'
        const content = (
          <Ionicons
            name={icon}
            size={size}
            color={active ? '#f59e0b' : theme.mutedText}
          />
        )

        if (!onChange) {
          return <View key={star}>{content}</View>
        }

        return (
          <TouchableOpacity
            key={star}
            onPress={() => onChange(star)}
            activeOpacity={0.82}
            style={{
              width: size + 15,
              height: size + 15,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {content}
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function ReviewCard({ review, theme }) {
  const reviewerProfile = review.reviewer_profile || {}
  const reviewerName = getProfileName(reviewerProfile, 'Rental X member')
  const createdAt = review.created_at ? new Date(review.created_at).toLocaleDateString() : ''

  return (
    <View
      style={{
        backgroundColor: theme.surfaceMuted,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.border,
        padding: 12,
        marginTop: 9,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 9,
          }}
        >
          <Text style={{ color: theme.accentStrong, fontSize: 13, fontWeight: '900' }}>
            {reviewerName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
            {reviewerName}
          </Text>
          <Text style={{ color: theme.mutedText, fontSize: 10, fontWeight: '800', marginTop: 2 }}>
            {getRelationshipSourceLabel(review.relationship_source)} connection
            {createdAt ? ` · ${createdAt}` : ''}
          </Text>
        </View>
        <ReviewStars value={review.rating} theme={theme} size={14} />
      </View>

      {review.body ? (
        <Text style={{ color: theme.text, fontSize: 12, lineHeight: 18, marginTop: 8 }}>
          {review.body}
        </Text>
      ) : null}
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
  const [showPhone, setShowPhone] = useState(false)
  const [responseQuality, setResponseQuality] = useState(getEmptyOwnerResponseQuality())
  const [reviewState, setReviewState] = useState({
    reviews: [],
    summary: getReviewSummary([]),
    eligibility: { eligible: false, sources: [], primarySource: null },
    myReview: null,
    setupNeeded: false,
  })
  const [reviewModalVisible, setReviewModalVisible] = useState(false)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewBody, setReviewBody] = useState('')
  const [reviewSaving, setReviewSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [imageViewer, setImageViewer] = useState({
    visible: false,
    title: '',
    uri: null,
  })

  const loadOwnerProfile = useCallback(async () => {
    setLoading(true)

    const user = await getCachedAuthUser()

    setCurrentUser(user)

    if (!ownerId) {
      setLoading(false)
      return
    }

    const [
      profileResponse,
      postsResponse,
      followersResponse,
      followResponse,
      counts,
      quality,
      reviews,
    ] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', ownerId)
        .maybeSingle(),
      supabase
        .from('properties')
        .select(`
          *,
          property_comments(id),
          property_favorites(id)
        `)
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false }),
      supabase
        .from('user_follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', ownerId),
      user && user.id !== ownerId
        ? supabase
            .from('user_follows')
            .select('id')
            .eq('follower_id', user.id)
            .eq('following_id', ownerId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      fetchUserSocialCounts(ownerId),
      fetchOwnerResponseQuality(ownerId).catch(() =>
        getEmptyOwnerResponseQuality()
      ),
      fetchUserReviewState({
        revieweeId: ownerId,
        reviewerId: user?.id,
      }).catch(() => ({
        reviews: [],
        summary: getReviewSummary([]),
        eligibility: { eligible: false, sources: [], primarySource: null },
        myReview: null,
        setupNeeded: true,
      })),
    ])
    const profileData = profileResponse.data
    const postData = postsResponse.data
    const followersCount = followersResponse.count

    setIsFollowing(Boolean(followResponse.data))

    setProfile(profileData || null)
    setPosts((postData || []).filter((item) => !item.admin_is_banned && item.status !== 'paused'))
    setFollowers(followersCount || counts.followers || 0)
    setFollowing(counts.following || 0)
    setResponseQuality(quality)
    setReviewState(reviews)
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

  function openReviewModal() {
    if (!currentUser?.id) {
      Alert.alert('Login required', 'Please log in before writing a real review.')
      return
    }

    if (currentUser.id === ownerId) {
      Alert.alert('Not available', 'You cannot review your own profile.')
      return
    }

    if (!reviewState.eligibility?.eligible) {
      Alert.alert(
        'Real review locked',
        'Only users who chatted, had an accepted visit, or completed a rental connection can review this profile.'
      )
      return
    }

    setReviewRating(reviewState.myReview?.rating || 5)
    setReviewBody(reviewState.myReview?.body || '')
    setReviewModalVisible(true)
  }

  async function submitReview() {
    if (reviewSaving) return

    setReviewSaving(true)

    try {
      await saveUserReview({
        reviewerId: currentUser?.id,
        revieweeId: ownerId,
        rating: reviewRating,
        body: reviewBody,
        relationshipSource: reviewState.eligibility?.primarySource || 'chat',
      })
      setReviewModalVisible(false)
      const nextReviewState = await fetchUserReviewState({
        revieweeId: ownerId,
        reviewerId: currentUser?.id,
      })
      setReviewState(nextReviewState)
      Alert.alert('Review saved', 'Your real review is now visible on this profile.')
    } catch (error) {
      const message = /user_reviews|has_real_review_connection|violates row-level security|policy/i.test(error.message || '')
        ? 'Run supabase-real-reviews-features.sql, then make sure you have a chat, accepted visit, or accepted rental with this user.'
        : error.message
      Alert.alert('Review failed', message)
    } finally {
      setReviewSaving(false)
    }
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
  const reviewSummary = reviewState.summary || getReviewSummary([])
  const canReview = !isOwnProfile && reviewState.eligibility?.eligible
  const reviewConnectionLabel = reviewState.eligibility?.primarySource
    ? getRelationshipSourceLabel(reviewState.eligibility.primarySource)
    : null

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
                    Real reviews
                  </Text>
                  <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 4, lineHeight: 18 }}>
                    Only users with a real chat, visit, or rental connection can review.
                  </Text>
                </View>
                <View
                  style={{
                    minWidth: 68,
                    alignItems: 'center',
                    backgroundColor: theme.surfaceMuted,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.border,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900' }}>
                    {reviewSummary.averageLabel}
                  </Text>
                  <ReviewStars value={Math.round(reviewSummary.average || 0)} theme={theme} size={12} />
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
                    {reviewSummary.total
                      ? `${reviewSummary.total} trusted review${reviewSummary.total === 1 ? '' : 's'}`
                      : 'No trusted reviews yet'}
                  </Text>
                  <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 3, lineHeight: 16 }}>
                    {canReview
                      ? `${reviewConnectionLabel} connection verified.`
                      : reviewState.setupNeeded
                        ? 'Review setup needs the Supabase SQL file.'
                        : isOwnProfile
                          ? 'Your reviews from renters and owners will appear here.'
                          : 'Review unlocks after chat, accepted visit, or accepted rental.'}
                  </Text>
                </View>

                {!isOwnProfile ? (
                  <TouchableOpacity
                    onPress={openReviewModal}
                    activeOpacity={0.86}
                    style={{
                      height: 42,
                      borderRadius: 14,
                      paddingHorizontal: 13,
                      backgroundColor: canReview ? theme.accent : theme.surfaceMuted,
                      borderWidth: canReview ? 0 : 1,
                      borderColor: theme.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <Ionicons
                      name={canReview ? 'star' : 'lock-closed-outline'}
                      size={16}
                      color={canReview ? '#fff' : theme.mutedText}
                    />
                    <Text
                      style={{
                        color: canReview ? '#fff' : theme.mutedText,
                        fontSize: 12,
                        fontWeight: '900',
                        marginLeft: 5,
                      }}
                    >
                      {reviewState.myReview ? 'Edit' : 'Review'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {reviewState.reviews.slice(0, 3).map((review) => (
                <ReviewCard key={review.id} review={review} theme={theme} />
              ))}
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
                  <Ionicons name="at-outline" size={17} color={theme.mutedText} />
                  <Text style={{ color: theme.mutedText, marginLeft: 8 }}>
                    {profile?.rentalx_id ? `@${profile.rentalx_id}` : 'ID not added'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="location-outline" size={17} color={theme.mutedText} />
                  <Text style={{ color: theme.mutedText, marginLeft: 8 }}>
                    {profile?.location || 'Region not added'}
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
                  <Text style={{ color: theme.mutedText, marginLeft: 8, flex: 1 }}>
                    {profile?.phone
                      ? showPhone
                        ? profile.phone
                        : maskPhoneNumber(profile.phone)
                      : 'Phone not added'}
                  </Text>
                  {profile?.phone ? (
                    <TouchableOpacity
                      onPress={() => setShowPhone((current) => !current)}
                      activeOpacity={0.86}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: theme.surfaceMuted,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons
                        name={showPhone ? 'eye-off-outline' : 'eye-outline'}
                        size={17}
                        color={theme.mutedText}
                      />
                    </TouchableOpacity>
                  ) : null}
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

      <Modal
        visible={reviewModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReviewModalVisible(false)}
      >
        <Pressable
          onPress={() => setReviewModalVisible(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(15,23,42,0.42)',
            justifyContent: 'flex-end',
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: theme.surface,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderWidth: 1,
              borderColor: theme.border,
              paddingHorizontal: 18,
              paddingTop: 16,
              paddingBottom: 22,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900' }}>
                  {reviewState.myReview ? 'Edit real review' : 'Write real review'}
                </Text>
                <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                  {reviewConnectionLabel
                    ? `${reviewConnectionLabel} connection verified with ${ownerName}.`
                    : 'Your connection will be checked before saving.'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReviewModalVisible(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: theme.surfaceMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={18} color={theme.text} />
              </TouchableOpacity>
            </View>

            <View style={{ alignItems: 'center', marginTop: 18 }}>
              <ReviewStars value={reviewRating} onChange={setReviewRating} theme={theme} size={28} />
            </View>

            <TextInput
              value={reviewBody}
              onChangeText={setReviewBody}
              placeholder="Share your honest experience..."
              placeholderTextColor={theme.mutedText}
              multiline
              maxLength={1000}
              style={{
                minHeight: 112,
                textAlignVertical: 'top',
                color: theme.text,
                backgroundColor: theme.surfaceMuted,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.border,
                paddingHorizontal: 13,
                paddingVertical: 12,
                marginTop: 16,
                fontSize: 13,
                lineHeight: 19,
              }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
              <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '800' }}>
                {reviewBody.length}/1000
              </Text>
            </View>

            <TouchableOpacity
              onPress={submitReview}
              disabled={reviewSaving}
              activeOpacity={0.86}
              style={{
                height: 48,
                borderRadius: 16,
                backgroundColor: theme.accent,
                opacity: reviewSaving ? 0.65 : 1,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                marginTop: 14,
              }}
            >
              {reviewSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="shield-checkmark-outline" size={18} color="#fff" />
              )}
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900', marginLeft: 7 }}>
                Save review
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
