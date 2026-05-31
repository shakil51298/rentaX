import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import ActionSheetModal from '../components/common/ActionSheetModal'
import MediaViewer from '../components/common/MediaViewer'
import PostCard from '../components/home/PostCard'
import { fetchPropertiesWithProfiles } from '../lib/properties'
import {
  createAvailabilityConfirmationPayload,
  getAvailabilityFreshnessMeta,
  isAvailabilityConfirmationDue,
  isUrgentProperty,
} from '../lib/propertyLifecycle'
import { getPropertyVerificationStatus } from '../lib/verification'
import { useAppSettings } from '../lib/appSettings'
import { buildLeadTotals, fetchOwnerLeadDashboard } from '../lib/ownerLeadDashboard'

function LeadMetric({ icon, label, value, theme, tint }) {
  const metricTint = tint || theme.accent

  return (
    <View
      style={{
        flex: 1,
        minWidth: '30%',
        borderRadius: 13,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.surfaceMuted,
        paddingHorizontal: 9,
        paddingVertical: 9,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Ionicons name={icon} size={14} color={metricTint} />
        <Text
          numberOfLines={1}
          style={{ color: theme.mutedText, fontSize: 10, fontWeight: '900', marginLeft: 5, flexShrink: 1 }}
        >
          {label}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ color: theme.text, fontSize: 16, fontWeight: '900', marginTop: 5 }}
      >
        {value}
      </Text>
    </View>
  )
}

function OwnerLeadSummary({ totals, theme }) {
  return (
    <View
      style={{
        borderRadius: 15,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.surfaceMuted,
        padding: 12,
        marginBottom: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: '900' }}>
            Owner lead dashboard
          </Text>
          <Text style={{ color: theme.mutedText, fontSize: 11, lineHeight: 16, marginTop: 3 }}>
            Total renter activity across your live and managed ads.
          </Text>
        </View>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="analytics-outline" size={18} color={theme.accent} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <LeadMetric icon="eye-outline" label="Views" value={totals.views || 0} theme={theme} />
        <LeadMetric icon="heart-outline" label="Saves" value={totals.saves || 0} theme={theme} tint="#dc2626" />
        <LeadMetric icon="chatbubble-ellipses-outline" label="Chats" value={totals.chats || 0} theme={theme} />
        <LeadMetric icon="calendar-outline" label="Visits" value={totals.visitRequests || 0} theme={theme} tint="#059669" />
        <LeadMetric icon="document-text-outline" label="Applications" value={totals.applications || 0} theme={theme} tint="#7c3aed" />
        <LeadMetric icon="speedometer-outline" label="Response" value={totals.responseRateLabel || 'New'} theme={theme} tint="#ea580c" />
      </View>
    </View>
  )
}

function ListingLeadDashboard({ metrics, theme }) {
  const data = metrics || {}

  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 16,
        padding: 11,
        marginBottom: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Ionicons name="bar-chart-outline" size={16} color={theme.accent} />
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900', marginLeft: 6 }}>
            Leads
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={{ color: theme.mutedText, fontSize: 11, fontWeight: '800', maxWidth: 190, flexShrink: 1 }}
        >
          {data.usuallyRepliesLabel || 'No reply history yet'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
        <LeadMetric icon="eye-outline" label="Views" value={data.views || 0} theme={theme} />
        <LeadMetric icon="heart-outline" label="Saves" value={data.saves || 0} theme={theme} tint="#dc2626" />
        <LeadMetric icon="chatbubble-ellipses-outline" label="Chats" value={data.chats || 0} theme={theme} />
        <LeadMetric icon="calendar-outline" label="Visits" value={data.visitRequests || 0} theme={theme} tint="#059669" />
        <LeadMetric icon="document-text-outline" label="Applications" value={data.applications || 0} theme={theme} tint="#7c3aed" />
        <LeadMetric icon="speedometer-outline" label="Response" value={data.responseRateLabel || 'New'} theme={theme} tint="#ea580c" />
      </View>
    </View>
  )
}

