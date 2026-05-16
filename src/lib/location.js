import * as ExpoLocation from 'expo-location'

function uniqueParts(parts) {
  return parts.filter((part, index) => part && parts.indexOf(part) === index)
}

function joinAddressParts(parts, fallback) {
  const cleaned = uniqueParts(
    (parts || [])
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
  )

  return cleaned.length ? cleaned.join(', ') : fallback
}

function buildAreaLabelFromAddress(address, fallback = 'Selected area') {
  if (!address) return fallback

  const primaryArea =
    address.neighbourhood ||
    address.suburb ||
    address.city_district ||
    address.quarter ||
    address.district ||
    address.town ||
    address.city ||
    address.village ||
    address.subregion ||
    address.county ||
    address.region ||
    address.state_district ||
    address.state

  const parentArea =
    address.city ||
    address.town ||
    address.county ||
    address.region ||
    address.state_district ||
    address.state ||
    address.country

  return joinAddressParts([primaryArea, parentArea], fallback)
}

function normalizeExpoAddress(place, fallback = 'Selected area') {
  const areaLabel = buildAreaLabelFromAddress(
    {
      neighbourhood: place?.district || place?.subregion || place?.name,
      city: place?.city,
      region: place?.region,
      country: place?.country,
    },
    fallback
  )

  const fullLabel =
    place?.formattedAddress ||
    joinAddressParts(
      [
        place?.name,
        place?.street,
        place?.district,
        place?.subregion,
        place?.city,
        place?.region,
        place?.country,
      ],
      areaLabel
    )

  return {
    areaLabel,
    fullLabel,
  }
}

async function fetchOpenStreetMapSelection(coords) {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.latitude}&lon=${coords.longitude}&accept-language=en`,
    {
      headers: {
        Accept: 'application/json',
      },
    }
  )

  if (!response.ok) {
    throw new Error('Reverse geocoding failed')
  }

  const data = await response.json()
  const address = data?.address || {}
  const areaLabel = buildAreaLabelFromAddress(address, 'Selected area')

  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    label: areaLabel,
    areaLabel,
    fullLabel: data?.display_name || areaLabel,
  }
}

export async function getLocationSelectionFromCoords(coords, fallback = 'Selected area') {
  try {
    return await fetchOpenStreetMapSelection(coords)
  } catch {
    const places = await ExpoLocation.reverseGeocodeAsync(coords)
    const normalized = normalizeExpoAddress(places?.[0], fallback)

    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      label: normalized.areaLabel,
      areaLabel: normalized.areaLabel,
      fullLabel: normalized.fullLabel,
    }
  }
}

export async function searchLocationSelection(query) {
  const cleanedQuery = (query || '').trim()
  if (!cleanedQuery) return null

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(cleanedQuery)}&limit=1&accept-language=en`,
      {
        headers: {
          Accept: 'application/json',
        },
      }
    )

    if (!response.ok) {
      throw new Error('Search failed')
    }

    const results = await response.json()
    const firstMatch = results?.[0]

    if (!firstMatch) return null

    const latitude = Number(firstMatch.lat)
    const longitude = Number(firstMatch.lon)

    return {
      latitude,
      longitude,
      label: buildAreaLabelFromAddress(firstMatch.address || {}, cleanedQuery),
      areaLabel: buildAreaLabelFromAddress(firstMatch.address || {}, cleanedQuery),
      fullLabel: firstMatch.display_name || cleanedQuery,
    }
  } catch {
    const results = await ExpoLocation.geocodeAsync(cleanedQuery)
    const firstMatch = results?.[0]

    if (!firstMatch) return null

    return getLocationSelectionFromCoords(
      {
        latitude: firstMatch.latitude,
        longitude: firstMatch.longitude,
      },
      cleanedQuery
    )
  }
}
