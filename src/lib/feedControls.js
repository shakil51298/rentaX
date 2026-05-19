import { supabase } from './supabase'
import {
  buildPostSignalWeights,
  loadFeedSignalProfile,
  mergeFeedSignalProfile,
  saveFeedSignalProfile,
} from './feedSignals'

export async function hidePropertyFromFeed({ userId, propertyId, reason = 'not_interested' }) {
  if (!userId || !propertyId) {
    throw new Error('Missing feed hide details.')
  }

  const { error } = await supabase
    .from('user_hidden_properties')
    .upsert(
      {
        user_id: userId,
        property_id: String(propertyId),
        reason,
      },
      { onConflict: 'user_id,property_id' }
    )

  if (error) throw error
}

export async function hideOwnerFromFeed({ userId, ownerId, reason = 'hide_owner' }) {
  if (!userId || !ownerId) {
    throw new Error('Missing owner hide details.')
  }

  const { error } = await supabase
    .from('user_hidden_owners')
    .upsert(
      {
        user_id: userId,
        owner_id: ownerId,
        reason,
      },
      { onConflict: 'user_id,owner_id' }
    )

  if (error) throw error
}

export async function applyLessLikeThis({ userId, post, weight = -6 }) {
  if (!userId || !post) return

  const currentProfile = await loadFeedSignalProfile(userId)
  const nextProfile = mergeFeedSignalProfile(currentProfile, buildPostSignalWeights(post, weight))
  await saveFeedSignalProfile(userId, nextProfile)

  return nextProfile
}
