import { supabase } from './supabase'
import { fetchPropertyViewCounts } from './propertyViews'
import { fetchHiddenContentState } from './reporting'
import { sortPropertiesForFeed } from './propertyLifecycle'

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

  const { data, error } = await query

  if (error) {
    throw error
  }

  const hiddenState = currentUserId ? await fetchHiddenContentState(currentUserId) : null
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
