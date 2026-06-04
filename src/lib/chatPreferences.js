import AsyncStorage from '@react-native-async-storage/async-storage'

const MUTED_KEY = 'chat-preferences:muted-conversations'
const PINNED_KEY = 'chat-preferences:pinned-conversations'
const NOTIFICATION_SOUND_KEY = 'chat-preferences:notification-sounds'
const RINGTONE_SOUND_KEY = 'chat-preferences:ringtone-sounds'
const LINK_PREVIEW_KEY = 'chat-preferences:link-previews'
const DEFAULT_NOTIFICATION_SOUND_ID = 'iphone_notification'
const DEFAULT_RINGTONE_SOUND_ID = 'best_love'

async function readIdSet(key) {
  try {
    const rawValue = await AsyncStorage.getItem(key)
    const parsed = rawValue ? JSON.parse(rawValue) : []
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

async function writeIdSet(key, ids) {
  await AsyncStorage.setItem(key, JSON.stringify([...ids].map(String)))
}

async function readPreferenceMap(key) {
  try {
    const rawValue = await AsyncStorage.getItem(key)
    const parsed = rawValue ? JSON.parse(rawValue) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

async function writePreferenceMap(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value || {}))
}

async function setConversationFlag(key, conversationId, enabled) {
  if (!conversationId) return

  const ids = await readIdSet(key)
  const safeId = String(conversationId)

  if (enabled) {
    ids.add(safeId)
  } else {
    ids.delete(safeId)
  }

  await writeIdSet(key, ids)
}

async function getConversationPreference(key, conversationId, fallbackValue) {
  if (!conversationId) return fallbackValue

  const values = await readPreferenceMap(key)
  return values[String(conversationId)] || fallbackValue
}

async function setConversationPreference(key, conversationId, value, fallbackValue) {
  if (!conversationId) return

  const values = await readPreferenceMap(key)
  const safeId = String(conversationId)
  const nextValue = value || fallbackValue

  if (nextValue === fallbackValue) {
    delete values[safeId]
  } else {
    values[safeId] = nextValue
  }

  await writePreferenceMap(key, values)
}

export async function getMutedConversationIds() {
  return readIdSet(MUTED_KEY)
}

export async function isConversationMuted(conversationId) {
  if (!conversationId) return false

  const ids = await getMutedConversationIds()
  return ids.has(String(conversationId))
}

export async function setConversationMuted(conversationId, enabled) {
  await setConversationFlag(MUTED_KEY, conversationId, enabled)
}

export async function getPinnedConversationIds() {
  return readIdSet(PINNED_KEY)
}

export async function isConversationPinned(conversationId) {
  if (!conversationId) return false

  const ids = await getPinnedConversationIds()
  return ids.has(String(conversationId))
}

export async function setConversationPinned(conversationId, enabled) {
  await setConversationFlag(PINNED_KEY, conversationId, enabled)
}

export async function getConversationLinkPreviewEnabled(conversationId) {
  if (!conversationId) return true

  const values = await readPreferenceMap(LINK_PREVIEW_KEY)
  const savedValue = values[String(conversationId)]

  return typeof savedValue === 'boolean' ? savedValue : true
}

export async function setConversationLinkPreviewEnabled(conversationId, enabled) {
  if (!conversationId) return

  const values = await readPreferenceMap(LINK_PREVIEW_KEY)
  values[String(conversationId)] = Boolean(enabled)
  await writePreferenceMap(LINK_PREVIEW_KEY, values)
}

export async function getConversationNotificationSoundId(conversationId) {
  return getConversationPreference(NOTIFICATION_SOUND_KEY, conversationId, DEFAULT_NOTIFICATION_SOUND_ID)
}

export async function setConversationNotificationSoundId(conversationId, soundId) {
  await setConversationPreference(NOTIFICATION_SOUND_KEY, conversationId, soundId, DEFAULT_NOTIFICATION_SOUND_ID)
}

export async function getConversationRingtoneSoundId(conversationId) {
  return getConversationPreference(RINGTONE_SOUND_KEY, conversationId, DEFAULT_RINGTONE_SOUND_ID)
}

export async function setConversationRingtoneSoundId(conversationId, soundId) {
  await setConversationPreference(RINGTONE_SOUND_KEY, conversationId, soundId, DEFAULT_RINGTONE_SOUND_ID)
}
