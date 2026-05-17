import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { getPropertyVerificationStatus, getVerificationMeta } from '../lib/verification'

const ID_TYPES = [
  { id: 'national_id', label: 'National ID' },
  { id: 'passport', label: 'Passport' },
  { id: 'driving_license', label: 'Driving License' },
]

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  maxLength,
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: '#334155', fontSize: 13, fontWeight: '800', marginBottom: 8 }}>
        {label}
      </Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        keyboardType={keyboardType}
        multiline={multiline}
        maxLength={maxLength}
        style={{
          backgroundColor: '#f8fafc',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#e2e8f0',
          paddingHorizontal: 14,
          paddingVertical: 14,
          minHeight: multiline ? 96 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
          color: '#0f172a',
        }}
      />
    </View>
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

function RequirementRow({ icon, title, done, subtitle }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: 10,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: done ? '#ecfdf5' : '#f8fafc',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12,
        }}
      >
        <Ionicons name={done ? 'checkmark' : icon} size={16} color={done ? '#059669' : '#64748b'} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: 14 }}>{title}</Text>
        <Text style={{ color: '#64748b', marginTop: 3, lineHeight: 18 }}>{subtitle}</Text>
      </View>
    </View>
  )
}

function ListingRow({ item, onRequest, busy }) {
  const verificationMeta = getVerificationMeta(getPropertyVerificationStatus(item), {
    verifiedLabel: 'Verified property',
    pendingLabel: 'Verification pending',
    rejectedLabel: 'Update and resend',
    defaultLabel: 'Not verified',
  })

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 14,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 15 }}>
            {item.title || 'Untitled property'}
          </Text>
          <Text style={{ color: '#64748b', marginTop: 4 }}>
            {item.location || 'Location not added'}
          </Text>
        </View>

        <Text style={{ color: '#ea580c', fontWeight: '900', fontSize: 14 }}>
          {item.price ? `৳ ${item.price}` : 'No rent'}
        </Text>
      </View>

      <View style={{ marginTop: 12 }}>
        <StatusChip meta={verificationMeta} />
      </View>

      <TouchableOpacity
        onPress={() => onRequest(item)}
        disabled={busy || getPropertyVerificationStatus(item) === 'verified'}
        style={{
          marginTop: 12,
          borderRadius: 14,
          paddingVertical: 12,
          alignItems: 'center',
          backgroundColor:
            getPropertyVerificationStatus(item) === 'verified'
              ? '#e2e8f0'
              : busy
                ? '#8bbcf7'
                : '#1877F2',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '900' }}>
          {getPropertyVerificationStatus(item) === 'verified'
            ? 'Verified already'
            : getPropertyVerificationStatus(item) === 'pending'
              ? 'Update verification request'
              : 'Request property verification'}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

