import { supabase } from './supabase'
import { getOwnerVerificationStatus } from './verification'

export function getSavedSearchFiltersFromRow(row, fallbackMaxPrice = 0) {
  const safeMaxPrice = Number(row?.max_price ?? fallbackMaxPrice ?? 0)

  return {
    location: (row?.location || '').trim(),
    minPrice: Math.max(0, Number(row?.min_price || 0)),
    maxPrice: safeMaxPrice > 0 ? safeMaxPrice : Math.max(0, Number(fallbackMaxPrice || 0)),
    minBeds: Math.max(0, Number(row?.min_beds || 0)),
    minBaths: Math.max(0, Number(row?.min_baths || 0)),
    furnishing: row?.furnishing_preference || 'any',
    petFriendly: Boolean(row?.pet_friendly),
    verifiedOnly: Boolean(row?.owner_verified_only),
  }
}

export function buildSavedSearchPayload(filters, fallbackMaxPrice = 0) {
  const normalizedFilters = getSavedSearchFiltersFromRow(
    {
      location: filters?.location,
      min_price: filters?.minPrice,
      max_price: filters?.maxPrice,
      min_beds: filters?.minBeds,
      min_baths: filters?.minBaths,
      furnishing_preference: filters?.furnishing,
      pet_friendly: filters?.petFriendly,
      owner_verified_only: filters?.verifiedOnly,
    },
    fallbackMaxPrice
  )

  return {
    location: normalizedFilters.location || null,
    min_price: normalizedFilters.minPrice || 0,
    max_price: normalizedFilters.maxPrice || fallbackMaxPrice || 0,
    min_beds: normalizedFilters.minBeds || 0,
    min_baths: normalizedFilters.minBaths || 0,
    furnishing_preference: normalizedFilters.furnishing || 'any',
    pet_friendly: normalizedFilters.petFriendly,
    owner_verified_only: normalizedFilters.verifiedOnly,
  }
}

export function buildSavedSearchName(filters) {
  const parts = []

  if (filters.location) {
    parts.push(filters.location)
  }

  if (Number(filters.minPrice) > 0 || Number(filters.maxPrice) > 0) {
    const minLabel = Number(filters.minPrice) > 0 ? `${Math.round(Number(filters.minPrice) / 1000)}k` : '0'
    const maxLabel = Number(filters.maxPrice) > 0 ? `${Math.round(Number(filters.maxPrice) / 1000)}k` : 'any'
    parts.push(`৳${minLabel}-${maxLabel}`)
  }

  if (Number(filters.minBeds) > 0) {
    parts.push(`${filters.minBeds}+ bed`)
  }

  if (Number(filters.minBaths) > 0) {
    parts.push(`${filters.minBaths}+ bath`)
  }

  if (filters.furnishing === 'furnished') {
    parts.push('Furnished')
  } else if (filters.furnishing === 'unfurnished') {
    parts.push('Unfurnished')
  }

  if (filters.petFriendly) {
    parts.push('Pet friendly')
  }

  if (filters.verifiedOnly) {
    parts.push('Verified owner')
  }

  return parts.filter(Boolean).slice(0, 4).join(' • ') || 'Saved rental alert'
}

export function hasMeaningfulSavedSearchFilters(filters) {
  return Boolean(
    (filters?.location || '').trim()
    || Number(filters?.minPrice || 0) > 0
    || Number(filters?.maxPrice || 0) > 0
    || Number(filters?.minBeds || 0) > 0
    || Number(filters?.minBaths || 0) > 0
    || filters?.furnishing === 'furnished'
    || filters?.furnishing === 'unfurnished'
    || Boolean(filters?.petFriendly)
    || Boolean(filters?.verifiedOnly)
  )
}

export function matchesSavedSearch(post, filters) {
  const locationNeedle = (filters?.location || '').trim().toLowerCase()
  const propertyPrice = Number(post?.price || 0)
  const propertyBeds = Number(post?.beds || 0)
  const propertyBaths = Number(post?.baths || 0)
  const propertyFurnishing = post?.furnishing_status || 'unknown'
  const ownerVerified = getOwnerVerificationStatus(post?.owner_profile) === 'verified'

  if (locationNeedle) {
    const searchableLocation = `${post?.location || ''} ${post?.title || ''} ${post?.description || ''}`.toLowerCase()
    if (!searchableLocation.includes(locationNeedle)) {
      return false
    }
  }

  if (Number(filters?.minPrice || 0) > 0 && propertyPrice < Number(filters.minPrice)) {
    return false
  }

  if (Number(filters?.maxPrice || 0) > 0 && propertyPrice > Number(filters.maxPrice)) {
    return false
  }

  if (Number(filters?.minBeds || 0) > 0 && propertyBeds < Number(filters.minBeds)) {
    return false
  }

  if (Number(filters?.minBaths || 0) > 0 && propertyBaths < Number(filters.minBaths)) {
    return false
  }

  if (filters?.furnishing === 'furnished' && propertyFurnishing !== 'furnished') {
    return false
  }

  if (filters?.furnishing === 'unfurnished' && propertyFurnishing !== 'unfurnished') {
    return false
  }

  if (filters?.petFriendly && !post?.pet_friendly) {
    return false
  }

  if (filters?.verifiedOnly && !ownerVerified) {
    return false
  }

  return true
}

export async function fetchSavedSearches(userId, fallbackMaxPrice = 0) {
  if (!userId) return []

  const { data, error } = await supabase
    .from('saved_searches')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data || []).map((row) => ({
    ...row,
    filters: getSavedSearchFiltersFromRow(row, fallbackMaxPrice),
    display_name: row.name || buildSavedSearchName(getSavedSearchFiltersFromRow(row, fallbackMaxPrice)),
  }))
}

export async function createSavedSearch({ userId, filters, maxPrice }) {
  const payload = buildSavedSearchPayload(filters, maxPrice)
  const name = buildSavedSearchName({
    ...getSavedSearchFiltersFromRow(payload, maxPrice),
  })

  const { data, error } = await supabase
    .from('saved_searches')
    .insert({
      user_id: userId,
      name,
      ...payload,
      is_active: true,
    })
    .select('*')
    .single()

  if (error) throw error

  return {
    ...data,
    filters: getSavedSearchFiltersFromRow(data, maxPrice),
    display_name: data.name || name,
  }
}

export async function deleteSavedSearch(searchId) {
  if (!searchId) return

  const { error } = await supabase
    .from('saved_searches')
    .delete()
    .eq('id', searchId)

  if (error) throw error
}
