import AsyncStorage from '@react-native-async-storage/async-storage'

const GUEST_MODE_STORAGE_KEY = 'rentalx_guest_mode_enabled'

export async function isGuestModeEnabled() {
  try {
    const value = await AsyncStorage.getItem(GUEST_MODE_STORAGE_KEY)
    return value === 'true'
  } catch (_error) {
    return false
  }
}

export async function activateGuestMode() {
  try {
    await AsyncStorage.setItem(GUEST_MODE_STORAGE_KEY, 'true')
  } catch (_error) {
    // ignore storage failures and let the current session continue
  }
}

export async function clearGuestMode() {
  try {
    await AsyncStorage.removeItem(GUEST_MODE_STORAGE_KEY)
  } catch (_error) {
    // ignore storage failures
  }
}
