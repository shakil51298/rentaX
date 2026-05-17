import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  findNodeHandle,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { isPrimaryAdmin } from '../lib/admin'
import { createNotification } from '../lib/notifications'
import { getPropertyVerificationStatus, getVerificationMeta } from '../lib/verification'
import { createSignedMediaUrl, VERIFICATION_MEDIA_BUCKET } from '../lib/media'

function formatDate(date) {
  if (!date) return 'Unknown time'

  try {
    return new Date(date).toLocaleString()
  } catch (_error) {
    return 'Unknown time'
  }
}

function FilterPill({ title, active, onPress, count }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? '#1877F2' : '#dbe4ee',
        backgroundColor: active ? '#eff6ff' : '#fff',
        paddingHorizontal: 12,
        paddingVertical: 9,
        marginRight: 8,
      }}
    >
      <Text style={{ color: active ? '#1877F2' : '#475569', fontWeight: '800', fontSize: 12 }}>
        {title} ({count})
      </Text>
    </TouchableOpacity>
  )
}

function StatusChip({ meta }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: meta.backgroundColor,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: meta.borderColor,
        paddingHorizontal: 10,
        paddingVertical: 6,
      }}
    >
      <Ionicons name={meta.icon} size={14} color={meta.textColor} />
      <Text style={{ color: meta.textColor, fontWeight: '800', fontSize: 12, marginLeft: 6 }}>
        {meta.label}
      </Text>
    </View>
  )
}

function SectionCard({ children }) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 16,
        marginBottom: 14,
      }}
    >
      {children}
    </View>
  )
}

function InfoLine({ label, value }) {
  if (!value) return null

  return (
    <Text style={{ color: '#475569', marginTop: 5, lineHeight: 19 }}>
      <Text style={{ fontWeight: '800', color: '#334155' }}>{label}: </Text>
      {value}
    </Text>
  )
}

function ReviewButtons({ approving, rejecting, onApprove, onReject }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
      <TouchableOpacity
        onPress={onApprove}
        disabled={approving || rejecting}
        style={{
          flex: 1,
          borderRadius: 14,
          backgroundColor: approving ? '#86efac' : '#16a34a',
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '900' }}>
          {approving ? 'Approving...' : 'Approve'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onReject}
        disabled={approving || rejecting}
        style={{
          flex: 1,
          borderRadius: 14,
          backgroundColor: rejecting ? '#fca5a5' : '#dc2626',
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '900' }}>
          {rejecting ? 'Rejecting...' : 'Reject'}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

function DocumentPreviewStrip({ frontUrl, backUrl, selfieUrl, onOpen }) {
  const previews = [
    { key: 'front', title: 'Front', uri: frontUrl },
    { key: 'back', title: 'Back', uri: backUrl },
    { key: 'selfie', title: 'Selfie', uri: selfieUrl },
  ].filter((item) => item.uri)

  if (!previews.length) return null

  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ color: '#334155', fontWeight: '800', fontSize: 13, marginBottom: 10 }}>
        Uploaded proofs
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {previews.map((item, index) => (
          <TouchableOpacity
            key={item.key}
            onPress={() => onOpen?.(item)}
            activeOpacity={0.88}
            style={{
              width: 114,
              marginRight: index === previews.length - 1 ? 0 : 10,
            }}
          >
            <Image
              source={{ uri: item.uri }}
              style={{
                width: 114,
                height: 114,
                borderRadius: 14,
                backgroundColor: '#e2e8f0',
              }}
              resizeMode="cover"
            />
            <Text style={{ color: '#475569', fontSize: 12, fontWeight: '800', marginTop: 6 }}>
              {item.title}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  )
}

function SummaryTile({ title, count, icon, tint }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 14,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={18} color="#fff" />
      </View>

      <Text style={{ color: '#0f172a', fontSize: 22, fontWeight: '900', marginTop: 12 }}>
        {count}
      </Text>
      <Text style={{ color: '#64748b', marginTop: 4, fontSize: 12, fontWeight: '800' }}>
        {title}
      </Text>
    </View>
  )
}

