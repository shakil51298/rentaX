export function displayNameFromEmail(email) {
  if (!email) return 'Rental X member'

  return email.split('@')[0]
}

export function getProfileName(profile, fallback = 'Rental X member') {
  return (
    profile?.display_name ||
    profile?.name ||
    displayNameFromEmail(profile?.email) ||
    fallback
  )
}

export function getAvatarSource(profile) {
  return profile?.avatar_url || profile?.photo_url || profile?.picture || null
}

export function getUserDisplayName(user) {
  return (
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    displayNameFromEmail(user?.email)
  )
}

export function getUserAvatarUrl(user) {
  return (
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    user?.user_metadata?.profile_picture ||
    null
  )
}
