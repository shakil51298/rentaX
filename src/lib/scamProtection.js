import { supabase } from './supabase'
import { getOwnerVerificationStatus, getPropertyVerificationStatus } from './verification'

export const PAYMENT_SAFETY_WARNING =
  'Do not pay before visiting the property, checking documents, and confirming the owner.'

const SAFETY_FLAG_META = {
  suspicious_price: {
    label: 'Price warning',
    icon: 'pricetag-outline',
    tint: '#ea580c',
    background: '#fff7ed',
    border: '#fed7aa',
  },
  duplicate_photo: {
    label: 'Photo match',
    icon: 'images-outline',
    tint: '#dc2626',
    background: '#fef2f2',
    border: '#fecaca',
  },
  repeated_photo: {
    label: 'Repeated photo',
    icon: 'copy-outline',
    tint: '#b91c1c',
    background: '#fef2f2',
    border: '#fecaca',
  },
  reported_scam: {
    label: 'Scam reports',
    icon: 'warning-outline',
    tint: '#dc2626',
    background: '#fef2f2',
    border: '#fecaca',
  },
  reported_fake: {
    label: 'Fake reports',
    icon: 'alert-circle-outline',
    tint: '#ea580c',
    background: '#fff7ed',
    border: '#fed7aa',
  },
  reported_duplicate: {
    label: 'Duplicate reports',
    icon: 'copy-outline',
    tint: '#7c3aed',
    background: '#f5f3ff',
    border: '#ddd6fe',
  },
  unverified_owner: {
    label: 'Owner not verified',
    icon: 'shield-outline',
    tint: '#64748b',
    background: '#f8fafc',
    border: '#e2e8f0',
  },
  unverified_property: {
    label: 'Property not verified',
    icon: 'home-outline',
    tint: '#64748b',
    background: '#f8fafc',
    border: '#e2e8f0',
  },
  verified_owner: {
    label: 'Verified owner',
    icon: 'checkmark-circle',
    tint: '#2563eb',
    background: '#eff6ff',
    border: '#bfdbfe',
  },
  verified_property: {
    label: 'Verified property',
    icon: 'shield-checkmark-outline',
    tint: '#059669',
    background: '#ecfdf5',
    border: '#bbf7d0',
  },
  report_risk: {
    label: 'Report risk',
    icon: 'flag-outline',
    tint: '#dc2626',
    background: '#fef2f2',
    border: '#fecaca',
  },
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function parseRentValue(value) {
  const parsed = Number(String(value || '').replace(/[^\d.]/g, ''))

  return Number.isFinite(parsed) ? parsed : 0
}

function stableHash(value) {
  let hash = 2166136261
  const text = String(value || '')

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function getMediaName(uri) {
  return String(uri || '')
    .split('?')[0]
    .split('#')[0]
    .split('/')
    .pop()
    ?.toLowerCase() || ''
}

export function buildMediaFingerprint(asset) {
  const uri = asset?.uri || asset?.url || asset?.path || ''
  const assetId = asset?.assetId || asset?.asset_id || ''
  const fileName = asset?.fileName || asset?.filename || getMediaName(uri)
  const width = asset?.width || ''
  const height = asset?.height || ''
  const fileSize = asset?.fileSize || asset?.file_size || asset?.size || ''
  const mimeType = asset?.mimeType || asset?.mime_type || ''
  const type = asset?.type || asset?.media_type || ''
  const fingerprintSource = [
    type,
    mimeType,
    assetId ? `asset:${assetId}` : '',
    String(fileName || '').toLowerCase(),
    width,
    height,
    fileSize,
  ]
    .filter((part) => part !== '' && part != null)
    .join('|')

  if (!fingerprintSource) return null

  return `media:${stableHash(fingerprintSource)}`
}

export function buildMediaFingerprints(media = []) {
  return [...new Set(
    media
      .map(buildMediaFingerprint)
      .filter(Boolean)
  )]
}

export function countRepeatedMediaFingerprints(media = []) {
  const counts = media
    .map(buildMediaFingerprint)
    .filter(Boolean)
    .reduce((itemsByFingerprint, fingerprint) => ({
      ...itemsByFingerprint,
      [fingerprint]: (itemsByFingerprint[fingerprint] || 0) + 1,
    }), {})

  return Object.values(counts).filter((count) => count > 1).length
}

export function getSuspiciousPriceWarnings({ price, sizeSqft }) {
  const rent = parseRentValue(price)
  const size = Number(sizeSqft || 0)
  const warnings = []

  if (!rent) return warnings

  if (rent < 5000) {
    warnings.push('Rent is unusually low. Double-check the price before posting.')
  }

  if (rent > 500000) {
    warnings.push('Rent is above 500,000 BDT. Check for an extra zero.')
  }

  if (size > 0) {
    const rentPerSqft = rent / size

    if (rentPerSqft < 8) {
      warnings.push('Rent per square foot looks unusually low.')
    } else if (rentPerSqft > 450) {
      warnings.push('Rent per square foot looks unusually high.')
    }
  }

  return warnings
}

export function buildSafetyFlagsForPost({
  priceWarnings = [],
  duplicateMatchCount = 0,
  repeatedMediaCount = 0,
}) {
  const flags = []

  if (priceWarnings.length > 0) {
    flags.push('suspicious_price')
  }

  if (duplicateMatchCount > 0) {
    flags.push('duplicate_photo')
  }

  if (repeatedMediaCount > 0) {
    flags.push('repeated_photo')
  }

  return flags
}

export function buildSafetyWarningsForPost({
  priceWarnings = [],
  duplicateMatchCount = 0,
  repeatedMediaCount = 0,
}) {
  const warnings = [...priceWarnings]

  if (repeatedMediaCount > 0) {
    warnings.push('The same photo appears to be selected more than once.')
  }

  if (duplicateMatchCount > 0) {
    warnings.push(`${duplicateMatchCount} existing listing${duplicateMatchCount === 1 ? '' : 's'} may already use matching property media.`)
  }

  return warnings
}

export async function fetchDuplicateMediaMatchCount({
  fingerprints = [],
  excludePropertyId,
}) {
  if (!fingerprints.length) return 0

  let query = supabase
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .overlaps('media_fingerprints', fingerprints)

  if (excludePropertyId) {
    query = query.neq('id', excludePropertyId)
  }

  const { count, error } = await query

  if (error) throw error

  return count || 0
}

export function getSafetyFlagMeta(flag) {
  return SAFETY_FLAG_META[flag] || null
}

export function getListingSafetySummary(property = {}, ownerProfile = {}) {
  const flags = new Set(Array.isArray(property?.safety_flags) ? property.safety_flags : [])
  const priceWarnings = getSuspiciousPriceWarnings({
    price: property?.price,
    sizeSqft: property?.size_sqft,
  })
  const ownerStatus = getOwnerVerificationStatus(ownerProfile)
  const propertyStatus = getPropertyVerificationStatus(property)
  const reportScore = clamp(Number(property?.report_risk_score || 0), 0, 100)
  const reportCount = Number(property?.safety_report_count || 0)
  const duplicateCount = Number(property?.duplicate_media_match_count || 0)

  if (property?.suspicious_price_warning || priceWarnings.length > 0) {
    flags.add('suspicious_price')
  }

  if (property?.duplicate_photo_warning || duplicateCount > 0) {
    flags.add('duplicate_photo')
  }

  if (reportScore >= 35 || reportCount >= 3) {
    flags.add('report_risk')
  }

  if (ownerStatus === 'verified') {
    flags.add('verified_owner')
  } else {
    flags.add('unverified_owner')
  }

  if (propertyStatus === 'verified') {
    flags.add('verified_property')
  } else {
    flags.add('unverified_property')
  }

  let score = reportScore

  if (flags.has('duplicate_photo')) score += 35
  if (flags.has('reported_scam')) score += 30
  if (flags.has('reported_fake')) score += 22
  if (flags.has('suspicious_price')) score += 24
  if (flags.has('unverified_owner')) score += 8
  if (flags.has('unverified_property')) score += 6
  if (flags.has('verified_owner')) score -= 8
  if (flags.has('verified_property')) score -= 12

  score = clamp(score, 0, 100)

  const level = score >= 70 ? 'high' : score >= 35 ? 'medium' : 'low'
  const levelMeta = level === 'high'
    ? {
        label: 'High risk',
        tint: '#dc2626',
        background: '#fef2f2',
        border: '#fecaca',
        icon: 'warning-outline',
      }
    : level === 'medium'
      ? {
          label: 'Needs review',
          tint: '#ea580c',
          background: '#fff7ed',
          border: '#fed7aa',
          icon: 'alert-circle-outline',
        }
      : {
          label: 'Low risk',
          tint: '#059669',
          background: '#ecfdf5',
          border: '#bbf7d0',
          icon: 'shield-checkmark-outline',
        }

  const visibleFlags = [...flags]
    .map(getSafetyFlagMeta)
    .filter(Boolean)

  return {
    score,
    level,
    levelMeta,
    flags: [...flags],
    visibleFlags,
    priceWarnings,
    duplicateCount,
    reportCount,
    shouldShowCompactWarning: score >= 35 || flags.has('duplicate_photo') || flags.has('suspicious_price') || flags.has('report_risk'),
  }
}