function CollapsibleSection({ title, subtitle, expanded, onToggle, children, count }) {
  return (
    <SectionCard>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.86}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <View style={{ flex: 1, paddingRight: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '900' }}>{title}</Text>
            <View
              style={{
                marginLeft: 8,
                minWidth: 22,
                height: 22,
                borderRadius: 11,
                paddingHorizontal: 6,
                backgroundColor: '#eff6ff',
                borderWidth: 1,
                borderColor: '#bfdbfe',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#2563eb', fontSize: 11, fontWeight: '900' }}>
                {count}
              </Text>
            </View>
          </View>
          {subtitle ? (
            <Text style={{ color: '#64748b', marginTop: 4, lineHeight: 19 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#475569" />
      </TouchableOpacity>

      {expanded ? <View style={{ marginTop: 14 }}>{children}</View> : null}
    </SectionCard>
  )
}

function HistoryEntryRow({ entry, kind }) {
  const isRejected = entry.action_type === 'rejected'
  const isApproved = entry.action_type === 'approved'
  const isSubmitted = entry.action_type === 'submitted' || entry.action_type === 'resubmitted'
  const color = isRejected ? '#dc2626' : isApproved ? '#16a34a' : '#2563eb'
  const icon = isRejected ? 'close-circle' : isApproved ? 'checkmark-circle' : 'time'
  const labelMap = {
    submitted: 'Submitted',
    resubmitted: 'Updated request',
    approved: 'Approved',
    rejected: 'Rejected',
  }

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        backgroundColor: '#f8fafc',
        padding: 12,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Ionicons name={icon} size={16} color={color} />
          <Text style={{ color, fontWeight: '900', marginLeft: 8 }}>
            {labelMap[entry.action_type] || entry.action_type}
          </Text>
        </View>
        <Text style={{ color: '#64748b', fontSize: 12 }}>{formatDate(entry.created_at)}</Text>
      </View>

      {kind === 'owner' ? (
        <>
          <InfoLine label="Phone" value={entry.phone} />
          <InfoLine
            label="ID"
            value={entry.id_type && entry.id_last4 ? `${entry.id_type} •••• ${entry.id_last4}` : ''}
          />
          <InfoLine label="Note" value={entry.note} />
        </>
      ) : (
        <>
          <InfoLine label="Property" value={entry.title} />
          <InfoLine label="Location" value={entry.location} />
          <InfoLine label="Rent" value={entry.price ? `৳ ${entry.price}` : ''} />
        </>
      )}

      <InfoLine label="Reviewed by" value={entry.reviewed_by_email} />
      <InfoLine label="Reason" value={entry.rejection_reason} />
    </View>
  )
}

export default function ReviewVerifyScreen({ navigation }) {
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [owners, setOwners] = useState([])
  const [properties, setProperties] = useState([])
  const [verifiedOwners, setVerifiedOwners] = useState([])
  const [verifiedProperties, setVerifiedProperties] = useState([])
  const [propertyOwnersById, setPropertyOwnersById] = useState({})
  const [ownerHistoriesByUserId, setOwnerHistoriesByUserId] = useState({})
  const [propertyHistoriesById, setPropertyHistoriesById] = useState({})
  const [activeTab, setActiveTab] = useState('owners')
  const [busyKey, setBusyKey] = useState('')
  const [ownerRejectReasons, setOwnerRejectReasons] = useState({})
  const [propertyRejectReasons, setPropertyRejectReasons] = useState({})
  const [previewAsset, setPreviewAsset] = useState(null)
  const [expandedOwnerHistory, setExpandedOwnerHistory] = useState({})
  const [expandedPropertyHistory, setExpandedPropertyHistory] = useState({})
  const [verifiedOwnersExpanded, setVerifiedOwnersExpanded] = useState(false)
  const [verifiedPropertiesExpanded, setVerifiedPropertiesExpanded] = useState(false)
  const scrollViewRef = useRef(null)
  const ownerRejectInputRefs = useRef({})
  const propertyRejectInputRefs = useRef({})

  const loadReviewData = useCallback(async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const allowed = isPrimaryAdmin(user)
    setAuthorized(allowed)

    if (!allowed) {
      setOwners([])
      setProperties([])
      setVerifiedOwners([])
      setVerifiedProperties([])
      setPropertyOwnersById({})
      setOwnerHistoriesByUserId({})
      setPropertyHistoriesById({})
      setLoading(false)
      return
    }

    const [
      { data: ownerRows },
      { data: propertyRows },
      { data: verifiedOwnerRows },
      { data: verifiedPropertyRows },
      ownerHistoryResponse,
      propertyHistoryResponse,
    ] = await Promise.all([
      supabase
        .from('user_profiles')
        .select(`
          user_id,
          email,
          display_name,
          avatar_url,
          phone,
          location,
          user_type,
          owner_verification_status,
          owner_verification_requested_at,
          owner_verification_rejection_reason,
          owner_verification_phone,
          owner_verification_id_type,
          owner_verification_id_last4,
          owner_verification_note,
          owner_verification_document_front_path,
          owner_verification_document_back_path,
          owner_verification_selfie_path
        `)
        .eq('owner_verification_status', 'pending')
        .order('owner_verification_requested_at', { ascending: true }),
      supabase
        .from('properties')
        .select(`
          id,
          owner_id,
          title,
          location,
          price,
          status,
          verification_status,
          verification_requested_at,
          verification_contact_phone,
          verification_note,
          verification_rejection_reason
        `)
        .eq('verification_status', 'pending')
        .order('verification_requested_at', { ascending: true }),
      supabase
        .from('user_profiles')
        .select(`
          user_id,
          email,
          display_name,
          avatar_url,
          location,
          owner_verification_reviewed_at
        `)
        .eq('owner_verification_status', 'verified')
        .order('owner_verification_reviewed_at', { ascending: false }),
      supabase
        .from('properties')
        .select(`
          id,
          owner_id,
          title,
          location,
          price,
          verification_reviewed_at
        `)
        .eq('verification_status', 'verified')
        .order('verification_reviewed_at', { ascending: false }),
      supabase
        .from('owner_verification_history')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('property_verification_history')
        .select('*')
        .order('created_at', { ascending: false }),
    ])

    const ownerHistoryRows = ownerHistoryResponse?.data || []
    const propertyHistoryRows = propertyHistoryResponse?.data || []
    const ownerIds = [
      ...new Set(
        [...(propertyRows || []), ...(verifiedPropertyRows || [])]
          .map((item) => item.owner_id)
          .filter(Boolean)
      ),
    ]
    let ownersById = {}

    if (ownerIds.length) {
      const { data: ownerProfiles } = await supabase
        .from('user_profiles')
        .select('user_id, email, display_name, phone, location, is_verified, owner_verification_status')
        .in('user_id', ownerIds)

      ownersById = (ownerProfiles || []).reduce((accumulator, item) => {
        accumulator[item.user_id] = item
        return accumulator
      }, {})
    }

    const ownersWithPreviewUrls = await Promise.all(
      (ownerRows || []).map(async (item) => {
        const [frontUrl, backUrl, selfieUrl] = await Promise.all([
          item.owner_verification_document_front_path
            ? createSignedMediaUrl(VERIFICATION_MEDIA_BUCKET, item.owner_verification_document_front_path)
            : Promise.resolve(null),
          item.owner_verification_document_back_path
            ? createSignedMediaUrl(VERIFICATION_MEDIA_BUCKET, item.owner_verification_document_back_path)
            : Promise.resolve(null),
          item.owner_verification_selfie_path
            ? createSignedMediaUrl(VERIFICATION_MEDIA_BUCKET, item.owner_verification_selfie_path)
            : Promise.resolve(null),
        ])

        return {
          ...item,
          owner_verification_document_front_url: frontUrl,
          owner_verification_document_back_url: backUrl,
          owner_verification_selfie_url: selfieUrl,
        }
      })
    )

    setOwners(ownersWithPreviewUrls || [])
    setProperties(propertyRows || [])
    setVerifiedOwners(verifiedOwnerRows || [])
    setVerifiedProperties(verifiedPropertyRows || [])
    setPropertyOwnersById(ownersById)
    setOwnerHistoriesByUserId(
      ownerHistoryRows.reduce((accumulator, item) => {
        const key = String(item.user_id)
        if (!accumulator[key]) accumulator[key] = []
        accumulator[key].push(item)
        return accumulator
      }, {})
    )
    setPropertyHistoriesById(
      propertyHistoryRows.reduce((accumulator, item) => {
        const key = String(item.property_id)
        if (!accumulator[key]) accumulator[key] = []
        accumulator[key].push(item)
        return accumulator
      }, {})
    )
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadReviewData()
    }, [loadReviewData])
  )

  useEffect(() => {
    if (!authorized) return undefined

    const ownerChannel = supabase
      .channel('admin-owner-verifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_profiles',
        },
        () => {
          loadReviewData()
        }
      )
      .subscribe()

    const propertyChannel = supabase
      .channel('admin-property-verifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'properties',
        },
        () => {
          loadReviewData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ownerChannel)
      supabase.removeChannel(propertyChannel)
    }
  }, [authorized, loadReviewData])

  const ownerCount = owners.length
  const propertyCount = properties.length
  const verifiedOwnerCount = verifiedOwners.length
  const verifiedPropertyCount = verifiedProperties.length

  const visibleOwners = useMemo(() => owners, [owners])
  const visibleProperties = useMemo(() => properties, [properties])

  function scrollRejectInputIntoView(kind, id) {
    const inputRef =
      kind === 'owner' ? ownerRejectInputRefs.current[id] : propertyRejectInputRefs.current[id]

    const inputHandle = findNodeHandle(inputRef)
    const scrollNode = scrollViewRef.current

    if (!inputHandle || !scrollNode?.scrollResponderScrollNativeHandleToKeyboard) {
      return
    }

    setTimeout(() => {
      scrollNode.scrollResponderScrollNativeHandleToKeyboard(inputHandle, 140, true)
    }, 120)
  }

  async function reviewOwner(item, nextStatus) {
    const key = `owner-${item.user_id}-${nextStatus}`
    setBusyKey(key)

    const rejectionReason =
      nextStatus === 'rejected'
        ? (ownerRejectReasons[item.user_id] || '').trim()
        : null

    if (nextStatus === 'rejected' && !rejectionReason) {
      setBusyKey('')
      Alert.alert('Rejection note needed', 'Add a short reason before rejecting this verification.')
      return
    }

    const payload = {
      owner_verification_status: nextStatus,
      owner_verification_reviewed_at: new Date().toISOString(),
      owner_verification_rejection_reason: rejectionReason,
      is_verified: nextStatus === 'verified',
      updated_at: new Date().toISOString(),
    }

    const { data: updatedOwner, error } = await supabase
      .from('user_profiles')
      .update(payload)
      .eq('user_id', item.user_id)
      .select('user_id, owner_verification_status')
      .maybeSingle()

    setBusyKey('')

    if (error) {
      Alert.alert('Review failed', error.message)
      return
    }

    if (!updatedOwner || updatedOwner.owner_verification_status !== nextStatus) {
      Alert.alert(
        'Review did not save',
        'Run the updated supabase-verification-features.sql so your admin account can review verification requests.'
      )
      return
    }

    const {
      data: { user: adminUser },
    } = await supabase.auth.getUser()

    await supabase.from('owner_verification_history').insert({
      user_id: String(item.user_id),
      action_type: nextStatus,
      phone: item.owner_verification_phone || item.phone || null,
      id_type: item.owner_verification_id_type || null,
      id_last4: item.owner_verification_id_last4 || null,
      note: item.owner_verification_note || null,
      rejection_reason: rejectionReason,
      reviewed_by_user_id: adminUser?.id ? String(adminUser.id) : null,
      reviewed_by_email: adminUser?.email || null,
    })

    if (nextStatus === 'rejected') {
      await createNotification({
        recipientId: item.user_id,
        actorId: adminUser?.id,
        type: 'owner_verification_rejected',
        title: 'Owner verification rejected',
        body: rejectionReason,
        eventKey: `owner_verification_rejected:${item.user_id}:${item.owner_verification_requested_at || Date.now()}`,
        pushData: {
          screen: 'VerificationCenter',
        },
      })
    } else if (nextStatus === 'verified') {
      await createNotification({
        recipientId: item.user_id,
        actorId: adminUser?.id,
        type: 'owner_verification_approved',
        title: 'Owner verification approved',
        body: 'Your owner profile is now verified.',
        eventKey: `owner_verification_approved:${item.user_id}:${item.owner_verification_requested_at || Date.now()}`,
        pushData: {
          screen: 'VerificationCenter',
        },
      })
    }

    setOwners((current) => current.filter((row) => row.user_id !== item.user_id))
    setOwnerRejectReasons((current) => {
      const next = { ...current }
      delete next[item.user_id]
      return next
    })
    loadReviewData()
  }

  async function reviewProperty(item, nextStatus) {
    const key = `property-${item.id}-${nextStatus}`
    setBusyKey(key)

    const rejectionReason =
      nextStatus === 'rejected'
        ? (propertyRejectReasons[item.id] || '').trim()
        : null

    if (nextStatus === 'rejected' && !rejectionReason) {
      setBusyKey('')
      Alert.alert('Rejection note needed', 'Add a short reason before rejecting this property verification.')
      return
    }

    const payload = {
      verification_status: nextStatus,
      verification_reviewed_at: new Date().toISOString(),
      verification_rejection_reason: rejectionReason,
    }

    const { data: updatedProperty, error } = await supabase
      .from('properties')
      .update(payload)
      .eq('id', item.id)
      .select('id, verification_status')
      .maybeSingle()

    setBusyKey('')

    if (error) {
      Alert.alert('Review failed', error.message)
      return
    }

    if (!updatedProperty || updatedProperty.verification_status !== nextStatus) {
      Alert.alert(
        'Review did not save',
        'Run the updated supabase-verification-features.sql so your admin account can review property verification requests.'
      )
      return
    }

    const {
      data: { user: adminUser },
    } = await supabase.auth.getUser()

    await supabase.from('property_verification_history').insert({
      property_id: String(item.id),
      owner_id: String(item.owner_id),
      action_type: nextStatus,
      title: item.title || null,
      location: item.location || null,
      price: item.price ? String(item.price) : null,
      rejection_reason: rejectionReason,
      reviewed_by_user_id: adminUser?.id ? String(adminUser.id) : null,
      reviewed_by_email: adminUser?.email || null,
    })

    if (nextStatus === 'rejected') {
      await createNotification({
        recipientId: item.owner_id,
        actorId: adminUser?.id,
        type: 'property_verification_rejected',
        propertyId: item.id,
        title: 'Property verification rejected',
        body: rejectionReason,
        eventKey: `property_verification_rejected:${item.id}:${item.verification_requested_at || Date.now()}`,
        pushData: {
          propertyId: String(item.id),
        },
      })
    } else if (nextStatus === 'verified') {
      await createNotification({
        recipientId: item.owner_id,
        actorId: adminUser?.id,
        type: 'property_verification_approved',
        propertyId: item.id,
        title: 'Property verification approved',
        body: 'Your property now has a verified badge.',
        eventKey: `property_verification_approved:${item.id}:${item.verification_requested_at || Date.now()}`,
        pushData: {
          propertyId: String(item.id),
        },
      })
    }

    setProperties((current) => current.filter((row) => row.id !== item.id))
    setPropertyRejectReasons((current) => {
      const next = { ...current }
      delete next[item.id]
      return next
    })
    loadReviewData()
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#f7f7f7' }}>
        <ActivityIndicator />
      </View>
    )
  }

  if (!authorized) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }}>
        <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
          <SectionCard>
            <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '900' }}>
              Admin only
            </Text>
            <Text style={{ color: '#64748b', marginTop: 8, lineHeight: 20 }}>
              This panel is only available for your first-level admin account.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{
                marginTop: 16,
                borderRadius: 14,
                backgroundColor: '#1877F2',
                paddingVertical: 13,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '900' }}>Go back</Text>
            </TouchableOpacity>
          </SectionCard>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
      <ScrollView
        ref={(ref) => {
          scrollViewRef.current = ref
        }}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 38 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ marginBottom: 14 }}>
          <Text style={{ color: '#64748b', lineHeight: 20 }}>
            Review verification requests from one place and keep trust badges clean.
          </Text>

          <View style={{ flexDirection: 'row', marginTop: 14 }}>
            <FilterPill
              title="Owner review"
              count={ownerCount}
              active={activeTab === 'owners'}
              onPress={() => setActiveTab('owners')}
            />
            <FilterPill
              title="Property review"
              count={propertyCount}
              active={activeTab === 'properties'}
              onPress={() => setActiveTab('properties')}
            />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
          <SummaryTile
            title="Verified owners"
            count={verifiedOwnerCount}
            icon="shield-checkmark"
            tint="#2563eb"
          />
          <SummaryTile
            title="Verified properties"
            count={verifiedPropertyCount}
            icon="home"
            tint="#16a34a"
          />
        </View>

        <CollapsibleSection
          title="Verified users"
          subtitle="Owners who currently have an approved blue badge."
          count={verifiedOwnerCount}
          expanded={verifiedOwnersExpanded}
          onToggle={() => setVerifiedOwnersExpanded((current) => !current)}
        >
          {verifiedOwners.length ? (
            verifiedOwners.map((item) => (
              <View
                key={item.user_id}
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  backgroundColor: '#f8fafc',
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 15 }}>
                      {item.display_name || item.email || 'Property owner'}
                    </Text>
                    <Text style={{ color: '#64748b', marginTop: 4 }}>
                      {item.email || 'No email'}
                    </Text>
                  </View>
                  <StatusChip meta={getVerificationMeta('verified', { verifiedLabel: 'Verified owner' })} />
                </View>
                <InfoLine label="Location" value={item.location} />
                <InfoLine label="Approved" value={formatDate(item.owner_verification_reviewed_at)} />
              </View>
            ))
          ) : (
            <Text style={{ color: '#64748b' }}>No verified accounts yet.</Text>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Verified properties"
          subtitle="Listings that already carry the verified trust badge."
          count={verifiedPropertyCount}
          expanded={verifiedPropertiesExpanded}
          onToggle={() => setVerifiedPropertiesExpanded((current) => !current)}
        >
          {verifiedProperties.length ? (
            verifiedProperties.map((item) => {
              const ownerProfile = propertyOwnersById[item.owner_id] || null

              return (
                <View
                  key={item.id}
                  style={{
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    backgroundColor: '#f8fafc',
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 15 }}>
                        {item.title || 'Untitled property'}
                      </Text>
                      <Text style={{ color: '#64748b', marginTop: 4 }}>
                        {ownerProfile?.display_name || ownerProfile?.email || 'Unknown owner'}
                      </Text>
                    </View>
                    <StatusChip meta={getVerificationMeta('verified', { verifiedLabel: 'Verified property' })} />
                  </View>
                  <InfoLine label="Location" value={item.location} />
                  <InfoLine label="Rent" value={item.price ? `৳ ${item.price}` : ''} />
                  <InfoLine label="Approved" value={formatDate(item.verification_reviewed_at)} />
                </View>
              )
            })
          ) : (
            <Text style={{ color: '#64748b' }}>No verified properties yet.</Text>
          )}
        </CollapsibleSection>

        {activeTab === 'owners' ? (
          visibleOwners.length ? (
            visibleOwners.map((item) => {
              const statusMeta = getVerificationMeta(item.owner_verification_status, {
                verifiedLabel: 'Verified account',
                pendingLabel: 'Pending review',
                rejectedLabel: 'Rejected',
                defaultLabel: 'Not verified',
              })

              return (
                <SectionCard key={item.user_id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 16 }}>
                        {item.display_name || item.email || 'Rental X user'}
                      </Text>
                      <Text style={{ color: '#64748b', marginTop: 4 }}>
                        {item.email || 'No email'}
                      </Text>
                    </View>

                    <StatusChip meta={statusMeta} />
                  </View>

                  <InfoLine label="Requested" value={formatDate(item.owner_verification_requested_at)} />
                  <InfoLine label="Phone" value={item.owner_verification_phone || item.phone} />
                  <InfoLine label="Location" value={item.location} />
                  <InfoLine
                    label="ID"
                    value={
                      item.owner_verification_id_type && item.owner_verification_id_last4
                        ? `${item.owner_verification_id_type} •••• ${item.owner_verification_id_last4}`
                        : ''
                    }
                  />
                  <InfoLine label="Note" value={item.owner_verification_note} />
                  <DocumentPreviewStrip
                    frontUrl={item.owner_verification_document_front_url}
                    backUrl={item.owner_verification_document_back_url}
                    selfieUrl={item.owner_verification_selfie_url}
                    onOpen={setPreviewAsset}
                  />

                  <TouchableOpacity
                    onPress={() =>
                      setExpandedOwnerHistory((current) => ({
                        ...current,
                        [item.user_id]: !current[item.user_id],
                      }))
                    }
                    activeOpacity={0.84}
                    style={{
                      marginTop: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      backgroundColor: '#f8fafc',
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                    }}
                  >
                    <Text style={{ color: '#0f172a', fontWeight: '900' }}>
                      Verification history
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '800', marginRight: 8 }}>
                        {(ownerHistoriesByUserId[String(item.user_id)] || []).length}
                      </Text>
                      <Ionicons
                        name={expandedOwnerHistory[item.user_id] ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="#475569"
                      />
                    </View>
                  </TouchableOpacity>

                  {expandedOwnerHistory[item.user_id] ? (
                    <View style={{ marginTop: 12 }}>
                      {(ownerHistoriesByUserId[String(item.user_id)] || []).length ? (
                        ownerHistoriesByUserId[String(item.user_id)].map((entry) => (
                          <HistoryEntryRow
                            key={`owner-history-${entry.id}`}
                            entry={entry}
                            kind="owner"
                          />
                        ))
                      ) : (
                        <Text style={{ color: '#64748b' }}>No history recorded yet.</Text>
                      )}
                    </View>
                  ) : null}

                  <TextInput
                    ref={(ref) => {
                      ownerRejectInputRefs[item.user_id] = ref
                      ownerRejectInputRefs.current[item.user_id] = ref
                    }}
                    value={ownerRejectReasons[item.user_id] || ''}
                    onChangeText={(value) =>
                      setOwnerRejectReasons((current) => ({
                        ...current,
                        [item.user_id]: value,
                      }))
                    }
                    onFocus={() => scrollRejectInputIntoView('owner', item.user_id)}
                    placeholder="Reject note for the user"
                    placeholderTextColor="#94a3b8"
                    multiline
                    style={{
                      marginTop: 14,
                      backgroundColor: '#f8fafc',
                      borderRadius: 14,
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      paddingHorizontal: 12,
                      paddingVertical: 12,
                      minHeight: 78,
                      textAlignVertical: 'top',
                      color: '#0f172a',
                    }}
                  />

                  <ReviewButtons
                    approving={busyKey === `owner-${item.user_id}-verified`}
                    rejecting={busyKey === `owner-${item.user_id}-rejected`}
                    onApprove={() => reviewOwner(item, 'verified')}
                    onReject={() => reviewOwner(item, 'rejected')}
                  />
                </SectionCard>
              )
            })
          ) : (
            <SectionCard>
              <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 16 }}>
                No pending owner requests
              </Text>
              <Text style={{ color: '#64748b', marginTop: 6 }}>
                You’re clear for now.
              </Text>
            </SectionCard>
          )
        ) : visibleProperties.length ? (
          visibleProperties.map((item) => {
            const ownerProfile = propertyOwnersById[item.owner_id] || null
            const statusMeta = getVerificationMeta(getPropertyVerificationStatus(item), {
              verifiedLabel: 'Verified property',
              pendingLabel: 'Pending review',
              rejectedLabel: 'Rejected',
              defaultLabel: 'Not verified',
            })

            return (
              <SectionCard key={item.id}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 16 }}>
                      {item.title || 'Untitled property'}
                    </Text>
                    <Text style={{ color: '#64748b', marginTop: 4 }}>
                      {ownerProfile?.display_name || ownerProfile?.email || 'Unknown owner'}
                    </Text>
                  </View>

                  <StatusChip meta={statusMeta} />
                </View>

                <InfoLine label="Requested" value={formatDate(item.verification_requested_at)} />
                <InfoLine label="Location" value={item.location} />
                <InfoLine label="Rent" value={item.price ? `৳ ${item.price}` : ''} />
                <InfoLine label="Contact" value={item.verification_contact_phone || ownerProfile?.phone} />
                <InfoLine label="Owner email" value={ownerProfile?.email} />

                <TouchableOpacity
                  onPress={() =>
                    setExpandedPropertyHistory((current) => ({
                      ...current,
                      [item.id]: !current[item.id],
                    }))
                  }
                  activeOpacity={0.84}
                  style={{
                    marginTop: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    backgroundColor: '#f8fafc',
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ color: '#0f172a', fontWeight: '900' }}>
                    Verification history
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '800', marginRight: 8 }}>
                      {(propertyHistoriesById[String(item.id)] || []).length}
                    </Text>
                    <Ionicons
                      name={expandedPropertyHistory[item.id] ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#475569"
                    />
                  </View>
                </TouchableOpacity>

                {expandedPropertyHistory[item.id] ? (
                  <View style={{ marginTop: 12 }}>
                    {(propertyHistoriesById[String(item.id)] || []).length ? (
                      propertyHistoriesById[String(item.id)].map((entry) => (
                        <HistoryEntryRow
                          key={`property-history-${entry.id}`}
                          entry={entry}
                          kind="property"
                        />
                      ))
                    ) : (
                      <Text style={{ color: '#64748b' }}>No history recorded yet.</Text>
                    )}
                  </View>
                ) : null}

                  <TextInput
                    ref={(ref) => {
                      propertyRejectInputRefs[item.id] = ref
                      propertyRejectInputRefs.current[item.id] = ref
                    }}
                    value={propertyRejectReasons[item.id] || ''}
                    onChangeText={(value) =>
                      setPropertyRejectReasons((current) => ({
                        ...current,
                        [item.id]: value,
                      }))
                    }
                    onFocus={() => scrollRejectInputIntoView('property', item.id)}
                    placeholder="Reject note for this property"
                    placeholderTextColor="#94a3b8"
                    multiline
                  style={{
                    marginTop: 14,
                    backgroundColor: '#f8fafc',
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    minHeight: 78,
                    textAlignVertical: 'top',
                    color: '#0f172a',
                  }}
                />

                <ReviewButtons
                  approving={busyKey === `property-${item.id}-verified`}
                  rejecting={busyKey === `property-${item.id}-rejected`}
                  onApprove={() => reviewProperty(item, 'verified')}
                  onReject={() => reviewProperty(item, 'rejected')}
                />
              </SectionCard>
            )
          })
        ) : (
          <SectionCard>
            <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 16 }}>
              No pending property requests
            </Text>
            <Text style={{ color: '#64748b', marginTop: 6 }}>
              Nothing needs review right now.
            </Text>
          </SectionCard>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={Boolean(previewAsset)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewAsset(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(2, 6, 23, 0.92)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 18,
          }}
        >
          <Pressable
            onPress={() => setPreviewAsset(null)}
            style={{
              position: 'absolute',
              top: 54,
              right: 18,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </Pressable>

          {previewAsset?.uri ? (
            <>
              <Image
                source={{ uri: previewAsset.uri }}
                style={{
                  width: '100%',
                  height: '76%',
                  borderRadius: 20,
                  backgroundColor: '#0f172a',
                }}
                resizeMode="contain"
              />
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16, marginTop: 14 }}>
                {previewAsset.title}
              </Text>
            </>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  )
}
