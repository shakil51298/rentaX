import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
import { getCachedAuthUser } from '../lib/authSession'
import { PROFILE_MEDIA_BUCKET, uploadMediaAsset } from '../lib/media'
import { useAppSettings } from '../lib/appSettings'
import {
  cancelAccountDeletionRequest,
  fetchMyActiveAccountDeletionRequest,
  formatAccountDeletionDate,
  requestAccountDeletion,
} from '../lib/accountDeletion'

const USER_TYPES = [
  { id: 'property_owner', title: 'Property owner' },
  { id: 'renter', title: 'Finding property' },
]

const GENDER_OPTIONS = [
  { id: 'male', title: 'Male' },
  { id: 'female', title: 'Female' },
]

function displayNameFromEmail(email) {
  if (!email) return 'User'

  return email.split('@')[0]
}

function buildDefaultRentalXId(value) {
  const cleanValue = String(value || 'rentalx-user').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  const shortId = cleanValue.slice(-8).padStart(8, '0')

  return `rx${shortId}`
}

function normalizeRentalXId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24)
}

function getRentalXIdWaitMessage(updatedAt) {
  if (!updatedAt) return null

  const lastChangedAt = new Date(updatedAt).getTime()

  if (!Number.isFinite(lastChangedAt)) return null

  const nextChangeAt = lastChangedAt + (30 * 24 * 60 * 60 * 1000)
  const remainingMs = nextChangeAt - Date.now()

  if (remainingMs <= 0) return null

  const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000))

  return `You can change your Rental X ID again in ${remainingDays} day${remainingDays === 1 ? '' : 's'}.`
}

function maskPhoneNumber(value) {
  const text = String(value || '').trim()

  if (!text) return ''
  if (text.length <= 5) return text[0] + '*'.repeat(Math.max(text.length - 1, 0))

  return `${text.slice(0, 3)}${'*'.repeat(Math.max(text.length - 5, 3))}${text.slice(-2)}`
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  secureTextEntry,
  autoCapitalize,
  autoComplete,
  theme,
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: theme.mutedText, fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
        {label}
      </Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        placeholderTextColor={theme.mutedText}
        blurOnSubmit={false}
        autoCorrect={false}
        style={{
          backgroundColor: theme.surfaceMuted,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 14,
          paddingHorizontal: 13,
          paddingVertical: 12,
          minHeight: multiline ? 84 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
          color: theme.text,
          fontSize: 14,
        }}
      />
    </View>
  )
}

function RentalXIdField({ value, onChangeText, locked, helperText, theme }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: theme.mutedText, fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
        ID
      </Text>

      <View
        style={{
          minHeight: 46,
          backgroundColor: theme.surfaceMuted,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 14,
          paddingHorizontal: 13,
          flexDirection: 'row',
          alignItems: 'center',
          opacity: locked ? 0.76 : 1,
        }}
      >
        <Text style={{ color: theme.mutedText, fontSize: 14, fontWeight: '900', marginRight: 4 }}>
          @
        </Text>
        <TextInput
          value={value}
          onChangeText={(nextValue) => onChangeText(normalizeRentalXId(nextValue))}
          editable={!locked}
          placeholder="your_id"
          placeholderTextColor={theme.mutedText}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            flex: 1,
            color: locked ? theme.mutedText : theme.text,
            fontSize: 14,
            fontWeight: '800',
            paddingVertical: 0,
          }}
        />
        {locked ? (
          <Ionicons name="lock-closed-outline" size={16} color={theme.mutedText} />
        ) : null}
      </View>

      <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 5, lineHeight: 16 }}>
        {helperText || 'People can find you with this ID. You can change it once every 30 days.'}
      </Text>
    </View>
  )
}

