import { supabase } from './supabase'

export async function fetchUserSocialCounts(userId) {
  if (!userId) {
    return {
      posts: 0,
      followers: 0,
      following: 0,
      blocked: 0,
    }
  }

  const [
    { count: postCount },
    { count: followerCount },
    { count: followingCount },
    { count: blockedCount },
  ] = await Promise.all([
    supabase
      .from('properties')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', userId),
    supabase
      .from('user_follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', userId),
    supabase
      .from('user_follows')
      .select('id', { count: 'exact', head: true })
      .eq('follower_id', userId),
    supabase
      .from('user_blocks')
      .select('id', { count: 'exact', head: true })
      .eq('blocker_id', userId),
  ])

  return {
    posts: postCount || 0,
    followers: followerCount || 0,
    following: followingCount || 0,
    blocked: blockedCount || 0,
  }
}

export async function fetchProfilesByUserIds(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))]
  if (!ids.length) return {}

  const { data } = await supabase
    .from('user_profiles')
    .select('user_id, email, display_name, rentalx_id, avatar_url, cover_url, bio, phone, location, user_type, is_verified, owner_verification_status')
    .in('user_id', ids)

  return (data || []).reduce((accumulator, profile) => ({
    ...accumulator,
    [profile.user_id]: profile,
  }), {})
}

export async function fetchRelationshipState(currentUserId, targetUserIds) {
  const ids = [...new Set((targetUserIds || []).filter((id) => id && id !== currentUserId))]

  if (!currentUserId || !ids.length) {
    return {
      followingIds: new Set(),
      blockedIds: new Set(),
    }
  }

  const [{ data: follows }, { data: blocks }] = await Promise.all([
    supabase
      .from('user_follows')
      .select('following_id')
      .eq('follower_id', currentUserId)
      .in('following_id', ids),
    supabase
      .from('user_blocks')
      .select('blocked_id')
      .eq('blocker_id', currentUserId)
      .in('blocked_id', ids),
  ])

  return {
    followingIds: new Set((follows || []).map((item) => item.following_id)),
    blockedIds: new Set((blocks || []).map((item) => item.blocked_id)),
  }
}

export async function fetchConnections({ userId, kind = 'followers', currentUserId }) {
  if (!userId) return []

  const targetColumn = kind === 'following' ? 'following_id' : 'follower_id'
  const filterColumn = kind === 'following' ? 'follower_id' : 'following_id'

  const { data: rows, error } = await supabase
    .from('user_follows')
    .select('id, follower_id, following_id, created_at')
    .eq(filterColumn, userId)
    .order('created_at', { ascending: false })

  if (error) throw error

  const targetIds = (rows || []).map((row) => row[targetColumn])
  const [profilesByUserId, relationshipState] = await Promise.all([
    fetchProfilesByUserIds(targetIds),
    fetchRelationshipState(currentUserId, targetIds),
  ])

  return (rows || []).map((row) => {
    const relatedUserId = row[targetColumn]

    return {
      ...row,
      related_user_id: relatedUserId,
      profile: profilesByUserId[relatedUserId] || null,
      is_following: relationshipState.followingIds.has(relatedUserId),
      is_blocked: relationshipState.blockedIds.has(relatedUserId),
    }
  })
}

export async function fetchBlockedUsers(blockerUserId) {
  if (!blockerUserId) return []

  const { data: rows, error } = await supabase
    .from('user_blocks')
    .select('id, blocker_id, blocked_id, created_at')
    .eq('blocker_id', blockerUserId)
    .order('created_at', { ascending: false })

  if (error) throw error

  const blockedIds = (rows || []).map((row) => row.blocked_id)
  const profilesByUserId = await fetchProfilesByUserIds(blockedIds)

  return (rows || []).map((row) => ({
    ...row,
    profile: profilesByUserId[row.blocked_id] || null,
  }))
}

export async function followUser(currentUserId, targetUserId) {
  return supabase.from('user_follows').insert({
    follower_id: currentUserId,
    following_id: targetUserId,
  })
}

export async function unfollowUser(currentUserId, targetUserId) {
  return supabase
    .from('user_follows')
    .delete()
    .eq('follower_id', currentUserId)
    .eq('following_id', targetUserId)
}

export async function blockUser(currentUserId, targetUserId) {
  const { error } = await supabase.from('user_blocks').upsert(
    {
      blocker_id: currentUserId,
      blocked_id: targetUserId,
    },
    {
      onConflict: 'blocker_id,blocked_id',
    }
  )

  if (error) {
    return { error }
  }

  await Promise.all([
    supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', currentUserId)
      .eq('following_id', targetUserId),
    supabase
      .from('user_follows')
      .delete()
      .eq('follower_id', targetUserId)
      .eq('following_id', currentUserId),
  ])

  return { error: null }
}

export async function unblockUser(currentUserId, targetUserId) {
  return supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', currentUserId)
    .eq('blocked_id', targetUserId)
}
