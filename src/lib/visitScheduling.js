import { supabase } from './supabase'

export function formatVisitDateTime(value) {
  if (!value) return 'Time not set'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Time not set'

  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function getVisitStatusMeta(status) {
  if (status === 'accepted') {
    return {
      label: 'Accepted',
      color: '#15803d',
      backgroundColor: '#dcfce7',
      icon: 'checkmark-circle',
    }
  }

  if (status === 'rejected') {
    return {
      label: 'Rejected',
      color: '#b91c1c',
      backgroundColor: '#fee2e2',
      icon: 'close-circle',
    }
  }

  if (status === 'rescheduled') {
    return {
      label: 'Rescheduled',
      color: '#7c3aed',
      backgroundColor: '#ede9fe',
      icon: 'calendar',
    }
  }

  if (status === 'cancelled') {
    return {
      label: 'Cancelled',
      color: '#475569',
      backgroundColor: '#e2e8f0',
      icon: 'ban',
    }
  }

  return {
    label: 'Pending',
    color: '#b45309',
    backgroundColor: '#fef3c7',
    icon: 'time',
  }
}

export function buildVisitTimestamp(dateText, timeText) {
  const safeDate = String(dateText || '').trim()
  const safeTime = String(timeText || '').trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
    throw new Error('Use the date format YYYY-MM-DD.')
  }

  if (!/^\d{1,2}:\d{2}$/.test(safeTime)) {
    throw new Error('Use the time format HH:MM.')
  }

  const [hoursRaw, minutesRaw] = safeTime.split(':')
  const hours = Number(hoursRaw)
  const minutes = Number(minutesRaw)

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('Please enter a valid time.')
  }

  const iso = new Date(`${safeDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`).toISOString()

  if (Number.isNaN(new Date(iso).getTime())) {
    throw new Error('Please enter a valid visit date and time.')
  }

  return iso
}

export function splitVisitTimestamp(value) {
  if (!value) {
    return {
      dateText: '',
      timeText: '',
    }
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return {
      dateText: '',
      timeText: '',
    }
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return {
    dateText: `${year}-${month}-${day}`,
    timeText: `${hours}:${minutes}`,
  }
}

export async function fetchVisitRequestForProperty({ propertyId, requesterId }) {
  if (!propertyId || !requesterId) return null

  const { data, error } = await supabase
    .from('property_visit_requests')
    .select('*')
    .eq('property_id', String(propertyId))
    .eq('requester_id', String(requesterId))
    .maybeSingle()

  if (error) throw error

  return data || null
}

export async function saveVisitRequest({
  property,
  requesterId,
  requestedFor,
  requestMessage,
}) {
  const payload = {
    property_id: String(property.id),
    owner_id: String(property.owner_id),
    requester_id: String(requesterId),
    requested_for: requestedFor,
    request_message: requestMessage?.trim() || null,
    status: 'pending',
    owner_response_note: null,
    owner_proposed_for: null,
    responded_at: null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('property_visit_requests')
    .upsert(payload, { onConflict: 'property_id,requester_id' })
    .select('*')
    .single()

  if (error) throw error

  return data
}

export async function fetchOwnerVisitRequests(ownerId) {
  if (!ownerId) return []

  const { data, error } = await supabase
    .from('property_visit_requests')
    .select('*')
    .eq('owner_id', String(ownerId))
    .order('created_at', { ascending: false })

  if (error) throw error

  const rows = data || []
  const propertyIds = [...new Set(rows.map((item) => String(item.property_id)).filter(Boolean))]
  const requesterIds = [...new Set(rows.map((item) => String(item.requester_id)).filter(Boolean))]

  const [propertiesResponse, profilesResponse] = await Promise.all([
    propertyIds.length
      ? supabase.from('properties').select('id, title, location, price, media, owner_id').in('id', propertyIds)
      : Promise.resolve({ data: [] }),
    requesterIds.length
      ? supabase
          .from('user_profiles')
          .select('user_id, email, display_name, avatar_url, is_verified, phone')
          .in('user_id', requesterIds)
      : Promise.resolve({ data: [] }),
  ])

  const propertiesById = (propertiesResponse.data || []).reduce((itemsById, item) => {
    itemsById[String(item.id)] = item
    return itemsById
  }, {})
  const profilesById = (profilesResponse.data || []).reduce((itemsById, item) => {
    itemsById[String(item.user_id)] = item
    return itemsById
  }, {})

  return rows.map((item) => ({
    ...item,
    property: propertiesById[String(item.property_id)] || null,
    requester_profile: profilesById[String(item.requester_id)] || null,
  }))
}

export async function updateVisitRequestStatus({
  requestId,
  nextStatus,
  ownerResponseNote,
  ownerProposedFor,
}) {
  const payload = {
    status: nextStatus,
    owner_response_note: ownerResponseNote?.trim() || null,
    owner_proposed_for: ownerProposedFor || null,
    responded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('property_visit_requests')
    .update(payload)
    .eq('id', requestId)
    .select('*')
    .single()

  if (error) throw error

  return data
}

export async function cancelVisitRequest(requestId) {
  const { data, error } = await supabase
    .from('property_visit_requests')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select('*')
    .single()

  if (error) throw error

  return data
}
