import AsyncStorage from '@react-native-async-storage/async-storage'

const FEED_SIGNAL_KEY = 'rental-x:feed-signals'
const MAX_TOKENS = 80

function storageKeyForUser(userId) {
  return `${FEED_SIGNAL_KEY}:${userId || 'guest'}`
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(value) {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
}

function pushWeightedTokens(targetMap, tokens, weight) {
  tokens.forEach((token) => {
    targetMap[token] = (targetMap[token] || 0) + weight
  })
}

export function extractPostPreferenceTokens(post) {
  return [
    ...tokenize(post?.title),
    ...tokenize(post?.description),
    ...tokenize(post?.location),
    ...tokenize(post?.owner_profile?.display_name || post?.owner_name),
  ]
}

export function extractSearchPreferenceTokens(query) {
  return tokenize(query)
}

export async function loadFeedSignalProfile(userId) {
  if (!userId) {
    return { tokens: {}, updatedAt: null }
  }

  try {
    const raw = await AsyncStorage.getItem(storageKeyForUser(userId))
    const parsed = raw ? JSON.parse(raw) : null

    if (!parsed || typeof parsed !== 'object') {
      return { tokens: {}, updatedAt: null }
    }

    return {
      tokens: parsed.tokens && typeof parsed.tokens === 'object' ? parsed.tokens : {},
      updatedAt: parsed.updatedAt || null,
    }
  } catch {
    return { tokens: {}, updatedAt: null }
  }
}

export async function saveFeedSignalProfile(userId, profile) {
  if (!userId) return

  try {
    const sortedEntries = Object.entries(profile?.tokens || {})
      .sort((left, right) => right[1] - left[1])
      .slice(0, MAX_TOKENS)

    await AsyncStorage.setItem(
      storageKeyForUser(userId),
      JSON.stringify({
        tokens: Object.fromEntries(sortedEntries),
        updatedAt: new Date().toISOString(),
      })
    )
  } catch {
    // Ignore local cache write failures for feed preference signals.
  }
}

export function mergeFeedSignalProfile(currentProfile, tokenWeights = {}) {
  const nextTokens = { ...(currentProfile?.tokens || {}) }

  Object.entries(tokenWeights).forEach(([token, weight]) => {
    if (!token) return
    nextTokens[token] = (nextTokens[token] || 0) + weight
  })

  return {
    tokens: nextTokens,
    updatedAt: new Date().toISOString(),
  }
}

export function buildPostSignalWeights(post, weight) {
  const nextWeights = {}
  pushWeightedTokens(nextWeights, extractPostPreferenceTokens(post), weight)
  return nextWeights
}

export function buildSearchSignalWeights(query, weight) {
  const nextWeights = {}
  pushWeightedTokens(nextWeights, extractSearchPreferenceTokens(query), weight)
  return nextWeights
}

export function scorePostAgainstSignals(post, signalProfile) {
  const tokens = extractPostPreferenceTokens(post)
  const signalMap = signalProfile?.tokens || {}

  return tokens.reduce((score, token) => score + (signalMap[token] || 0), 0)
}
