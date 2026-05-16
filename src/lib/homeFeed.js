import AsyncStorage from '@react-native-async-storage/async-storage'

const HOME_SEEN_POSTS_KEY = 'rental-x:home-seen-posts'
const HOME_SEEN_POSTS_LIMIT = 600

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s,.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeArea(value) {
  return normalizeText(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)[0] || ''
}

function getLocationTokens(value) {
  return normalizeText(value)
    .split(/[,\s/-]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1)
}

export function getHomeLocationArea(locationLabel) {
  const normalized = normalizeArea(locationLabel)

  if (!normalized) return ''
  if (['location off', 'location unavailable', 'detecting location...'].includes(normalized)) {
    return ''
  }

  return normalized
}

export function isPostRelevantToArea(postLocation, userArea) {
  const normalizedUserArea = normalizeArea(userArea)
  if (!normalizedUserArea) return false

  const normalizedPostArea = normalizeArea(postLocation)
  if (!normalizedPostArea) return false

  if (
    normalizedPostArea.includes(normalizedUserArea)
    || normalizedUserArea.includes(normalizedPostArea)
  ) {
    return true
  }

  const userTokens = getLocationTokens(normalizedUserArea)
  const postTokens = getLocationTokens(normalizedPostArea)

  return userTokens.some((token) => postTokens.includes(token))
}

export function rankHomePosts(posts, { userArea = '', seenPostIds = [] } = {}) {
  const seenIds = new Set((seenPostIds || []).map((id) => String(id)))
  const effectiveArea = getHomeLocationArea(userArea)

  return [...(posts || [])].sort((leftPost, rightPost) => {
    const leftSeen = seenIds.has(String(leftPost.id))
    const rightSeen = seenIds.has(String(rightPost.id))

    if (leftSeen !== rightSeen) {
      return leftSeen ? 1 : -1
    }

    const leftMatchesArea = effectiveArea
      ? isPostRelevantToArea(leftPost.location, effectiveArea)
      : false
    const rightMatchesArea = effectiveArea
      ? isPostRelevantToArea(rightPost.location, effectiveArea)
      : false

    if (leftMatchesArea !== rightMatchesArea) {
      return leftMatchesArea ? -1 : 1
    }

    const leftDate = new Date(leftPost.created_at || 0).getTime()
    const rightDate = new Date(rightPost.created_at || 0).getTime()

    return rightDate - leftDate
  })
}

function storageKeyForUser(userId) {
  return `${HOME_SEEN_POSTS_KEY}:${userId || 'guest'}`
}

export async function loadSeenHomePostIds(userId) {
  if (!userId) return []

  try {
    const rawValue = await AsyncStorage.getItem(storageKeyForUser(userId))
    const parsedValue = rawValue ? JSON.parse(rawValue) : []

    if (!Array.isArray(parsedValue)) return []

    return parsedValue.map((id) => String(id))
  } catch {
    return []
  }
}

export async function saveSeenHomePostIds(userId, postIds) {
  if (!userId) return

  try {
    await AsyncStorage.setItem(
      storageKeyForUser(userId),
      JSON.stringify(postIds.slice(0, HOME_SEEN_POSTS_LIMIT))
    )
  } catch {
    // Ignore local cache write failures.
  }
}

export function mergeSeenHomePostIds(currentIds, nextIds) {
  const merged = [...new Set([...(nextIds || []).map(String), ...(currentIds || []).map(String)])]

  return merged.slice(0, HOME_SEEN_POSTS_LIMIT)
}
