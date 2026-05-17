import { supabase } from './supabase'

export async function fetchPropertiesWithProfiles({ ownerId } = {}) {
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

  const { data, error } = await query

  if (error) {
    throw error
  }

  const posts = data || []
  const ownerIds = [...new Set(posts.map((post) => post.owner_id).filter(Boolean))]
  let profilesByUserId = {}

  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, email, display_name, avatar_url, is_verified, owner_verification_status, user_type')
      .in('user_id', ownerIds)

    profilesByUserId = (profiles || []).reduce((profilesById, profile) => ({
      ...profilesById,
      [profile.user_id]: profile,
    }), {})
  }

  return posts.map((post) => ({
    ...post,
    owner_profile: profilesByUserId[post.owner_id] || null,
  }))
}
