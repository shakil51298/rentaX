import AsyncStorage from '@react-native-async-storage/async-storage'

const MUTED_KEY = 'chat-preferences:muted-conversations'
const PINNED_KEY = 'chat-preferences:pinned-conversations'

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
