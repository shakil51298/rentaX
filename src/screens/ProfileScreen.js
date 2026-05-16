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
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { SafeAreaView } from 'react-native-safe-area-context'
import BottomNavBar from '../components/navigation/BottomNavBar'
import { deactivateDevicePushToken } from '../lib/pushNotifications'

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

function SectionTitle({ children }) {
  return (
    <Text style={{ fontSize: 18, fontWeight: '900', color: '#0f172a', marginBottom: 12 }}>
      {children}
    </Text>
  )
}

function CollapsibleSection({ title, expanded, onPress, children }) {
  return (
    <View>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: expanded ? 12 : 0,
        }}
      >
        <SectionTitle>{title}</SectionTitle>

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#334155"
          style={{ marginTop: -10 }}
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
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
      }}
    >
      {children}
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
        paddingVertical: 12,
      }}
    >
      <View style={{ flex: 1, paddingRight: 16 }}>
        <Text style={{ color: '#111827', fontWeight: '800', fontSize: 15 }}>{title}</Text>
        <Text style={{ color: '#64748b', marginTop: 4, lineHeight: 18 }}>{subtitle}</Text>
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
  const [notifyMessages, setNotifyMessages] = useState(true)
  const [notifyActivity, setNotifyActivity] = useState(true)
  const [profileExpanded, setProfileExpanded] = useState(true)
  const [notificationExpanded, setNotificationExpanded] = useState(true)

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
    setNotifyMessages(metadata.notify_messages !== false)
    setNotifyActivity(metadata.notify_activity !== false)

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
    await deactivateDevicePushToken()
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }}>
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

      <View style={{ padding: 16, gap: 18 }}>
        <CollapsibleSection
          title="Profile settings"
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
          </SectionCard>
        </CollapsibleSection>

        <CollapsibleSection
          title="Notification settings"
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

        <TouchableOpacity
          onPress={saveProfile}
          disabled={saving}
          style={{
            backgroundColor: saving ? '#8bbcf7' : '#1877F2',
            borderRadius: 14,
            paddingVertical: 15,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '900' }}>
            {saving ? 'Saving...' : 'Save settings'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={logout}
          style={{
            backgroundColor: '#111',
            paddingVertical: 15,
            borderRadius: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>Logout</Text>
        </TouchableOpacity>
      </View>
        </ScrollView>

        <BottomNavBar navigation={navigation} activeTab="profile" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
