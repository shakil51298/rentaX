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

function getStableHash(value) {
  const text = String(value || '')
  let hash = 0

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0
  }

  return hash
}

function getRecencyBucket(createdAt) {
  const timestamp = new Date(createdAt || 0).getTime()
  const ageHours = Math.max(0, (Date.now() - timestamp) / (1000 * 60 * 60))

  if (ageHours <= 6) return 0
  if (ageHours <= 24) return 1
  if (ageHours <= 72) return 2

  return 3
}

function rotateTopCandidates(items, offset) {
  if (items.length <= 1) return items

  const headSize = Math.min(items.length, 24)
  const head = items.slice(0, headSize)
  const tail = items.slice(headSize)
  const safeOffset = offset % head.length

  return [
    ...head.slice(safeOffset),
    ...head.slice(0, safeOffset),
    ...tail,
  ]
}

export function rankHomePosts(posts, {
  userArea = '',
  seenPostIds = [],
  userId = '',
  refreshTick = 0,
} = {}) {
  const seenIds = new Set((seenPostIds || []).map((id) => String(id)))
  const effectiveArea = getHomeLocationArea(userArea)
  const baseSeed = getStableHash(`${userId}:${refreshTick}`)
  const groups = new Map()

  for (const post of posts || []) {
    const isSeen = seenIds.has(String(post.id))
    const matchesArea = effectiveArea
      ? isPostRelevantToArea(post.location, effectiveArea)
      : false
    const recencyBucket = getRecencyBucket(post.created_at)
    const isOwnPost = Boolean(userId && String(post.owner_id) === String(userId))
    const groupKey = `${isSeen ? 1 : 0}-${matchesArea ? 0 : 1}-${recencyBucket}-${isOwnPost ? 0 : 1}`
    const currentGroup = groups.get(groupKey) || []

    currentGroup.push(post)
    groups.set(groupKey, currentGroup)
  }

  const orderedGroupKeys = [...groups.keys()].sort((leftKey, rightKey) => {
    const [leftSeen, leftAreaMatch, leftRecency, leftOwnPost] = leftKey.split('-').map(Number)
    const [rightSeen, rightAreaMatch, rightRecency, rightOwnPost] = rightKey.split('-').map(Number)

    if (leftSeen !== rightSeen) return leftSeen - rightSeen
    if (leftAreaMatch !== rightAreaMatch) return leftAreaMatch - rightAreaMatch

    if (leftRecency !== rightRecency) return leftRecency - rightRecency

    return leftOwnPost - rightOwnPost
  })

  return orderedGroupKeys.flatMap((groupKey) => {
    const postsInGroup = [...(groups.get(groupKey) || [])].sort((leftPost, rightPost) => {
      const leftDate = new Date(leftPost.created_at || 0).getTime()
      const rightDate = new Date(rightPost.created_at || 0).getTime()

      if (leftDate !== rightDate) {
        return rightDate - leftDate
      }

      const leftPersonal = getStableHash(`${userId}:${leftPost.id}`)
      const rightPersonal = getStableHash(`${userId}:${rightPost.id}`)

      return leftPersonal - rightPersonal
    })

    const rotationBase = getStableHash(`${baseSeed}:${groupKey}`)
    const rotationOffset = (rotationBase + refreshTick) % Math.max(postsInGroup.length, 1)

    return rotateTopCandidates(postsInGroup, rotationOffset)
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
