import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'
import { fetchPropertyViewCounts } from './propertyViews'
import { fetchHiddenContentState } from './reporting'
import { sortPropertiesForFeed } from './propertyLifecycle'

const PROPERTY_FEED_CACHE_VERSION = 1
const PROPERTY_FEED_CACHE_MAX_AGE_MS = 15 * 60 * 1000

function getPropertyFeedCacheKey(userId) {
  return `@rentalx/property-feed-v${PROPERTY_FEED_CACHE_VERSION}/${userId || 'guest'}`
}

export async function loadCachedPropertyFeed(userId) {
  try {
    const rawValue = await AsyncStorage.getItem(getPropertyFeedCacheKey(userId))
    const cached = rawValue ? JSON.parse(rawValue) : null

    if (
      !cached?.savedAt
      || !Array.isArray(cached.items)
      || Date.now() - cached.savedAt > PROPERTY_FEED_CACHE_MAX_AGE_MS
    ) {
      return []
    }

    return cached.items
  } catch (_error) {
    return []
  }
}

export async function saveCachedPropertyFeed(userId, items) {
  try {
    await AsyncStorage.setItem(
      getPropertyFeedCacheKey(userId),
      JSON.stringify({
        savedAt: Date.now(),
        items: Array.isArray(items) ? items : [],
      })
    )
  } catch (_error) {
    // A cache write must never block the live feed.
  }
}

export async function fetchPropertiesWithProfiles({
  ownerId,
  includeBanned = false,
  includePaused = false,
  currentUserId,
  limit,
} = {}) {
  let query = supabase
    .from('properties')
    .select(`
      *,
      property_reactions(id, reaction, user_id),
      property_comments(id),
      property_favorites(id, user_id)
    `)
    .order('created_at', { ascending: false })

  if (ownerId) {
    query = query.eq('owner_id', ownerId)
  }

  if (limit) {
    query = query.limit(limit)
  }

  const [propertiesResponse, hiddenState] = await Promise.all([
    query,
    currentUserId
      ? fetchHiddenContentState(currentUserId)
      : Promise.resolve(null),
  ])
  const { data, error } = propertiesResponse

  if (error) {
    throw error
  }

  const posts = (data || []).filter((post) => {
    if (!includeBanned && post.admin_is_banned) {
      return false
    }

    if (!includePaused && post.status === 'paused') {
      return false
    }

    if (!hiddenState) {
      return true
    }

    if (hiddenState.blockedUserIds.has(post.owner_id)) {
      return false
    }

    if (hiddenState.hiddenOwnerIds.has(post.owner_id)) {
      return false
    }

    if (hiddenState.hiddenPropertyIds.has(String(post.id))) {
      return false
    }

    if (hiddenState.reportedUserIds.has(post.owner_id)) {
      return false
    }

    if (hiddenState.reportedPropertyIds.has(String(post.id))) {
      return false
    }

    return true
  })
  const ownerIds = [...new Set(posts.map((post) => post.owner_id).filter(Boolean))]
  const propertyIds = posts.map((post) => post.id)
  let profilesByUserId = {}
  let viewCountsByPropertyId = {}

  const [profilesResponse, viewCountsResponse] = await Promise.all([
    ownerIds.length > 0
      ? supabase
          .from('user_profiles')
          .select('user_id, email, display_name, avatar_url, is_verified, owner_verification_status, user_type')
          .in('user_id', ownerIds)
      : Promise.resolve({ data: [] }),
    fetchPropertyViewCounts(propertyIds),
  ])

  profilesByUserId = (profilesResponse?.data || []).reduce((profilesById, profile) => ({
    ...profilesById,
    [profile.user_id]: profile,
  }), {})
  viewCountsByPropertyId = viewCountsResponse || {}

  const enrichedPosts = posts.map((post) => ({
    ...post,
    view_count: viewCountsByPropertyId[String(post.id)] || post.view_count || 0,
    owner_profile: profilesByUserId[post.owner_id] || null,
  }))

  return sortPropertiesForFeed(enrichedPosts)
}
