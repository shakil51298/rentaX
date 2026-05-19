export function formatClock(date) {
  if (!date) return ''

  return new Date(date).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatDayLabel(date) {
  if (!date) return ''

  const value = new Date(date)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (value.toDateString() === today.toDateString()) return 'Today'
  if (value.toDateString() === yesterday.toDateString()) return 'Yesterday'

  return value.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export function isSameDay(firstDate, secondDate) {
  if (!firstDate || !secondDate) return false

  return new Date(firstDate).toDateString() === new Date(secondDate).toDateString()
}

export function formatDuration(milliseconds = 0) {
  const totalSeconds = Math.max(Math.floor(milliseconds / 1000), 0)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatDurationSeconds(totalSeconds = 0) {
  const safeSeconds = Math.max(Math.floor(totalSeconds), 0)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function mediaLabel(type) {
  if (type === 'image') return 'Photo'
  if (type === 'video') return 'Video'
  if (type === 'voice') return 'Voice message'
  if (type === 'call') return 'Call'
  return 'Message'
}

export function getCallPresentation(message = {}) {
  const bodyText = String(message.body || message.last_message || '').toLowerCase()
  const isVideo =
    message.call_kind === 'video' ||
    (message.call_kind == null && bodyText.includes('video call'))
  const isCompleted = message.call_status === 'completed'

  return {
    isVideo,
    isCompleted,
    title:
      message.body ||
      (isCompleted
        ? isVideo
          ? 'Outgoing video call'
          : 'Outgoing audio call'
        : isVideo
          ? 'Outgoing video call cancelled'
          : 'Outgoing audio call cancelled'),
    iconName: isCompleted
      ? isVideo
        ? 'videocam-outline'
        : 'call-outline'
      : isVideo
        ? 'videocam-off-outline'
        : 'close-circle-outline',
    iconColor: isCompleted ? '#16a34a' : '#dc2626',
    previewIconName: isVideo ? 'videocam' : 'call',
    summaryLabel: isVideo ? 'Video call' : 'Audio call',
  }
}

export function getPropertyId(property) {
  if (!property?.id) return null

  return String(property.id)
}

export function getDirectTarget(routeParams) {
  const owner = routeParams?.owner
  const profile = routeParams?.profile
  const property = routeParams?.property

  if (owner?.id) {
    return {
      id: owner.id,
      email: owner.email || profile?.email,
      display_name: profile?.display_name || owner.name,
      avatar_url: profile?.avatar_url,
      is_verified: profile?.is_verified,
    }
  }

  if (property?.owner_id) {
    const ownerProfile = property.owner_profile || {}

    return {
      id: property.owner_id,
      email: ownerProfile.email || property.owner_email,
      display_name: ownerProfile.display_name || property.owner_name,
      avatar_url: ownerProfile.avatar_url,
      is_verified: ownerProfile.is_verified,
    }
  }

  if (routeParams?.participant?.id) {
    return routeParams.participant
  }

  return null
}

export function formatLastSeen(date) {
  if (!date) return 'Offline'

  const diffMs = Date.now() - new Date(date).getTime()
  const diffMinutes = Math.floor(diffMs / 60000)

  if (diffMinutes < 1) return 'Last seen just now'
  if (diffMinutes < 60) return `Last seen ${diffMinutes} min ago`

  const diffHours = Math.floor(diffMinutes / 60)

  if (diffHours < 24) {
    return `Last seen ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  }

  return `Last seen ${new Date(date).toLocaleDateString()}`
}
