import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'

const USER_TYPES = [
  { id: 'property_owner', title: 'Property owner' },
  { id: 'renter', title: 'Finding property' },
]

function displayNameFromEmail(email) {
  if (!email) return 'User'

  return email.split('@')[0]
}

function Field({ label, value, onChangeText, placeholder, multiline, keyboardType }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: '#475569', fontWeight: '700', marginBottom: 7 }}>
        {label}
      </Text>

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        multiline={multiline}
        keyboardType={keyboardType}
        blurOnSubmit={false}
        autoCorrect={false}
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
          minHeight: multiline ? 92 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  )
}

export default function ProfileScreen({ navigation }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [bio, setBio] = useState('')
  const [phone, setPhone] = useState('')
  const [location, setLocation] = useState('')
  const [userType, setUserType] = useState('renter')
  const [isVerified, setIsVerified] = useState(false)

  useEffect(() => {
    loadUser()
  }, [])

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
    setUserType(metadata.user_type || 'renter')

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
        setBio(data.bio || '')
        setPhone(data.phone || '')
        setLocation(data.location || '')
        setUserType(data.user_type || metadata.user_type || 'renter')
        setIsVerified(Boolean(data.is_verified))
      }
    }

    setLoading(false)
  }

  async function saveProfile() {
    if (!user) return
    if (!displayName.trim()) {
      Alert.alert('Missing name', 'Please add your display name.')
      return
    }

    setSaving(true)

    const selectedType = USER_TYPES.find((item) => item.id === userType)

    const { error: authError } = await supabase.auth.updateUser({
      data: {
        name: displayName.trim(),
        full_name: displayName.trim(),
        avatar_url: avatarUrl.trim() || null,
        cover_url: coverUrl.trim() || null,
        user_type: userType,
        user_type_label: selectedType?.title,
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
        avatar_url: avatarUrl.trim() || null,
        cover_url: coverUrl.trim() || null,
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

    Alert.alert('Saved', 'Your public profile was updated.')
    loadUser()
  }

  async function logout() {
    await supabase.auth.signOut()
    navigation.replace('Login')
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#f7f7f7' }}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#f7f7f7' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
        automaticallyAdjustKeyboardInsets
      >
      <View style={{ backgroundColor: '#fff', paddingBottom: 20 }}>
        <View style={{ height: 118, backgroundColor: '#1877F2' }}>
          {coverUrl ? (
            <Image
              source={{ uri: coverUrl }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          ) : null}
        </View>

        <View style={{ alignItems: 'center', marginTop: -42 }}>
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{
              width: 86,
              height: 86,
              borderRadius: 43,
              backgroundColor: '#ddd',
              borderWidth: 4,
              borderColor: '#fff',
            }}
          />
        ) : (
          <View
            style={{
              width: 86,
              height: 86,
              borderRadius: 43,
              backgroundColor: '#dbeafe',
              borderWidth: 4,
              borderColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 30, fontWeight: '900', color: '#1d4ed8' }}>
              {displayName ? displayName.charAt(0).toUpperCase() : 'U'}
            </Text>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
          <Text style={{ fontSize: 22, fontWeight: '900', color: '#111827' }}>
            {displayName || 'User'}
          </Text>

          {isVerified ? (
            <Ionicons
              name="checkmark-circle"
              size={21}
              color="#1877F2"
              style={{ marginLeft: 6 }}
            />
          ) : null}
        </View>

        <Text style={{ marginTop: 4, color: '#666' }}>
          {user?.email || ''}
        </Text>
        </View>
      </View>

      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '900', marginBottom: 12 }}>
          Public profile
        </Text>

        <Field
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your public name"
        />

        <Field
          label="Profile picture URL"
          value={avatarUrl}
          onChangeText={setAvatarUrl}
          placeholder="https://..."
        />

        <Field
          label="Cover photo URL"
          value={coverUrl}
          onChangeText={setCoverUrl}
          placeholder="https://..."
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

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
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
                  backgroundColor: isSelected ? '#eff6ff' : '#fff',
                  padding: 12,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    color: isSelected ? '#1877F2' : '#475569',
                    fontWeight: '800',
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
            backgroundColor: saving ? '#8bbcf7' : '#1877F2',
            borderRadius: 12,
            paddingVertical: 15,
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '900' }}>
            {saving ? 'Saving...' : 'Save profile'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={logout}
          style={{
            backgroundColor: '#111',
            paddingVertical: 15,
            borderRadius: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>Logout</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
