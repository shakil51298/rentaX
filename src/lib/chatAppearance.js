import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_PREFIX = 'chat-appearance:'

export const CHAT_COLOR_PRESETS = [
  { id: 'classic', label: 'Classic', bubble: '#1877F2', accent: '#1877F2' },
  { id: 'violet', label: 'Violet', bubble: '#7c3aed', accent: '#7c3aed' },
  { id: 'mint', label: 'Mint', bubble: '#0f766e', accent: '#0f766e' },
  { id: 'rose', label: 'Rose', bubble: '#e11d48', accent: '#e11d48' },
  { id: 'amber', label: 'Amber', bubble: '#d97706', accent: '#d97706' },
]

export const CHAT_WALLPAPER_PRESETS = [
  {
    id: 'clean',
    label: 'Clean',
    backgroundColor: '#e9eef5',
    overlay: '#ffffff',
  },
  {
    id: 'mist',
    label: 'Mist',
    backgroundColor: '#edf4ff',
    overlay: '#dbeafe',
  },
  {
    id: 'mint',
    label: 'Mint',
    backgroundColor: '#ecfdf5',
    overlay: '#d1fae5',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    backgroundColor: '#fff7ed',
    overlay: '#fed7aa',
  },
  {
    id: 'night',
    label: 'Night',
    backgroundColor: '#0f172a',
    overlay: '#1e293b',
  },
]

function storageKey(conversationId) {
  return `${STORAGE_PREFIX}${conversationId}`
}

export function getDefaultChatAppearance() {
  return {
    colorPresetId: 'classic',
    wallpaperPresetId: 'clean',
  }
}

export async function getChatAppearance(conversationId) {
  if (!conversationId) return getDefaultChatAppearance()

  try {
    const rawValue = await AsyncStorage.getItem(storageKey(conversationId))

    if (!rawValue) return getDefaultChatAppearance()

    return {
      ...getDefaultChatAppearance(),
      ...JSON.parse(rawValue),
    }
  } catch {
    return getDefaultChatAppearance()
  }
}

export async function saveChatAppearance(conversationId, value) {
  if (!conversationId) return

  const nextValue = {
    ...getDefaultChatAppearance(),
    ...value,
  }

  await AsyncStorage.setItem(storageKey(conversationId), JSON.stringify(nextValue))
}

export function resolveChatColorPreset(id) {
  return CHAT_COLOR_PRESETS.find((item) => item.id === id) || CHAT_COLOR_PRESETS[0]
}

export function resolveChatWallpaperPreset(id) {
  return CHAT_WALLPAPER_PRESETS.find((item) => item.id === id) || CHAT_WALLPAPER_PRESETS[0]
}
