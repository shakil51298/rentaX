import { supabase } from './supabase'

function normalizeIds(ids) {
  return [...new Set((ids || []).filter(Boolean).map((id) => String(id)))]
}

export async function fetchPropertyViewCounts(propertyIds) {
  const ids = normalizeIds(propertyIds)
  if (!ids.length) return {}

  const { data, error } = await supabase
    .from('property_views')
    .select('property_id')
    .in('property_id', ids)

  if (error) {
    return {}
  }

  return (data || []).reduce((countsById, row) => {
    const key = String(row.property_id)
    countsById[key] = (countsById[key] || 0) + 1
    return countsById
  }, {})
}

export async function fetchPropertyViewCount(propertyId) {
  const id = propertyId ? String(propertyId) : null
  if (!id) return 0

  const countsById = await fetchPropertyViewCounts([id])
  return countsById[id] || 0
}

export async function recordPropertyView({ propertyId, userId, ownerId }) {
  const normalizedPropertyId = propertyId ? String(propertyId) : null
  if (!normalizedPropertyId || !userId || String(ownerId) === String(userId)) {
    return { inserted: false, viewCount: 0 }
  }

  const { data: existingView, error: selectError } = await supabase
    .from('property_views')
    .select('id')
    .eq('property_id', normalizedPropertyId)
    .eq('viewer_id', userId)
    .maybeSingle()

  if (selectError) {
    return { inserted: false, viewCount: 0 }
  }

  if (!existingView) {
    await supabase.from('property_views').insert({
      property_id: normalizedPropertyId,
      viewer_id: userId,
    })
  }

  const viewCount = await fetchPropertyViewCount(normalizedPropertyId)

  return {
    inserted: !existingView,
    viewCount,
  }
}