function PhoneField({ value, onChangeText, showPhone, onToggleShow, theme }) {
  const hiddenValue = maskPhoneNumber(value)

  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: theme.mutedText, fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
        Phone
      </Text>

      <View
        style={{
          minHeight: 46,
          backgroundColor: theme.surfaceMuted,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 14,
          paddingHorizontal: 13,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        {showPhone || !value ? (
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder="Contact phone"
            placeholderTextColor={theme.mutedText}
            keyboardType="phone-pad"
            autoCorrect={false}
            style={{
              flex: 1,
              color: theme.text,
              fontSize: 14,
              paddingVertical: 0,
            }}
          />
        ) : (
          <TouchableOpacity
            onPress={() => onToggleShow(true)}
            activeOpacity={0.86}
            style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}
          >
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>
              {hiddenValue}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => onToggleShow(!showPhone)}
          activeOpacity={0.86}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 8,
          }}
        >
          <Ionicons name={showPhone ? 'eye-off-outline' : 'eye-outline'} size={18} color={theme.mutedText} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

function SelectField({ label, value, placeholder, onPress, icon = 'chevron-down', theme }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: theme.mutedText, fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
        {label}
      </Text>

      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.86}
        style={{
          minHeight: 46,
          backgroundColor: theme.surfaceMuted,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 14,
          paddingHorizontal: 13,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text style={{ color: value ? theme.text : theme.mutedText, fontSize: 14, fontWeight: '700' }}>
          {value || placeholder}
        </Text>
        <Ionicons name={icon} size={18} color={theme.mutedText} />
      </TouchableOpacity>
    </View>
  )
}

function SectionCard({ children, theme }) {
  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      {children}
    </View>
  )
}

function PhotoPickerCard({
  title,
  icon,
  imageUri,
  onPick,
  theme,
  variant = 'avatar',
}) {
  const isCover = variant === 'cover'
  const thumbnailStyle = {
    width: isCover ? 104 : 64,
    height: isCover ? 58 : 64,
    borderRadius: isCover ? 14 : 32,
  }

  return (
    <View
      style={{
        flex: 1,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.surfaceMuted,
        paddingHorizontal: 10,
        paddingVertical: 10,
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          color: theme.text,
          fontWeight: '900',
          fontSize: 12,
          marginBottom: 8,
        }}
        numberOfLines={1}
      >
        {title}
      </Text>

      <TouchableOpacity
        onPress={onPick}
        activeOpacity={0.86}
        style={{
          ...thumbnailStyle,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.hero,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: theme.hero,
            }}
            resizeMode="cover"
          />
        ) : (
          <Ionicons name={icon} size={isCover ? 22 : 24} color={theme.mutedText} />
        )}

        <View
          style={{
            position: 'absolute',
            right: 4,
            bottom: 4,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: theme.accent,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: theme.surface,
          }}
        >
          <Ionicons name="camera" size={12} color="#fff" />
        </View>
      </TouchableOpacity>

      <Text style={{ color: theme.mutedText, fontSize: 10, fontWeight: '700', marginTop: 7 }}>
        Tap to change
      </Text>
    </View>
  )
}

