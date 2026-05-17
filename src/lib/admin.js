import { supabase } from './supabase'

const PRIMARY_ADMIN_EMAILS = ['shakilkhan51298@gmail.com']

export function isPrimaryAdmin(emailOrUser) {
  const email =
    typeof emailOrUser === 'string'
      ? emailOrUser
      : emailOrUser?.email || emailOrUser?.user_metadata?.email || ''

  return PRIMARY_ADMIN_EMAILS.includes(String(email).trim().toLowerCase())
}

export async function getPrimaryAdminUserIds() {
  const normalizedEmails = PRIMARY_ADMIN_EMAILS.map((item) => item.trim().toLowerCase())

  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, email')
    .in('email', normalizedEmails)

  if (error) {
    return []
  }

  return (data || [])
    .filter((item) => normalizedEmails.includes(String(item.email || '').trim().toLowerCase()))
    .map((item) => item.user_id)
    .filter(Boolean)
}
