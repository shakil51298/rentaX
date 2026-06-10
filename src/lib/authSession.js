import { supabase } from './supabase'

let cachedSession
let sessionInitialized = false
let sessionRequest = null

export function setCachedAuthSession(session) {
  cachedSession = session || null
  sessionInitialized = true
}

export function clearCachedAuthSession() {
  cachedSession = null
  sessionInitialized = true
}

export async function getCachedAuthSession() {
  if (sessionInitialized) {
    return cachedSession || null
  }

  if (!sessionRequest) {
    sessionRequest = supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) throw error

        setCachedAuthSession(data?.session || null)
        return cachedSession
      })
      .finally(() => {
        sessionRequest = null
      })
  }

  return sessionRequest
}

export async function getCachedAuthUser() {
  const session = await getCachedAuthSession()
  return session?.user || null
}
