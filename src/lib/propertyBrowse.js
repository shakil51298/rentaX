import AsyncStorage from '@react-native-async-storage/async-storage'
import { normalizeMediaList } from './media'

const RECENTLY_VIEWED_KEY = 'rental-x:recently-viewed'
const COMPARE_PROPERTIES_KEY = 'rental-x:compare-properties'
const RECENTLY_VIEWED_LIMIT = 24
const COMPARE_LIMIT = 5

function keyForUser(baseKey, userId) {
  return `${baseKey}:${userId || 'guest'}`
}

function toPropertySummary(property) {
  if (!property?.id) return null

  const media = normalizeMediaList(
    property?.media?.length ? property.media : property?.image_url ? [property.image_url] : []
  )

  return {
    id: String(property.id),
    owner_id: property.owner_id || null,
    title: property.title || '',
    description: property.description || '',
    price: property.price || '',
    location: property.location || '',
    status: property.status || 'open',
    image_url: property.image_url || media[0]?.uri || null,
    media,
    beds: property.beds ?? null,
    baths: property.baths ?? null,
    size_sqft: property.size_sqft ?? null,
    furnishing_status: property.furnishing_status || null,
    tenant_type: property.tenant_type || null,
    parking: Boolean(property.parking),
    lift_available: Boolean(property.lift_available),
    generator_backup: Boolean(property.generator_backup),
    gas_available: Boolean(property.gas_available),
    pet_friendly: Boolean(property.pet_friendly),
    available_from: property.available_from || null,
    floor_no: property.floor_no ?? null,
    facing_direction: property.facing_direction || null,
    has_balcony: Boolean(property.has_balcony),
    service_charge_included: Boolean(property.service_charge_included),
    owner_profile: property.owner_profile || null,
    owner_name: property.owner_name || '',
    owner_email: property.owner_email || '',
    created_at: property.created_at || null,
    viewed_at: new Date().toISOString(),
  }
}

async function loadList(storageKey) {
  try {
    const rawValue = await AsyncStorage.getItem(storageKey)
    const parsedValue = rawValue ? JSON.parse(rawValue) : []

    return Array.isArray(parsedValue) ? parsedValue : []
  } catch {
    return []
  }
}

async function saveList(storageKey, items) {
  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(items))
  } catch {
    // Ignore local cache write failures.
  }
}

export async function loadRecentlyViewedProperties(userId) {
  return loadList(keyForUser(RECENTLY_VIEWED_KEY, userId))
}

export async function rememberRecentlyViewedProperty(userId, property) {
  const snapshot = toPropertySummary(property)
  if (!snapshot) return []

  const storageKey = keyForUser(RECENTLY_VIEWED_KEY, userId)
  const currentItems = await loadList(storageKey)
  const nextItems = [
    snapshot,
    ...currentItems.filter((item) => String(item.id) !== String(snapshot.id)),
  ].slice(0, RECENTLY_VIEWED_LIMIT)

  await saveList(storageKey, nextItems)
  return nextItems
}

export async function clearRecentlyViewedProperties(userId) {
  await saveList(keyForUser(RECENTLY_VIEWED_KEY, userId), [])
}

export async function loadComparedProperties(userId) {
  return loadList(keyForUser(COMPARE_PROPERTIES_KEY, userId))
}

export async function addComparedProperty(userId, property) {
  const snapshot = toPropertySummary(property)
  if (!snapshot) {
    return {
      items: [],
      added: false,
      reason: 'invalid',
    }
  }

  const storageKey = keyForUser(COMPARE_PROPERTIES_KEY, userId)
  const currentItems = await loadList(storageKey)

  if (currentItems.some((item) => String(item.id) === String(snapshot.id))) {
    return {
      items: currentItems,
      added: false,
      reason: 'exists',
    }
  }

  if (currentItems.length >= COMPARE_LIMIT) {
    return {
      items: currentItems,
      added: false,
      reason: 'limit',
    }
  }

  const nextItems = [...currentItems, snapshot]
  await saveList(storageKey, nextItems)

  return {
    items: nextItems,
    added: true,
    reason: null,
  }
}

export async function removeComparedProperty(userId, propertyId) {
  const storageKey = keyForUser(COMPARE_PROPERTIES_KEY, userId)
  const currentItems = await loadList(storageKey)
  const nextItems = currentItems.filter((item) => String(item.id) !== String(propertyId))
  await saveList(storageKey, nextItems)
  return nextItems
}

export async function isComparedProperty(userId, propertyId) {
  const currentItems = await loadComparedProperties(userId)
  return currentItems.some((item) => String(item.id) === String(propertyId))
}

export { COMPARE_LIMIT }