export default function SettingsScreen({ navigation, route }) {
  const { theme } = useAppSettings()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [gender, setGender] = useState('')
  const [genderModalVisible, setGenderModalVisible] = useState(false)
  const [rentalXId, setRentalXId] = useState('')
  const [originalRentalXId, setOriginalRentalXId] = useState('')
  const [rentalXIdUpdatedAt, setRentalXIdUpdatedAt] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [pendingAvatarAsset, setPendingAvatarAsset] = useState(null)
  const [pendingCoverAsset, setPendingCoverAsset] = useState(null)
  const [bio, setBio] = useState('')
  const [phone, setPhone] = useState('')
  const [showPhone, setShowPhone] = useState(false)
  const [location, setLocation] = useState('')
  const [selectedRegionMeta, setSelectedRegionMeta] = useState(null)
  const [userType, setUserType] = useState('renter')
  const [isVerified, setIsVerified] = useState(false)
  const [ownerVerificationStatus, setOwnerVerificationStatus] = useState('unverified')
  const [accountDeletionRequest, setAccountDeletionRequest] = useState(null)
  const [deletionSaving, setDeletionSaving] = useState(false)

  useEffect(() => {
    loadUser()
  }, [])

  useEffect(() => {
    const selectedLocation = route?.params?.selectedLocation

    if (!selectedLocation) return

    setLocation(selectedLocation.areaLabel || selectedLocation.label || '')
    setSelectedRegionMeta(selectedLocation)
  }, [route?.params?.selectedLocationRequestId, route?.params?.selectedLocation])

  const profilePreviewUri = pendingAvatarAsset?.uri || avatarUrl || ''
  const coverPreviewUri = pendingCoverAsset?.uri || coverUrl || ''
  const rentalXIdLockMessage = getRentalXIdWaitMessage(rentalXIdUpdatedAt)
  const rentalXIdLocked = Boolean(originalRentalXId && rentalXIdLockMessage)

  async function loadUser() {
    setLoading(true)
    const routeSelectedLocation = route?.params?.selectedLocation

    const user = await getCachedAuthUser()

    setUser(user)

    const metadata = user?.user_metadata || {}
    const fallbackRentalXId = normalizeRentalXId(metadata.rentalx_id) || buildDefaultRentalXId(user?.id || user?.email)

    setDisplayName(metadata.name || metadata.full_name || displayNameFromEmail(user?.email))
    setGender(metadata.gender || '')
    setRentalXId(fallbackRentalXId)
    setOriginalRentalXId(fallbackRentalXId)
    setRentalXIdUpdatedAt(metadata.rentalx_id_updated_at || null)
    setAvatarUrl(metadata.avatar_url || metadata.picture || '')
    setCoverUrl(metadata.cover_url || '')
    setPendingAvatarAsset(null)
    setPendingCoverAsset(null)
    setSelectedRegionMeta(routeSelectedLocation || null)
    setUserType(metadata.user_type || 'renter')

    if (user?.id) {
      const [{ data }, activeDeletionRequest] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle(),
        fetchMyActiveAccountDeletionRequest(user.id).catch(() => null),
      ])

      setAccountDeletionRequest(activeDeletionRequest)

      if (data) {
        const nextRentalXId = normalizeRentalXId(data.rentalx_id) || fallbackRentalXId

        setDisplayName(data.display_name || metadata.name || displayNameFromEmail(user.email))
        setGender(data.gender || metadata.gender || '')
        setRentalXId(nextRentalXId)
        setOriginalRentalXId(nextRentalXId)
        setRentalXIdUpdatedAt(data.rentalx_id_updated_at || metadata.rentalx_id_updated_at || null)
        setAvatarUrl(data.avatar_url || metadata.avatar_url || '')
        setCoverUrl(data.cover_url || metadata.cover_url || '')
        setPendingAvatarAsset(null)
        setPendingCoverAsset(null)
        setBio(data.bio || '')
        setPhone(data.phone || '')
        setLocation(routeSelectedLocation?.areaLabel || routeSelectedLocation?.label || data.location || '')
        setSelectedRegionMeta(
          routeSelectedLocation ||
          (data.location
            ? {
                label: data.location,
                areaLabel: data.location,
                fullLabel: data.location,
              }
            : null)
        )
        setUserType(data.user_type || metadata.user_type || 'renter')
        setIsVerified(Boolean(data.is_verified))
        setOwnerVerificationStatus(data.owner_verification_status || (data.is_verified ? 'verified' : 'unverified'))
      } else {
        setOwnerVerificationStatus('unverified')
      }
    } else {
      setAccountDeletionRequest(null)
    }

    setLoading(false)
  }

  async function saveProfile() {
    if (!user) return
    if (!displayName.trim()) {
      Alert.alert('Missing name', 'Please add your display name.')
      return
    }

    const normalizedRentalXId = normalizeRentalXId(rentalXId)

    if (normalizedRentalXId.length < 4) {
      Alert.alert('ID too short', 'Your Rental X ID should be at least 4 characters.')
      return
    }

    const rentalXIdChanged = normalizedRentalXId !== originalRentalXId
    const waitMessage = rentalXIdChanged ? getRentalXIdWaitMessage(rentalXIdUpdatedAt) : null

    if (waitMessage) {
      Alert.alert('ID change locked', waitMessage)
      return
    }

    setSaving(true)

    const selectedType = USER_TYPES.find((item) => item.id === userType)
    const selectedGender = GENDER_OPTIONS.find((item) => item.id === gender)
    let nextAvatarUrl = avatarUrl.trim() || null
    let nextCoverUrl = coverUrl.trim() || null
    const nextRentalXIdUpdatedAt = rentalXIdChanged
      ? new Date().toISOString()
      : rentalXIdUpdatedAt

    try {
      const { data: existingIdUsers, error: idLookupError } = await supabase
        .from('user_profiles')
        .select('user_id')
        .eq('rentalx_id', normalizedRentalXId)
        .neq('user_id', user.id)
        .limit(1)

      if (idLookupError) {
        setSaving(false)
        Alert.alert(
          'Database update needed',
          'Run supabase-owner-profile-features.sql in Supabase, then try saving your Rental X ID again.'
        )
        return
      }

      if (existingIdUsers?.length) {
        setSaving(false)
        Alert.alert('ID already taken', 'Please choose another Rental X ID.')
        return
      }

      if (pendingAvatarAsset?.uri) {
        const uploadResult = await uploadMediaAsset({
          uri: pendingAvatarAsset.uri,
          type: 'image',
          mimeType: pendingAvatarAsset.mimeType,
          userId: user.id,
          bucket: PROFILE_MEDIA_BUCKET,
        })
        nextAvatarUrl = uploadResult.mediaUrl
      }

      if (pendingCoverAsset?.uri) {
        const uploadResult = await uploadMediaAsset({
          uri: pendingCoverAsset.uri,
          type: 'image',
          mimeType: pendingCoverAsset.mimeType,
          userId: user.id,
          bucket: PROFILE_MEDIA_BUCKET,
        })
        nextCoverUrl = uploadResult.mediaUrl
      }
    } catch (error) {
      setSaving(false)
      Alert.alert(
        'Upload failed',
        error?.message || 'Profile media could not be uploaded. Please try again, and rerun supabase-profile-media-features.sql if this keeps happening.'
      )
      return
    }

    const { error: authError } = await supabase.auth.updateUser({
      data: {
        name: displayName.trim(),
        full_name: displayName.trim(),
        avatar_url: nextAvatarUrl,
        cover_url: nextCoverUrl,
        gender,
        gender_label: selectedGender?.title,
        rentalx_id: normalizedRentalXId,
        rentalx_id_updated_at: nextRentalXIdUpdatedAt,
        user_type: userType,
        user_type_label: selectedType?.title,
      },
    })

    if (authError) {
      setSaving(false)
      Alert.alert('Profile update failed', authError.message)
      return
    }

    const profilePayload = {
      user_id: user.id,
      email: user.email,
      display_name: displayName.trim(),
      gender: gender || null,
      rentalx_id: normalizedRentalXId,
      rentalx_id_updated_at: nextRentalXIdUpdatedAt,
      avatar_url: nextAvatarUrl,
      cover_url: nextCoverUrl,
      bio: bio.trim() || null,
      phone: phone.trim() || null,
      location: location.trim() || null,
      user_type: userType,
      updated_at: new Date().toISOString(),
    }

    let { error } = await supabase.from('user_profiles').upsert(profilePayload, { onConflict: 'user_id' })

    if (error && /gender|rentalx_id/i.test(String(error.message || ''))) {
      const {
        gender: _gender,
        rentalx_id: _rentalXId,
        rentalx_id_updated_at: _rentalXIdUpdatedAt,
        ...profilePayloadWithoutNewFields
      } = profilePayload
      const retryResult = await supabase
        .from('user_profiles')
        .upsert(profilePayloadWithoutNewFields, { onConflict: 'user_id' })
      error = retryResult.error
    }

    setSaving(false)

    if (error) {
      Alert.alert(
        'Database update needed',
        'Run supabase-owner-profile-features.sql in Supabase, then try saving again.'
      )
      return
    }

    setAvatarUrl(nextAvatarUrl || '')
    setCoverUrl(nextCoverUrl || '')
    setRentalXId(normalizedRentalXId)
    setOriginalRentalXId(normalizedRentalXId)
    setRentalXIdUpdatedAt(nextRentalXIdUpdatedAt)
    setPendingAvatarAsset(null)
    setPendingCoverAsset(null)
    Alert.alert('Saved', 'Your profile was updated.')
    loadUser()
  }

  async function pickImage(kind) {
    const aspect = kind === 'avatar' ? [1, 1] : [16, 9]
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect,
      quality: 0.92,
    })

    if (result.canceled || !result.assets?.length) return

    const asset = result.assets[0]

    if (kind === 'avatar') {
      setPendingAvatarAsset(asset)
    } else {
      setPendingCoverAsset(asset)
    }
  }

  async function applyForAccountDeletion() {
    if (!user?.id || deletionSaving) return

    Alert.alert(
      'Apply for account deletion?',
      'Admin can approve this earlier. If it is not reviewed, your account will be scheduled for automatic deletion after 14 days.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Apply',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletionSaving(true)
              const request = await requestAccountDeletion()
              setAccountDeletionRequest(request)
              Alert.alert(
                'Request sent',
                `Your account deletion is scheduled for ${formatAccountDeletionDate(request.scheduled_deletion_at)} unless admin reviews it earlier.`
              )
            } catch (error) {
              Alert.alert(
                'Request failed',
                error?.message || 'Run supabase-account-deletion-features.sql, then try again.'
              )
            } finally {
              setDeletionSaving(false)
            }
          },
        },
      ]
    )
  }

  async function cancelDeletionRequest() {
    if (!accountDeletionRequest?.id || deletionSaving) return

    Alert.alert('Cancel deletion request?', 'Your account will stay active.', [
      { text: 'Keep request', style: 'cancel' },
      {
        text: 'Cancel request',
        onPress: async () => {
          try {
            setDeletionSaving(true)
            await cancelAccountDeletionRequest(accountDeletionRequest.id)
            setAccountDeletionRequest(null)
            Alert.alert('Cancelled', 'Your account deletion request was cancelled.')
          } catch (error) {
            Alert.alert('Cancel failed', error?.message || 'Could not cancel this request.')
          } finally {
            setDeletionSaving(false)
          }
        },
      },
    ])
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.background }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 30 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          automaticallyAdjustKeyboardInsets
        >
          <View style={{ paddingHorizontal: 14, paddingTop: 0, paddingBottom: 14, gap: 14 }}>
            <View
              style={{
                backgroundColor: theme.surface,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: theme.border,
                padding: 10,
                overflow: 'hidden',
              }}
            >
              <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '800', marginBottom: 8 }}>
                Preview
              </Text>

              <View
                style={{
                  borderRadius: 16,
                  overflow: 'hidden',
                  backgroundColor: theme.hero,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <View style={{ height: 116, backgroundColor: theme.hero }}>
                  {coverPreviewUri ? (
                    <Image
                      source={{ uri: coverPreviewUri }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: theme.hero,
                      }}
                    >
                      <Ionicons name="image-outline" size={28} color={theme.mutedText} />
                      <Text style={{ color: theme.mutedText, fontSize: 12, fontWeight: '700', marginTop: 6 }}>
                        Cover preview
                      </Text>
                    </View>
                  )}
                </View>

                <View style={{ paddingHorizontal: 12, paddingBottom: 12, paddingTop: 0 }}>
                  <View style={{ marginTop: -20, flexDirection: 'row', alignItems: 'flex-end' }}>
                    {profilePreviewUri ? (
                      <Image
                        source={{ uri: profilePreviewUri }}
                        style={{
                          width: 68,
                          height: 68,
                          borderRadius: 34,
                          backgroundColor: theme.surfaceMuted,
                          borderWidth: 3,
                          borderColor: theme.surface,
                        }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 68,
                          height: 68,
                          borderRadius: 34,
                          backgroundColor: theme.hero,
                          borderWidth: 3,
                          borderColor: theme.surface,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 24, fontWeight: '900', color: theme.heroText }}>
                          {displayName ? displayName.charAt(0).toUpperCase() : 'U'}
                        </Text>
                      </View>
                    )}

                    <View style={{ flex: 1, minWidth: 0, marginLeft: 10, paddingBottom: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                        <Text
                          style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: '900', color: theme.text }}
                          numberOfLines={2}
                        >
                          {displayName || 'User'}
                        </Text>

                        {ownerVerificationStatus === 'verified' || isVerified ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={17}
                            color={theme.accent}
                            style={{ marginLeft: 6, flexShrink: 0 }}
                          />
                        ) : null}
                      </View>

                      <Text
                        style={{ marginTop: 3, color: theme.mutedText, fontSize: 12 }}
                        numberOfLines={1}
                      >
                        {user?.email || ''}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <SectionCard theme={theme}>
              <Field
                label="Display name"
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your public name"
                theme={theme}
              />

              <SelectField
                label="Gender"
                value={GENDER_OPTIONS.find((item) => item.id === gender)?.title || ''}
                placeholder="Select gender"
                onPress={() => setGenderModalVisible(true)}
                theme={theme}
              />

              <RentalXIdField
                value={rentalXId}
                onChangeText={setRentalXId}
                locked={rentalXIdLocked}
                helperText={rentalXIdLockMessage}
                theme={theme}
              />

              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                <PhotoPickerCard
                  title="Profile photo"
                  icon="person-circle-outline"
                  imageUri={profilePreviewUri}
                  onPick={() => pickImage('avatar')}
                  theme={theme}
                />

                <PhotoPickerCard
                  title="Cover photo"
                  icon="image-outline"
                  imageUri={coverPreviewUri}
                  onPick={() => pickImage('cover')}
                  theme={theme}
                  variant="cover"
                />
              </View>

              <Field
                label="Owner details / Bio"
                value={bio}
                onChangeText={setBio}
                placeholder="Tell renters about you or your properties"
                multiline
                theme={theme}
              />

              <PhoneField
                value={phone}
                onChangeText={setPhone}
                showPhone={showPhone}
                onToggleShow={setShowPhone}
                theme={theme}
              />

              <SelectField
                label="Region"
                value={location}
                placeholder="Select region from map"
                icon="map-outline"
                theme={theme}
                onPress={() =>
                  navigation.navigate('Location', {
                    returnScreen: 'Settings',
                    returnKey: route?.key,
                    initialLabel: selectedRegionMeta?.fullLabel || location,
                    initialLocation: selectedRegionMeta,
                  })
                }
              />

              <Text style={{ color: theme.mutedText, fontWeight: '700', marginBottom: 8 }}>
                Account type
              </Text>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                {USER_TYPES.map((item) => {
                  const isSelected = userType === item.id

                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => setUserType(item.id)}
                      style={{
                        flex: 1,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: isSelected ? theme.accent : theme.border,
                        backgroundColor: isSelected ? theme.accentSoft : theme.surfaceMuted,
                        paddingVertical: 11,
                        paddingHorizontal: 10,
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          color: isSelected ? theme.accent : theme.mutedText,
                          fontWeight: '800',
                          fontSize: 12,
                          textAlign: 'center',
                        }}
                      >
                        {item.title}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              <TouchableOpacity
                onPress={saveProfile}
                disabled={saving}
                style={{
                  backgroundColor: theme.accent,
                  borderRadius: 14,
                  paddingVertical: 13,
                  alignItems: 'center',
                  marginTop: 14,
                  opacity: saving ? 0.68 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>
                  {saving ? 'Saving...' : 'Save profile'}
                </Text>
              </TouchableOpacity>
            </SectionCard>

            <SectionCard theme={theme}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: '#fee2e2',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="trash-outline" size={20} color="#dc2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900' }}>
                    Account deletion
                  </Text>
                  <Text style={{ color: theme.mutedText, fontSize: 12, lineHeight: 18, marginTop: 2 }}>
                    Apply to delete your account. Admin can approve, or it will be due after 14 days.
                  </Text>
                </View>
              </View>

              {accountDeletionRequest ? (
                <View
                  style={{
                    marginTop: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surfaceMuted,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
                    Request pending
                  </Text>
                  <Text style={{ color: theme.mutedText, fontSize: 12, lineHeight: 18, marginTop: 4 }}>
                    Scheduled for {formatAccountDeletionDate(accountDeletionRequest.scheduled_deletion_at)}.
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                onPress={accountDeletionRequest ? cancelDeletionRequest : applyForAccountDeletion}
                disabled={deletionSaving || accountDeletionRequest?.status === 'approved'}
                activeOpacity={0.86}
                style={{
                  marginTop: 12,
                  minHeight: 44,
                  borderRadius: 14,
                  backgroundColor: accountDeletionRequest ? theme.surfaceMuted : '#dc2626',
                  borderWidth: accountDeletionRequest ? 1 : 0,
                  borderColor: theme.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  opacity: deletionSaving || accountDeletionRequest?.status === 'approved' ? 0.62 : 1,
                }}
              >
                <Ionicons
                  name={accountDeletionRequest ? 'refresh-outline' : 'trash-outline'}
                  size={17}
                  color={accountDeletionRequest ? theme.text : '#fff'}
                />
                <Text
                  style={{
                    color: accountDeletionRequest ? theme.text : '#fff',
                    fontSize: 13,
                    fontWeight: '900',
                    marginLeft: 8,
                  }}
                >
                  {deletionSaving
                    ? 'Working...'
                    : accountDeletionRequest
                      ? 'Cancel deletion request'
                      : 'Apply for account deletion'}
                </Text>
              </TouchableOpacity>
            </SectionCard>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={genderModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGenderModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.42)',
            justifyContent: 'flex-end',
          }}
        >
          <Pressable
            onPress={() => setGenderModalVisible(false)}
            style={{ position: 'absolute', inset: 0 }}
          />

          <View
            style={{
              backgroundColor: theme.surface,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              borderWidth: 1,
              borderColor: theme.border,
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 24,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: '900' }}>
                Select gender
              </Text>
              <TouchableOpacity
                onPress={() => setGenderModalVisible(false)}
                activeOpacity={0.86}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: theme.surfaceMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={19} color={theme.mutedText} />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 10 }}>
              {GENDER_OPTIONS.map((option) => {
                const isSelected = gender === option.id

                return (
                  <TouchableOpacity
                    key={option.id}
                    onPress={() => setGender(option.id)}
                    activeOpacity={0.86}
                    style={{
                      minHeight: 48,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: isSelected ? theme.accent : theme.border,
                      backgroundColor: isSelected ? theme.accentSoft : theme.surfaceMuted,
                      paddingHorizontal: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text
                      style={{
                        color: isSelected ? theme.accent : theme.text,
                        fontSize: 14,
                        fontWeight: '900',
                      }}
                    >
                      {option.title}
                    </Text>
                    {isSelected ? (
                      <Ionicons name="checkmark-circle" size={20} color={theme.accent} />
                    ) : null}
                  </TouchableOpacity>
                )
              })}
            </View>

            <TouchableOpacity
              onPress={() => setGenderModalVisible(false)}
              activeOpacity={0.86}
              style={{
                minHeight: 46,
                borderRadius: 15,
                backgroundColor: theme.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
