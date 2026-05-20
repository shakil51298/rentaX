import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
import { deactivateDevicePushToken } from '../lib/pushNotifications'
import { getVerificationMeta } from '../lib/verification'
import { PROFILE_MEDIA_BUCKET, uploadMediaAsset } from '../lib/media'
import { useAppSettings } from '../lib/appSettings'

const USER_TYPES = [
  { id: 'property_owner', title: 'Property owner' },
  { id: 'renter', title: 'Finding property' },
]

function displayNameFromEmail(email) {
  if (!email) return 'User'

  return email.split('@')[0]
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
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: '#475569', fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
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
        blurOnSubmit={false}
        autoCorrect={false}
        style={{
          backgroundColor: '#f8fafc',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 14,
          paddingHorizontal: 13,
          paddingVertical: 12,
          minHeight: multiline ? 84 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
          color: '#0f172a',
          fontSize: 14,
        }}
      />
    </View>
  )
}

function CollapsibleSection({ title, subtitle, icon, expanded, onPress, children }) {
  return (
    <View style={{ gap: 10 }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.86}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#fff',
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#e2e8f0',
          paddingHorizontal: 14,
          paddingVertical: 13,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: '#eff6ff',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Ionicons name={icon} size={17} color="#2563eb" />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '900', color: '#0f172a' }}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2, lineHeight: 17 }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#334155"
        />
      </TouchableOpacity>

      {expanded ? children : null}
    </View>
  )
}

function SectionCard({ children }) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: '#e2e8f0',
      }}
    >
      {children}
    </View>
  )
}

function ActionCard({ icon, title, subtitle, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: '#eff6ff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={18} color="#2563eb" />
        </View>

        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 14 }}>
            {title}
          </Text>
          <Text style={{ color: '#64748b', marginTop: 3, fontSize: 12, lineHeight: 17 }}>
            {subtitle}
          </Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color="#64748b" />
    </TouchableOpacity>
  )
}

function PhotoPickerCard({
  title,
  subtitle,
  icon,
  imageUri,
  onPick,
  onRemove,
}) {
  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        backgroundColor: '#f8fafc',
        padding: 12,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: '#eff6ff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={17} color="#2563eb" />
        </View>

        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 13 }}>{title}</Text>
          <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
        </View>
      </View>

      <View
        style={{
          marginTop: 10,
          borderRadius: 14,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: '#dbe4f0',
          backgroundColor: '#fff',
        }}
      >
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={{ width: '100%', height: 110, backgroundColor: '#dbeafe' }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              height: 110,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#eef4ff',
            }}
          >
            <Ionicons name={icon} size={24} color="#93c5fd" />
            <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '700', marginTop: 8 }}>
              No image selected
            </Text>
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <TouchableOpacity
          onPress={onPick}
          style={{
            flex: 1,
            minHeight: 40,
            borderRadius: 12,
            backgroundColor: '#1877F2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>
            {imageUri ? 'Change image' : 'Upload image'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onRemove}
          disabled={!imageUri}
          style={{
            paddingHorizontal: 14,
            minHeight: 40,
            borderRadius: 12,
            backgroundColor: imageUri ? '#e2e8f0' : '#f1f5f9',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: imageUri ? 1 : 0.6,
          }}
        >
          <Text style={{ color: '#334155', fontWeight: '900', fontSize: 12 }}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function SettingRow({ title, subtitle, value, onValueChange }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
      }}
    >
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text style={{ color: '#111827', fontWeight: '800', fontSize: 13 }}>{title}</Text>
        <Text style={{ color: '#64748b', marginTop: 3, lineHeight: 17, fontSize: 12 }}>{subtitle}</Text>
      </View>

      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#cbd5e1', true: '#93c5fd' }}
        thumbColor={value ? '#1877F2' : '#f8fafc'}
      />
    </View>
  )
}