export default function AdsManagementScreen({ navigation }) {
  const { theme } = useAppSettings()
  const [currentUser, setCurrentUser] = useState(null)
  const [userType, setUserType] = useState('renter')
  const [loading, setLoading] = useState(true)
  const [posts, setPosts] = useState([])
  const [pendingVisitCount, setPendingVisitCount] = useState(0)
  const [leadDashboard, setLeadDashboard] = useState({
    byPropertyId: {},
    totals: buildLeadTotals({}),
  })
  const [mediaViewer, setMediaViewer] = useState({
    visible: false,
    media: [],
    index: 0,
  })
  const [actionPost, setActionPost] = useState(null)

  const loadAds = useCallback(async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    setCurrentUser(user || null)

    if (!user?.id) {
      setUserType('renter')
      setPosts([])
      setPendingVisitCount(0)
      setLeadDashboard({ byPropertyId: {}, totals: buildLeadTotals({}) })
      setLoading(false)
      return
    }

    const metadata = user.user_metadata || {}
    const fallbackUserType = metadata.user_type || 'renter'

    const { data: dbProfile } = await supabase
      .from('user_profiles')
      .select('user_type')
      .eq('user_id', user.id)
      .maybeSingle()

    const resolvedUserType = dbProfile?.user_type || fallbackUserType
    setUserType(resolvedUserType)

    if (resolvedUserType !== 'property_owner') {
      setPosts([])
      setPendingVisitCount(0)
      setLeadDashboard({ byPropertyId: {}, totals: buildLeadTotals({}) })
      setLoading(false)
      return
    }

    try {
      const [{ count }, ownerPosts] = await Promise.all([
        supabase
          .from('property_visit_requests')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', user.id)
          .eq('status', 'pending'),
        fetchPropertiesWithProfiles({ ownerId: user.id, includeBanned: true, includePaused: true }),
      ])
      const nextLeadDashboard = await fetchOwnerLeadDashboard({
        ownerId: user.id,
        properties: ownerPosts,
      }).catch(() => {
        const byPropertyId = ownerPosts.reduce((itemsByPropertyId, post) => ({
          ...itemsByPropertyId,
          [String(post.id)]: {
            views: Number(post.view_count || 0),
            saves: post.property_favorites?.length || 0,
            chats: 0,
            visitRequests: 0,
            pendingVisitRequests: 0,
            applications: 0,
            pendingApplications: 0,
            responseRate: null,
            responseRateLabel: 'New',
            averageReplyLabel: 'No replies yet',
            usuallyRepliesLabel: 'No reply history yet',
          },
        }), {})

        return {
          byPropertyId,
          totals: buildLeadTotals(byPropertyId),
        }
      })

      setPendingVisitCount(nextLeadDashboard.totals?.pendingVisitRequests || count || 0)
      setLeadDashboard(nextLeadDashboard)
      setPosts(ownerPosts)
    } catch (error) {
      Alert.alert('Error', error.message)
    }

    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadAds()
    }, [loadAds])
  )

  function openMedia(media, index) {
    setMediaViewer({
      visible: true,
      media,
      index,
    })
  }

  function closeMediaViewer() {
    setMediaViewer({
      visible: false,
      media: [],
      index: 0,
    })
  }

  function closeActionSheet() {
    setActionPost(null)
  }

  function updateLocalReaction(propertyId, reaction) {
    setPosts((oldPosts) =>
      oldPosts.map((post) => {
        if (post.id !== propertyId) return post

        const oldReactions = post.property_reactions || []
        const withoutMine = oldReactions.filter((item) => item.user_id !== currentUser?.id)

        if (!reaction) {
          return {
            ...post,
            property_reactions: withoutMine,
          }
        }

        return {
          ...post,
          property_reactions: [
            ...withoutMine,
            {
              id: `${propertyId}-${currentUser?.id}`,
              property_id: propertyId,
              user_id: currentUser?.id,
              reaction,
            },
          ],
        }
      })
    )
  }

  async function toggleLike(propertyId) {
    if (!currentUser) return

    const post = posts.find((item) => item.id === propertyId)
    const myReaction = post?.property_reactions?.find((item) => item.user_id === currentUser.id)

    if (myReaction) {
      const { error } = await supabase
        .from('property_reactions')
        .delete()
        .eq('property_id', propertyId)
        .eq('user_id', currentUser.id)

      if (error) {
        Alert.alert('Error', error.message)
        return
      }

      updateLocalReaction(propertyId, null)
      return
    }

    const { error } = await supabase.from('property_reactions').insert({
      property_id: propertyId,
      user_id: currentUser.id,
      reaction: '👍',
    })

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    updateLocalReaction(propertyId, '👍')
  }

  async function toggleFavorite(post) {
    if (!currentUser) return

    const isFavorite = post.property_favorites?.some((item) => item.user_id === currentUser.id)

    if (isFavorite) {
      const { error } = await supabase
        .from('property_favorites')
        .delete()
        .eq('property_id', post.id)
        .eq('user_id', currentUser.id)

      if (error) {
        Alert.alert('Error', error.message)
        return
      }

      setPosts((oldPosts) =>
        oldPosts.map((item) =>
          item.id === post.id
            ? {
              ...item,
              property_favorites: item.property_favorites.filter((fav) => fav.user_id !== currentUser.id),
            }
            : item
        )
      )
      return
    }

    const { error } = await supabase.from('property_favorites').insert({
      property_id: post.id,
      user_id: currentUser.id,
    })

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    setPosts((oldPosts) =>
      oldPosts.map((item) =>
        item.id === post.id
          ? {
            ...item,
            property_favorites: [
              ...(item.property_favorites || []),
              {
                id: `${post.id}-${currentUser.id}`,
                property_id: post.id,
                user_id: currentUser.id,
              },
            ],
          }
          : item
      )
    )
  }

  async function sharePost(post) {
    try {
      await Share.share({
        message: `${post.title}\nRent: ৳ ${post.price}\nLocation: ${post.location || 'Location not added'}\n\n${post.description || ''}`,
      })
    } catch (_error) {
      Alert.alert('Share unavailable', 'Could not open share options right now.')
    }
  }

  function openComments(post) {
    navigation.navigate('MainTabs', {
      screen: 'Home',
      params: {
        openCommentsForPostId: String(post.id),
        openCommentsForPost: post,
        openCommentsRequestId: `ads-management-${post.id}-${Date.now()}`,
      },
    })
  }

  async function deletePost(post) {
    closeActionSheet()
    Alert.alert(
      'Delete ad',
      'This will remove the post from your feed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const previousPosts = posts
            setPosts((currentPosts) => currentPosts.filter((item) => item.id !== post.id))

            const propertyId = String(post.id)

            try {
              const { data: comments } = await supabase
                .from('property_comments')
                .select('id')
                .eq('property_id', propertyId)

              const commentIds = (comments || []).map((item) => item.id)

              if (commentIds.length) {
                await supabase
                  .from('property_comment_likes')
                  .delete()
                  .in('comment_id', commentIds)
              }

              await supabase.from('property_comments').delete().eq('property_id', propertyId)
              await supabase.from('property_reactions').delete().eq('property_id', propertyId)
              await supabase.from('property_favorites').delete().eq('property_id', propertyId)
              await supabase.from('notifications').delete().eq('property_id', propertyId)

              const { error } = await supabase
                .from('properties')
                .delete()
                .eq('id', post.id)
                .eq('owner_id', currentUser?.id)

              if (error) {
                throw error
              }
            } catch (error) {
              setPosts(previousPosts)
              Alert.alert('Delete failed', error.message)
            }
          },
        },
      ]
    )
  }

  function openPostActions(post) {
    setActionPost(post)
  }

  async function updatePostLifecycle(post, updates, options = {}) {
    if (!currentUser?.id || !post?.id) return

    const previousPosts = posts
    const nextPostState = {
      ...post,
      ...updates,
    }

    setPosts((currentPosts) =>
      currentPosts.map((item) =>
        item.id === post.id
          ? nextPostState
          : item
      )
    )

    closeActionSheet()

    const { error } = await supabase
      .from('properties')
      .update(updates)
      .eq('id', post.id)
      .eq('owner_id', currentUser.id)

    if (error) {
      setPosts(previousPosts)
      Alert.alert(
        options.errorTitle || 'Update failed',
        options.errorMessage || 'Run supabase-property-status-features.sql in Supabase, then try again.'
      )
      return
    }

    if (options.successTitle || options.successMessage) {
      Alert.alert(options.successTitle || 'Updated', options.successMessage || 'Post updated.')
    }
  }

  async function refreshListing(post) {
    await updatePostLifecycle(
      post,
      {
        refreshed_at: new Date().toISOString(),
      },
      {
        successTitle: 'Listing refreshed',
        successMessage: 'This ad now gets a fresh boost in the feed.',
      }
    )
  }

  async function confirmListingAvailability(post) {
    await updatePostLifecycle(
      post,
      createAvailabilityConfirmationPayload(currentUser?.id),
      {
        successTitle: 'Availability confirmed',
        successMessage: 'Renters will now see this listing as verified today.',
        errorMessage: 'Run supabase-fresh-listing-verification-features.sql in Supabase, then try again.',
      }
    )
  }

  async function toggleUrgent(post) {
    const isUrgent = isUrgentProperty(post)
    const urgentUntil = isUrgent
      ? null
      : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()

    await updatePostLifecycle(
      post,
      {
        urgent_until: urgentUntil,
        refreshed_at: isUrgent ? post.refreshed_at || post.created_at : new Date().toISOString(),
      },
      {
        successTitle: isUrgent ? 'Urgent removed' : 'Marked urgent',
        successMessage: isUrgent
          ? 'This ad is back to normal feed priority.'
          : 'Renters will see this listing treated as urgent for the next 3 days.',
      }
    )
  }

  async function duplicateListing(post) {
    if (!currentUser?.id) return

    closeActionSheet()

    const availabilityPayload = createAvailabilityConfirmationPayload(currentUser.id)
    const payload = {
      title: post.title ? `${post.title} (Copy)` : 'Copied listing',
      description: post.description || '',
      price: post.price || '',
      beds: post.beds ?? null,
      baths: post.baths ?? null,
      size_sqft: post.size_sqft ?? null,
      floor_no: post.floor_no ?? null,
      furnishing_status: post.furnishing_status || null,
      tenant_type: post.tenant_type || null,
      parking: Boolean(post.parking),
      lift_available: Boolean(post.lift_available),
      generator_backup: Boolean(post.generator_backup),
      gas_available: Boolean(post.gas_available),
      pet_friendly: Boolean(post.pet_friendly),
      available_from: post.available_from || null,
      facing_direction: post.facing_direction || null,
      has_balcony: Boolean(post.has_balcony),
      service_charge_included: Boolean(post.service_charge_included),
      location: post.location || '',
      owner_id: currentUser.id,
      owner_email: post.owner_email || currentUser.email,
      owner_name: post.owner_name || currentUser.user_metadata?.name || currentUser.email,
      image_url: post.image_url || null,
      media: Array.isArray(post.media) ? post.media : [],
      status: 'open',
      urgent_until: null,
      duplicated_from_id: String(post.id),
      verification_status: 'unverified',
      verification_requested_at: null,
      verification_rejection_reason: null,
      admin_is_banned: false,
      ...availabilityPayload,
    }

    const { data, error } = await supabase.from('properties').insert(payload).select('*').single()

    if (error) {
      const setupMessage = /availability_confirmed_at|availability_confirmation_due_at|availability_confirmed_by/i.test(error.message || '')
        ? 'Run supabase-fresh-listing-verification-features.sql in Supabase, then try again.'
        : 'Run supabase-property-status-features.sql in Supabase, then try again.'

      Alert.alert(
        'Duplicate failed',
        setupMessage
      )
      return
    }

    await loadAds()
    Alert.alert('Listing duplicated', 'A copied ad was created and is ready to edit or publish.')
  }

  async function requestPostVerification(post) {
    if (!currentUser?.id || !post?.id) return

    closeActionSheet()

    const currentStatus = getPropertyVerificationStatus(post)

    if (currentStatus === 'verified') {
      return
    }

    const previousPosts = posts
    const requestedAt = new Date().toISOString()

    setPosts((currentPosts) =>
      currentPosts.map((item) =>
        item.id === post.id
          ? {
              ...item,
              verification_status: 'pending',
              verification_requested_at: requestedAt,
            }
          : item
      )
    )

    const { error } = await supabase
      .from('properties')
      .update({
        verification_status: 'pending',
        verification_requested_at: requestedAt,
      })
      .eq('id', post.id)
      .eq('owner_id', currentUser.id)

    if (error) {
      setPosts(previousPosts)
      Alert.alert(
        'Verification setup needed',
        'Run supabase-verification-features.sql in Supabase, then try again.'
      )
      return
    }

    Alert.alert('Request sent', 'This property is now marked for verification review.')
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 16,
            marginBottom: 18,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 14,
            }}
          >
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: theme.text }}>
                Ads Management
              </Text>
              <Text style={{ color: theme.mutedText, marginTop: 4 }}>
                {posts.length} {posts.length === 1 ? 'post' : 'posts'} published
              </Text>
            </View>

            {userType === 'property_owner' ? (
              <TouchableOpacity
                onPress={() => navigation.navigate('CreatePost')}
                style={{
                  backgroundColor: theme.accent,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '900', marginLeft: 4 }}>
                  New ad
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {userType === 'property_owner' ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {[
                {
                  label: 'Open',
                  value: posts.filter((item) => (item.status || 'open') === 'open').length,
                  backgroundColor: '#ecfdf5',
                  textColor: '#059669',
                },
                {
                  label: 'Urgent',
                  value: posts.filter((item) => isUrgentProperty(item)).length,
                  backgroundColor: '#fff7ed',
                  textColor: '#ea580c',
                },
                {
                  label: 'Needs confirm',
                  value: posts.filter((item) => isAvailabilityConfirmationDue(item)).length,
                  backgroundColor: '#fef2f2',
                  textColor: '#dc2626',
                },
                {
                  label: 'Paused',
                  value: posts.filter((item) => item.status === 'paused').length,
                  backgroundColor: '#fff7ed',
                  textColor: '#b45309',
                },
                {
                  label: 'Rented',
                  value: posts.filter((item) => item.status === 'rented').length,
                  backgroundColor: '#fef2f2',
                  textColor: '#dc2626',
                },
              ].map((chip) => (
                <View
                  key={chip.label}
                  style={{
                    backgroundColor: chip.backgroundColor,
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: chip.textColor, fontSize: 11, fontWeight: '900' }}>
                    {chip.label}: {chip.value}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {userType === 'property_owner' && posts.length > 0 ? (
            <OwnerLeadSummary totals={leadDashboard.totals} theme={theme} />
          ) : null}

          {userType === 'property_owner' ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('VisitRequests')}
              activeOpacity={0.86}
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.accentSoft,
                paddingHorizontal: 14,
                paddingVertical: 13,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 14,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: theme.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                  }}
                >
                  <Ionicons name="calendar-outline" size={18} color={theme.accent} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontWeight: '900', fontSize: 14 }}>
                    Visit requests
                  </Text>
                  <Text style={{ color: theme.mutedText, marginTop: 3, fontSize: 12 }}>
                    Review pending renter visit times and respond quickly.
                  </Text>
                </View>
              </View>

              <View
                style={{
                  minWidth: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: pendingVisitCount ? theme.accent : theme.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 7,
                }}
              >
                <Text style={{ color: pendingVisitCount ? '#fff' : theme.accentStrong, fontWeight: '900', fontSize: 12 }}>
                  {pendingVisitCount}
                </Text>
              </View>
            </TouchableOpacity>
          ) : null}

          {userType !== 'property_owner' ? (
            <View
              style={{
                backgroundColor: theme.surfaceMuted,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.border,
                padding: 14,
              }}
            >
              <Text style={{ color: theme.text, lineHeight: 20 }}>
                Switch your account type to Property owner from Settings to create and manage ads here.
              </Text>
            </View>
          ) : posts.length === 0 ? (
            <View
              style={{
                backgroundColor: theme.surfaceMuted,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.border,
                paddingVertical: 22,
                paddingHorizontal: 16,
                alignItems: 'center',
              }}
            >
              <Ionicons name="newspaper-outline" size={26} color={theme.mutedText} />
              <Text style={{ color: theme.text, fontWeight: '800', marginTop: 10 }}>
                No ads yet
              </Text>
              <Text style={{ color: theme.mutedText, marginTop: 6, textAlign: 'center' }}>
                Your property posts will appear here as soon as you publish one.
              </Text>
            </View>
          ) : null}
        </View>

        {posts.map((item) => (
          <View key={item.id}>
            <ListingLeadDashboard
              metrics={leadDashboard.byPropertyId[String(item.id)]}
              theme={theme}
            />
            <PostCard
              item={item}
              currentUser={currentUser}
              onToggleLike={toggleLike}
              onOpenComments={openComments}
              onToggleFavorite={toggleFavorite}
              onShare={sharePost}
              onOpenMedia={openMedia}
              onOpenOwnerProfile={() => {}}
              onPressMore={openPostActions}
              onOpenPost={(post) => navigation.navigate('Property', { property: post })}
            />
          </View>
        ))}
      </ScrollView>

      <MediaViewer
        visible={mediaViewer.visible}
        media={mediaViewer.media}
        initialIndex={mediaViewer.index}
        onClose={closeMediaViewer}
      />

      <ActionSheetModal
        visible={Boolean(actionPost)}
        onClose={closeActionSheet}
        title="Manage ad"
        subtitle={actionPost?.title || 'Property post'}
        actions={[
          {
            icon: 'create-outline',
            title: 'Edit ad',
            subtitle: 'Update photos, price, title, or description.',
            onPress: () => {
              const post = actionPost
              closeActionSheet()
              navigation.navigate('CreatePost', { post })
            },
          },
          {
            icon: 'refresh-outline',
            title: 'Refresh listing',
            subtitle: 'Boost this live ad like a fresh listing.',
            disabled: actionPost?.status !== 'open',
            onPress: () =>
              refreshListing(actionPost),
          },
          {
            icon: 'shield-checkmark-outline',
            title: 'Confirm still available',
            subtitle: getAvailabilityFreshnessMeta(actionPost)?.isDue
              ? 'Update this ad so renters know it is still real.'
              : getAvailabilityFreshnessMeta(actionPost)?.label || 'Show renters this ad was checked today.',
            disabled: actionPost?.status !== 'open',
            onPress: () => confirmListingAvailability(actionPost),
          },
          {
            icon: isUrgentProperty(actionPost) ? 'flash-off-outline' : 'flash-outline',
            title: isUrgentProperty(actionPost) ? 'Remove urgent mark' : 'Mark urgent',
            subtitle: isUrgentProperty(actionPost)
              ? 'Return this ad to normal ranking.'
              : 'Highlight this listing as urgent for 3 days.',
            disabled: actionPost?.status !== 'open' && !isUrgentProperty(actionPost),
            onPress: () => toggleUrgent(actionPost),
          },
          {
            icon:
              actionPost?.status === 'rented'
                ? 'checkmark-done-outline'
                : actionPost?.status === 'paused'
                  ? 'play-circle-outline'
                  : 'home-outline',
            title:
              actionPost?.status === 'rented'
                ? 'Reopen listing'
                : actionPost?.status === 'paused'
                  ? 'Reopen listing'
                  : 'Mark as rented out',
            subtitle:
              actionPost?.status === 'rented'
                ? 'Show renters this property is available again.'
                : actionPost?.status === 'paused'
                  ? 'Put this listing back into the live feed.'
                  : 'Show renters this ad is no longer available.',
            onPress: () =>
              updatePostLifecycle(
                actionPost,
                {
                  status: actionPost?.status === 'open' ? 'rented' : 'open',
                  urgent_until: actionPost?.status === 'open' ? null : actionPost?.urgent_until,
                  refreshed_at:
                    actionPost?.status === 'open'
                      ? actionPost?.refreshed_at || actionPost?.created_at
                      : new Date().toISOString(),
                },
                {
                  successTitle:
                    actionPost?.status === 'open' ? 'Marked rented' : 'Listing reopened',
                  successMessage:
                    actionPost?.status === 'open'
                      ? 'Renters will now see this ad as rented out.'
                      : 'This ad is live again and has a fresh feed boost.',
                }
              ),
          },
          {
            icon: actionPost?.status === 'paused' ? 'pause-circle-outline' : 'pause-outline',
            title: actionPost?.status === 'paused' ? 'Keep paused' : 'Pause listing temporarily',
            subtitle:
              actionPost?.status === 'paused'
                ? 'This ad is already hidden from public browsing.'
                : 'Hide this ad from the feed without deleting it.',
            disabled: actionPost?.status === 'paused',
            onPress: () =>
              updatePostLifecycle(
                actionPost,
                {
                  status: 'paused',
                  urgent_until: null,
                },
                {
                  successTitle: 'Listing paused',
                  successMessage: 'This ad is now hidden from public browsing until you reopen it.',
                }
              ),
          },
          {
            icon: 'copy-outline',
            title: 'Duplicate listing',
            subtitle: 'Create a new copy you can reuse or tweak quickly.',
            onPress: () => duplicateListing(actionPost),
          },
          {
            icon:
              getPropertyVerificationStatus(actionPost) === 'verified'
                ? 'checkmark-circle-outline'
                : 'shield-checkmark-outline',
            title:
              getPropertyVerificationStatus(actionPost) === 'verified'
                ? 'Verified property'
                : getPropertyVerificationStatus(actionPost) === 'pending'
                  ? 'Verification pending'
                  : 'Request verification',
            subtitle:
              getPropertyVerificationStatus(actionPost) === 'verified'
                ? 'This property already has a trust badge.'
                : 'Send this listing for review before renters contact you.',
            disabled: getPropertyVerificationStatus(actionPost) === 'verified',
            onPress: () => requestPostVerification(actionPost),
          },
          {
            icon: 'chatbubble-ellipses-outline',
            title: 'Open comments',
            subtitle: 'Go straight to the comments for this post.',
            onPress: () => {
              const post = actionPost
              closeActionSheet()
              openComments(post)
            },
          },
          {
            icon: 'eye-outline',
            title: 'View details',
            subtitle: 'Open the full ad page.',
            onPress: () => {
              const post = actionPost
              closeActionSheet()
              navigation.navigate('Property', { property: post })
            },
          },
          {
            icon: 'share-social-outline',
            title: 'Share ad',
            subtitle: 'Send this ad to someone else.',
            onPress: () => {
              const post = actionPost
              closeActionSheet()
              sharePost(post)
            },
          },
          {
            icon: 'trash-outline',
            title: 'Delete ad',
            subtitle: 'Remove this post permanently.',
            danger: true,
            onPress: () => deletePost(actionPost),
          },
        ]}
      />
    </SafeAreaView>
  )
}