export default function VerificationCenterScreen() {
  const [loading, setLoading] = useState(true)
  const [savingOwner, setSavingOwner] = useState(false)
  const [busyPropertyId, setBusyPropertyId] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [posts, setPosts] = useState([])
  const [phone, setPhone] = useState('')
  const [idType, setIdType] = useState('national_id')
  const [idLast4, setIdLast4] = useState('')
  const [verificationNote, setVerificationNote] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)

    const {
      data: { user: nextUser },
    } = await supabase.auth.getUser()

    setUser(nextUser || null)

    if (!nextUser?.id) {
      setProfile(null)
      setPosts([])
      setLoading(false)
      return
    }

    const [{ data: nextProfile }, { data: nextPosts }] = await Promise.all([
      supabase
        .from('user_profiles')
        .select(`
          user_id,
          user_type,
          phone,
          is_verified,
          owner_verification_status,
          owner_verification_requested_at,
          owner_verification_note,
          owner_verification_phone,
          owner_verification_id_type,
          owner_verification_id_last4
        `)
        .eq('user_id', nextUser.id)
        .maybeSingle(),
      supabase
        .from('properties')
        .select('id, title, location, price, verification_status, verification_requested_at, status')
        .eq('owner_id', nextUser.id)
        .order('created_at', { ascending: false }),
    ])

    setProfile(nextProfile || null)
    setPosts(nextPosts || [])
    setPhone(nextProfile?.owner_verification_phone || nextProfile?.phone || '')
    setIdType(nextProfile?.owner_verification_id_type || 'national_id')
    setIdLast4(nextProfile?.owner_verification_id_last4 || '')
    setVerificationNote(nextProfile?.owner_verification_note || '')
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, [loadData])
  )

  const isOwner = profile?.user_type === 'property_owner' || user?.user_metadata?.user_type === 'property_owner'
  const ownerStatus = profile?.owner_verification_status || (profile?.is_verified ? 'verified' : 'unverified')
  const ownerStatusMeta = getVerificationMeta(ownerStatus, {
    verifiedLabel: 'Verified owner',
    pendingLabel: 'Owner verification pending',
    rejectedLabel: 'Update and resend',
    defaultLabel: 'Not verified yet',
  })
  const emailConfirmed = Boolean(user?.email_confirmed_at)
  const hasPhone = Boolean(phone.trim())
  const hasId = Boolean(idLast4.trim() && idType)

  async function submitOwnerVerification() {
    if (!user?.id) return
    if (!isOwner) {
      Alert.alert('Owner account needed', 'Switch your account type to Property owner in Settings first.')
      return
    }
    if (!emailConfirmed) {
      Alert.alert('Confirm email first', 'Please confirm your email address before requesting verification.')
      return
    }
    if (!phone.trim()) {
      Alert.alert('Phone needed', 'Add a contact phone number for verification.')
      return
    }
    if (!idLast4.trim() || idLast4.trim().length < 4) {
      Alert.alert('ID details needed', 'Add the last 4 digits of your ID to continue.')
      return
    }

    setSavingOwner(true)

    const payload = {
      user_id: user.id,
      email: user.email,
      phone: phone.trim(),
      owner_verification_status: 'pending',
      owner_verification_requested_at: new Date().toISOString(),
      owner_verification_phone: phone.trim(),
      owner_verification_id_type: idType,
      owner_verification_id_last4: idLast4.trim(),
      owner_verification_note: verificationNote.trim() || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('user_profiles').upsert(payload, { onConflict: 'user_id' })

    setSavingOwner(false)

    if (error) {
      Alert.alert(
        'Verification setup needed',
        'Run supabase-verification-features.sql in Supabase, then try again.'
      )
      return
    }

    Alert.alert('Request sent', 'Your owner verification request is now pending review.')
    loadData()
  }

  async function requestPropertyVerification(post) {
    if (!user?.id || !post?.id) return
    if (!phone.trim()) {
      Alert.alert('Phone needed', 'Add your verification phone first so renters and reviewers have a trusted contact.')
      return
    }

    setBusyPropertyId(post.id)

    const { error } = await supabase
      .from('properties')
      .update({
        verification_status: 'pending',
        verification_requested_at: new Date().toISOString(),
        verification_contact_phone: phone.trim(),
      })
      .eq('id', post.id)
      .eq('owner_id', user.id)

    setBusyPropertyId(null)

    if (error) {
      Alert.alert(
        'Verification setup needed',
        'Run supabase-verification-features.sql in Supabase, then try again.'
      )
      return
    }

    setPosts((currentPosts) =>
      currentPosts.map((item) =>
        item.id === post.id
          ? {
              ...item,
              verification_status: 'pending',
              verification_requested_at: new Date().toISOString(),
            }
          : item
      )
    )
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#f7f7f7' }}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            padding: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#0f172a', fontSize: 22, fontWeight: '900' }}>
            Verification center
          </Text>
          <Text style={{ color: '#64748b', marginTop: 6, lineHeight: 20 }}>
            Help renters trust your profile and your listings before they message you.
          </Text>

          <View style={{ marginTop: 14 }}>
            <StatusChip meta={ownerStatusMeta} />
          </View>
        </View>

        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            padding: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '900' }}>
            Owner verification
          </Text>
          <Text style={{ color: '#64748b', marginTop: 6, lineHeight: 20 }}>
            Email confirmation, a reachable phone number, and ID details make your owner badge easier to approve.
          </Text>

          <View style={{ marginTop: 10 }}>
            <RequirementRow
              icon="mail-outline"
              title="Email confirmed"
              done={emailConfirmed}
              subtitle={emailConfirmed ? 'Good to go.' : 'Confirm your login email first.'}
            />
            <RequirementRow
              icon="call-outline"
              title="Phone on file"
              done={hasPhone}
              subtitle={hasPhone ? 'We can reach you on this number.' : 'Add a contact number for renters and review.'}
            />
            <RequirementRow
              icon="card-outline"
              title="ID details"
              done={hasId}
              subtitle={hasId ? 'Your ID type and last 4 digits are attached.' : 'Add an ID type and last 4 digits.'}
            />
          </View>

          <View style={{ marginTop: 6 }}>
            <Field
              label="Verification phone"
              value={phone}
              onChangeText={setPhone}
              placeholder="01XXXXXXXXX"
              keyboardType="phone-pad"
            />

            <Text style={{ color: '#334155', fontSize: 13, fontWeight: '800', marginBottom: 8 }}>
              ID type
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
              {ID_TYPES.map((item) => {
                const active = idType === item.id

                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => setIdType(item.id)}
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? '#1877F2' : '#e2e8f0',
                      backgroundColor: active ? '#eff6ff' : '#fff',
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                    }}
                  >
                    <Text style={{ color: active ? '#1877F2' : '#475569', fontWeight: '800', fontSize: 12 }}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Field
              label="Last 4 digits of your ID"
              value={idLast4}
              onChangeText={(value) => setIdLast4(value.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="1234"
              keyboardType="number-pad"
              maxLength={4}
            />

            <Field
              label="Note for review (optional)"
              value={verificationNote}
              onChangeText={setVerificationNote}
              placeholder="Anything helpful about your property ownership or contact process"
              multiline
            />

            <TouchableOpacity
              onPress={submitOwnerVerification}
              disabled={savingOwner}
              style={{
                backgroundColor: savingOwner ? '#8bbcf7' : '#1877F2',
                borderRadius: 14,
                paddingVertical: 14,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '900' }}>
                {savingOwner
                  ? 'Sending request...'
                  : ownerStatus === 'pending'
                    ? 'Update verification request'
                    : 'Request owner verification'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            padding: 16,
          }}
        >
          <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '900' }}>
            Property verification
          </Text>
          <Text style={{ color: '#64748b', marginTop: 6, lineHeight: 20, marginBottom: 14 }}>
            Ask for a trust badge on the properties you want to highlight most.
          </Text>

          {!posts.length ? (
            <View
              style={{
                backgroundColor: '#f8fafc',
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                padding: 16,
              }}
            >
              <Text style={{ color: '#475569', lineHeight: 20 }}>
                Publish a property first, then you can request listing verification here.
              </Text>
            </View>
          ) : (
            posts.map((item) => (
              <ListingRow
                key={item.id}
                item={item}
                onRequest={requestPropertyVerification}
                busy={busyPropertyId === item.id}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
