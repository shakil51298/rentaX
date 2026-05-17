import { supabase } from './supabase'
import { displayNameFromEmail, getUserAvatarUrl, getUserDisplayName } from './userDisplay'

export async function ensureUserProfileRecord(user) {
  if (!user?.id) return null

  const metadata = user.user_metadata || {}
  const payload = {
    user_id: user.id,
    email: user.email || null,
    display_name: getUserDisplayName(user) || displayNameFromEmail(user.email),
    avatar_url: getUserAvatarUrl(user),
    cover_url: metadata.cover_url || null,
    user_type: metadata.user_type || 'renter',
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .maybeSingle()

  if (error) {
    throw error
  }

  return data || payload
}
