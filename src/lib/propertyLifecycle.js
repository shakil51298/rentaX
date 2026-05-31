export const AVAILABILITY_CONFIRMATION_DAYS = 3

const DAY_IN_MS = 24 * 60 * 60 * 1000

export function normalizePropertyStatus(status) {
  if (status === 'rented') return 'rented'
  if (status === 'paused') return 'paused'
  return 'open'
}

function parseTimestamp(value) {
  if (!value) return null

  const timestamp = new Date(value).getTime()

  return Number.isFinite(timestamp) ? timestamp : null
}

export function getAvailabilityConfirmedAt(property) {
  return (
    property?.availability_confirmed_at ||
    property?.freshness_confirmed_at ||
    property?.refreshed_at ||
    property?.created_at ||
    null
  )
}

export function getAvailabilityConfirmationDueAt(confirmedAt = new Date()) {
  const confirmedTimestamp = parseTimestamp(confirmedAt) || Date.now()

  return new Date(
    confirmedTimestamp + AVAILABILITY_CONFIRMATION_DAYS * DAY_IN_MS
  ).toISOString()
}

export function createAvailabilityConfirmationPayload(userId, confirmedAt = new Date()) {
  const confirmedAtIso = new Date(confirmedAt).toISOString()

  return {
    availability_confirmed_at: confirmedAtIso,
    availability_confirmation_due_at: getAvailabilityConfirmationDueAt(confirmedAtIso),
    availability_confirmed_by: userId ? String(userId) : null,
    refreshed_at: confirmedAtIso,
  }
}

export function getAvailabilityAgeDays(property, now = Date.now()) {
  const confirmedTimestamp = parseTimestamp(getAvailabilityConfirmedAt(property))

  if (confirmedTimestamp == null) return null

  return Math.max(0, Math.floor((now - confirmedTimestamp) / DAY_IN_MS))
}

export function isAvailabilityConfirmationDue(property, now = Date.now()) {
  if (normalizePropertyStatus(property?.status) !== 'open') return false

  const dueTimestamp = parseTimestamp(property?.availability_confirmation_due_at)

  if (dueTimestamp != null && dueTimestamp <= now) return true

  const ageDays = getAvailabilityAgeDays(property, now)

  return ageDays == null || ageDays >= AVAILABILITY_CONFIRMATION_DAYS
}

export function getAvailabilityFreshnessMeta(property, now = Date.now()) {
  const status = normalizePropertyStatus(property?.status)

  if (status === 'rented') {
    return {
      label: 'No longer available',
      compactLabel: 'Unavailable',
      icon: 'home-outline',
      backgroundColor: '#fef2f2',
      borderColor: '#fecaca',
      color: '#dc2626',
      isDue: false,
      ageDays: null,
    }
  }

  if (status === 'paused') {
    return {
      label: 'Paused by owner',
      compactLabel: 'Paused',
      icon: 'pause-circle-outline',
      backgroundColor: '#fff7ed',
      borderColor: '#fed7aa',
      color: '#ea580c',
      isDue: false,
      ageDays: null,
    }
  }

  const ageDays = getAvailabilityAgeDays(property, now)
  const isDue = isAvailabilityConfirmationDue(property, now)

  if (isDue) {
    return {
      label: 'Needs owner confirmation',
      compactLabel: 'Needs confirm',
      icon: 'alert-circle-outline',
      backgroundColor: '#fef2f2',
      borderColor: '#fecaca',
      color: '#dc2626',
      isDue: true,
      ageDays,
    }
  }

  const label =
    ageDays === 0
      ? 'Verified today'
      : ageDays === 1
        ? 'Verified 1 day ago'
        : `Verified ${ageDays} days ago`

  return {
    label,
    compactLabel: label,
    icon: 'shield-checkmark-outline',
    backgroundColor: '#ecfdf5',
    borderColor: '#bbf7d0',
    color: '#059669',
    isDue: false,
    ageDays,
  }
}

export function isUrgentProperty(property) {
  if (!property?.urgent_until) return false
  if (normalizePropertyStatus(property?.status) !== 'open') return false

  return new Date(property.urgent_until).getTime() > Date.now()
}

export function getFeedFreshnessTimestamp(property) {
  return new Date(
    property?.availability_confirmed_at ||
    property?.refreshed_at ||
    property?.created_at ||
    0
  ).getTime()
}

export function sortPropertiesForFeed(properties = []) {
  return [...properties].sort((left, right) => {
    const urgentDelta = Number(isUrgentProperty(right)) - Number(isUrgentProperty(left))

    if (urgentDelta !== 0) return urgentDelta

    const freshnessDelta = getFeedFreshnessTimestamp(right) - getFeedFreshnessTimestamp(left)

    if (freshnessDelta !== 0) return freshnessDelta

    return new Date(right?.created_at || 0).getTime() - new Date(left?.created_at || 0).getTime()
  })
}
