const PRIMARY_ADMIN_EMAILS = ['shakilkhan51298@gmail.com']

export function isPrimaryAdmin(emailOrUser) {
  const email =
    typeof emailOrUser === 'string'
      ? emailOrUser
      : emailOrUser?.email || emailOrUser?.user_metadata?.email || ''

  return PRIMARY_ADMIN_EMAILS.includes(String(email).trim().toLowerCase())
}
