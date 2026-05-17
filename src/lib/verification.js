export function getVerificationMeta(status, options = {}) {
  const verifiedLabel = options.verifiedLabel || 'Verified'
  const pendingLabel = options.pendingLabel || 'Pending review'
  const rejectedLabel = options.rejectedLabel || 'Needs update'
  const defaultLabel = options.defaultLabel || 'Not verified'

  switch (status) {
    case 'verified':
      return {
        label: verifiedLabel,
        icon: 'checkmark-circle',
        backgroundColor: '#eff6ff',
        textColor: '#2563eb',
        borderColor: '#bfdbfe',
      }
    case 'pending':
      return {
        label: pendingLabel,
        icon: 'time-outline',
        backgroundColor: '#fff7ed',
        textColor: '#ea580c',
        borderColor: '#fed7aa',
      }
    case 'rejected':
      return {
        label: rejectedLabel,
        icon: 'alert-circle-outline',
        backgroundColor: '#fef2f2',
        textColor: '#dc2626',
        borderColor: '#fecaca',
      }
    default:
      return {
        label: defaultLabel,
        icon: 'shield-outline',
        backgroundColor: '#f8fafc',
        textColor: '#64748b',
        borderColor: '#e2e8f0',
      }
  }
}

export function getOwnerVerificationStatus(profile) {
  if (profile?.owner_verification_status) {
    return profile.owner_verification_status
  }

  return profile?.is_verified ? 'verified' : 'unverified'
}

export function getPropertyVerificationStatus(property) {
  return property?.verification_status || 'unverified'
}
