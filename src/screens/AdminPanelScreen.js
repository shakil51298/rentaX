import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
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

function DocumentPreviewStrip({ frontUrl, backUrl, selfieUrl }) {
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
          <View
            key={item.key}
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
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

export default function AdminPanelScreen({ navigation }) {
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [owners, setOwners] = useState([])
  const [properties, setProperties] = useState([])
  const [propertyOwnersById, setPropertyOwnersById] = useState({})
  const [activeTab, setActiveTab] = useState('owners')
  const [busyKey, setBusyKey] = useState('')
  const [ownerRejectReasons, setOwnerRejectReasons] = useState({})
  const [propertyRejectReasons, setPropertyRejectReasons] = useState({})

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
      setPropertyOwnersById({})
      setLoading(false)
      return
    }

    const [{ data: ownerRows }, { data: propertyRows }] = await Promise.all([
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
    ])

    const ownerIds = [...new Set((propertyRows || []).map((item) => item.owner_id).filter(Boolean))]
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
    setPropertyOwnersById(ownersById)
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadReviewData()
    }, [loadReviewData])
  )

  const ownerCount = owners.length
  const propertyCount = properties.length

  const visibleOwners = useMemo(() => owners, [owners])
  const visibleProperties = useMemo(() => properties, [properties])

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

    const { error } = await supabase
      .from('user_profiles')
      .update(payload)
      .eq('user_id', item.user_id)

    setBusyKey('')

    if (error) {
      Alert.alert('Review failed', error.message)
      return
    }

    if (nextStatus === 'rejected') {
      const {
        data: { user: adminUser },
      } = await supabase.auth.getUser()

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
    }

    setOwners((current) => current.filter((row) => row.user_id !== item.user_id))
    setOwnerRejectReasons((current) => {
      const next = { ...current }
      delete next[item.user_id]
      return next
    })
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

    const { error } = await supabase
      .from('properties')
      .update(payload)
      .eq('id', item.id)

    setBusyKey('')

    if (error) {
      Alert.alert('Review failed', error.message)
      return
    }

    if (nextStatus === 'rejected') {
      const {
        data: { user: adminUser },
      } = await supabase.auth.getUser()

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
    }

    setProperties((current) => current.filter((row) => row.id !== item.id))
    setPropertyRejectReasons((current) => {
      const next = { ...current }
      delete next[item.id]
      return next
    })
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
      >
        <SectionCard>
          <Text style={{ color: '#0f172a', fontSize: 22, fontWeight: '900' }}>
            Admin panel
          </Text>
          <Text style={{ color: '#64748b', marginTop: 6, lineHeight: 20 }}>
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
        </SectionCard>

        {activeTab === 'owners' ? (
          visibleOwners.length ? (
            visibleOwners.map((item) => {
              const statusMeta = getVerificationMeta(item.owner_verification_status, {
                verifiedLabel: 'Verified owner',
                pendingLabel: 'Pending review',
                rejectedLabel: 'Rejected',
                defaultLabel: 'Not verified',
              })

              return (
                <SectionCard key={item.user_id}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 16 }}>
                        {item.display_name || item.email || 'Property owner'}
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
                  />
                  <TextInput
                    value={ownerRejectReasons[item.user_id] || ''}
                    onChangeText={(value) =>
                      setOwnerRejectReasons((current) => ({
                        ...current,
                        [item.user_id]: value,
                      }))
                    }
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
                <TextInput
                  value={propertyRejectReasons[item.id] || ''}
                  onChangeText={(value) =>
                    setPropertyRejectReasons((current) => ({
                      ...current,
                      [item.id]: value,
                    }))
                  }
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
    </SafeAreaView>
  )
}
