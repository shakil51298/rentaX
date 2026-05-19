export function normalizePropertyStatus(status) {
  if (status === 'rented') return 'rented'
  if (status === 'paused') return 'paused'
  return 'open'
}

export function isUrgentProperty(property) {
  if (!property?.urgent_until) return false
  if (normalizePropertyStatus(property?.status) !== 'open') return false

  return new Date(property.urgent_until).getTime() > Date.now()
}

export function getFeedFreshnessTimestamp(property) {
  return new Date(property?.refreshed_at || property?.created_at || 0).getTime()
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