export default function SettingsScreen({ navigation }) {
  const { theme } = useAppSettings()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [pendingAvatarAsset, setPendingAvatarAsset] = useState(null)
  const [pendingCoverAsset, setPendingCoverAsset] = useState(null)
  const [bio, setBio] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [userType, setUserType] = useState('renter')
  const [isVerified, setIsVerified] = useState(false)
  const [ownerVerificationStatus, setOwnerVerificationStatus] = useState('unverified')
  const [notifyMessages, setNotifyMessages] = useState(true)
  const [notifyActivity, setNotifyActivity] = useState(true)
  const [profileExpanded, setProfileExpanded] = useState(false)
  const [notificationExpanded, setNotificationExpanded] = useState(false)
  const [securityExpanded, setSecurityExpanded] = useState(false)
  const [securitySaving, setSecuritySaving] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    loadUser()
  }, [])

  const profilePreviewUri = pendingAvatarAsset?.uri || avatarUrl || ''
  const coverPreviewUri = pendingCoverAsset?.uri || coverUrl || ''

  async function loadUser() {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    setUser(user)

    const metadata = user?.user_metadata || {}
    setDisplayName(metadata.name || metadata.full_name || displayNameFromEmail(user?.email))
    setAvatarUrl(metadata.avatar_url || metadata.picture || '')
    setCoverUrl(metadata.cover_url || '')
    setPendingAvatarAsset(null)
    setPendingCoverAsset(null)
    setUserType(metadata.user_type || 'renter')
    setNotifyMessages(metadata.notify_messages !== false)
    setNotifyActivity(metadata.notify_activity !== false)
    setLoginEmail(user?.email || '')

    if (user?.id) {
      const { data } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

      if (data) {
        setDisplayName(data.display_name || metadata.name || displayNameFromEmail(user.email))
        setAvatarUrl(data.avatar_url || metadata.avatar_url || '')
        setCoverUrl(data.cover_url || metadata.cover_url || '')
        setPendingAvatarAsset(null)
        setPendingCoverAsset(null)
        setBio(data.bio || '')
        setPhone(data.phone || '')
        setLocation(data.location || '')
        setUserType(data.user_type || metadata.user_type || 'renter')
        setIsVerified(Boolean(data.is_verified))
        setOwnerVerificationStatus(data.owner_verification_status || (data.is_verified ? 'verified' : 'unverified'))
      } else {
        setOwnerVerificationStatus('unverified')
      }
    }

    setLoading(false)
  }

  const verificationMeta = getVerificationMeta(ownerVerificationStatus, {
    verifiedLabel: 'Verified account',
    pendingLabel: 'Verification pending',
    rejectedLabel: 'Update verification info',
    defaultLabel: 'Not verified yet',
  })

  async function saveProfile() {
    if (!user) return
    if (!displayName.trim()) {
      Alert.alert('Missing name', 'Please add your display name.')
      return
    }

    setSaving(true)

    const selectedType = USER_TYPES.find((item) => item.id === userType)
    let nextAvatarUrl = avatarUrl.trim() || null
    let nextCoverUrl = coverUrl.trim() || null

    try {
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
        user_type: userType,
        user_type_label: selectedType?.title,
        notify_messages: notifyMessages,
        notify_activity: notifyActivity,
      },
    })

    if (authError) {
      setSaving(false)
      Alert.alert('Profile update failed', authError.message)
      return
    }

    const { error } = await supabase.from('user_profiles').upsert(
      {
        user_id: user.id,
        email: user.email,
        display_name: displayName.trim(),
        avatar_url: nextAvatarUrl,
        cover_url: nextCoverUrl,
        bio: bio.trim() || null,
        phone: phone.trim() || null,
        location: location.trim() || null,
        user_type: userType,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

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
    setPendingAvatarAsset(null)
    setPendingCoverAsset(null)
    Alert.alert('Saved', 'Your settings were updated.')
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

  async function saveSecuritySettings() {
    if (!user) return

    const trimmedEmail = loginEmail.trim().toLowerCase()
    const emailChanged = Boolean(trimmedEmail && trimmedEmail !== (user.email || '').toLowerCase())
    const passwordChanged = Boolean(newPassword)

    if (!emailChanged && !passwordChanged) {
      Alert.alert('Nothing to update', 'Change your email or password first.')
      return
    }

    if (passwordChanged) {
      if (newPassword.length < 6) {
        Alert.alert('Weak password', 'Use at least 6 characters for the new password.')
        return
      }

      if (newPassword !== confirmPassword) {
        Alert.alert('Password mismatch', 'Your password confirmation does not match.')
        return
      }
    }

    setSecuritySaving(true)

    const payload = {}

    if (emailChanged) {
      payload.email = trimmedEmail
    }

    if (passwordChanged) {
      payload.password = newPassword
    }

    const { error } = await supabase.auth.updateUser(payload)

    setSecuritySaving(false)

    if (error) {
      Alert.alert('Security update failed', error.message)
      return
    }

    setNewPassword('')
    setConfirmPassword('')

    if (emailChanged && passwordChanged) {
      Alert.alert(
        'Security updated',
        'Your password was updated. Check your email to confirm the new login email address.'
      )
    } else if (emailChanged) {
      Alert.alert(
        'Email update started',
        'Check your inbox and confirm the new email address to finish the change.'
      )
    } else {
      Alert.alert('Password updated', 'Your password was updated successfully.')
    }

    loadUser()
  }

  async function logout() {
    await deactivateDevicePushToken()
    await supabase.auth.signOut()
    navigation.replace('Login')
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
          <View style={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 14, gap: 14 }}>
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                padding: 12,
                overflow: 'hidden',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '800', marginBottom: 8 }}>
                Preview
              </Text>

              <View
                style={{
                  borderRadius: 16,
                  overflow: 'hidden',
                  backgroundColor: '#eff6ff',
                  borderWidth: 1,
                  borderColor: '#dbeafe',
                }}
              >
                <View style={{ height: 116, backgroundColor: '#dbeafe' }}>
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
                        backgroundColor: '#dbeafe',
                      }}
                    >
                      <Ionicons name="image-outline" size={28} color="#93c5fd" />
                      <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '700', marginTop: 6 }}>
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
                          backgroundColor: '#ddd',
                          borderWidth: 3,
                          borderColor: '#fff',
                        }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 68,
                          height: 68,
                          borderRadius: 34,
                          backgroundColor: '#dbeafe',
                          borderWidth: 3,
                          borderColor: '#fff',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontSize: 24, fontWeight: '900', color: '#1d4ed8' }}>
                          {displayName ? displayName.charAt(0).toUpperCase() : 'U'}
                        </Text>
                      </View>
                    )}

                    <View style={{ flex: 1, minWidth: 0, marginLeft: 10, paddingBottom: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                        <Text
                          style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: '900', color: '#111827' }}
                          numberOfLines={2}
                        >
                          {displayName || 'User'}
                        </Text>

                        {ownerVerificationStatus === 'verified' || isVerified ? (
                          <Ionicons
                            name="checkmark-circle"
                            size={17}
                            color="#1877F2"
                            style={{ marginLeft: 6, flexShrink: 0 }}
                          />
                        ) : null}
                      </View>

                      <Text
                        style={{ marginTop: 3, color: '#64748b', fontSize: 12 }}
                        numberOfLines={1}
                      >
                        {user?.email || ''}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>

            <ActionCard
              icon="shield-checkmark-outline"
              title="Verification center"
              subtitle={verificationMeta.label}
              onPress={() => navigation.navigate('VerificationCenter')}
            />

            <CollapsibleSection
              title="Profile settings"
              subtitle="Name, photos, bio, phone, location, and account type."
              icon="person-outline"
              expanded={profileExpanded}
              onPress={() => setProfileExpanded((current) => !current)}
            >
              <SectionCard>
                <Field
                  label="Display name"
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Your public name"
                />

                <PhotoPickerCard
                  title="Profile photo"
                  subtitle="Upload a square image and review it above before saving."
                  icon="person-circle-outline"
                  imageUri={profilePreviewUri}
                  onPick={() => pickImage('avatar')}
                  onRemove={() => {
                    setPendingAvatarAsset(null)
                    setAvatarUrl('')
                  }}
                />

                <PhotoPickerCard
                  title="Cover photo"
                  subtitle="Upload a wide image and review how it pairs with your profile photo."
                  icon="image-outline"
                  imageUri={coverPreviewUri}
                  onPick={() => pickImage('cover')}
                  onRemove={() => {
                    setPendingCoverAsset(null)
                    setCoverUrl('')
                  }}
                />

                <Field
                  label="Owner details / Bio"
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Tell renters about you or your properties"
                  multiline
                />

                <Field
                  label="Phone"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Contact phone"
                  keyboardType="phone-pad"
                />

                <Field
                  label="Location"
                  value={location}
                  onChangeText={setLocation}
                  placeholder="City or area"
                />

                <Text style={{ color: '#475569', fontWeight: '700', marginBottom: 8 }}>
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
                          borderColor: isSelected ? '#1877F2' : '#e2e8f0',
                          backgroundColor: isSelected ? '#eff6ff' : '#f8fafc',
                          paddingVertical: 11,
                          paddingHorizontal: 10,
                          alignItems: 'center',
                        }}
                      >
                        <Text
                          style={{
                            color: isSelected ? '#1877F2' : '#475569',
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
              </SectionCard>
            </CollapsibleSection>

            <CollapsibleSection
              title="Notification settings"
              subtitle="Control message alerts and activity updates."
              icon="notifications-outline"
              expanded={notificationExpanded}
              onPress={() => setNotificationExpanded((current) => !current)}
            >
              <SectionCard>
                <SettingRow
                  title="Messages"
                  subtitle="Get notified when someone sends you a new chat message."
                  value={notifyMessages}
                  onValueChange={setNotifyMessages}
                />

                <View style={{ height: 1, backgroundColor: '#e2e8f0' }} />

                <SettingRow
                  title="Post and comment activity"
                  subtitle="Show alerts for likes, replies, and activity on your posts or comments."
                  value={notifyActivity}
                  onValueChange={setNotifyActivity}
                />
              </SectionCard>
            </CollapsibleSection>

            <CollapsibleSection
              title="Password and security"
              subtitle="Update login email and password safely."
              icon="shield-checkmark-outline"
              expanded={securityExpanded}
              onPress={() => setSecurityExpanded((current) => !current)}
            >
              <SectionCard>
                <Field
                  label="Login email"
                  value={loginEmail}
                  onChangeText={setLoginEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />

                <Field
                  label="New password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 6 characters"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password-new"
                />

                <Field
                  label="Confirm new password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter new password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password-new"
                />

                <View
                  style={{
                    backgroundColor: '#f8fafc',
                    borderRadius: 14,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ color: '#475569', lineHeight: 18, fontSize: 12 }}>
                    Email changes may need inbox confirmation. Password updates apply after saving here.
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={saveSecuritySettings}
                  disabled={securitySaving}
                  style={{
                    backgroundColor: securitySaving ? '#8bbcf7' : '#1877F2',
                    borderRadius: 14,
                    paddingVertical: 13,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>
                    {securitySaving ? 'Updating...' : 'Update security'}
                  </Text>
                </TouchableOpacity>
              </SectionCard>
            </CollapsibleSection>

            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                padding: 12,
                gap: 10,
              }}
            >
              <TouchableOpacity
                onPress={saveProfile}
                disabled={saving}
                style={{
                  backgroundColor: saving ? '#8bbcf7' : '#1877F2',
                  borderRadius: 14,
                  paddingVertical: 13,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>
                  {saving ? 'Saving...' : 'Save settings'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={logout}
                style={{
                  backgroundColor: '#111827',
                  paddingVertical: 13,
                  borderRadius: 14,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
