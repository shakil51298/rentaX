import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import BottomNavBar from '../components/navigation/BottomNavBar'
import SwipeTabView from '../components/navigation/SwipeTabView'
import { fetchUserSocialCounts } from '../lib/social'
import { getOwnerVerificationStatus } from '../lib/verification'
import { isPrimaryAdmin } from '../lib/admin'

function displayNameFromEmail(email) {
  if (!email) return 'User'

  return email.split('@')[0]
}

function ActionCard({ icon, title, subtitle, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      style={{
        backgroundColor: '#fff',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: '#eff6ff',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={22} color="#2563eb" />
        </View>

        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 16 }}>
            {title}
          </Text>
          <Text style={{ color: '#64748b', marginTop: 4 }}>
            {subtitle}
          </Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={20} color="#64748b" />
    </TouchableOpacity>
  )
}

export default function ProfileScreen({ navigation }) {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [email, setEmail] = useState('')
  const [currentUserId, setCurrentUserId] = useState(null)
  const [socialCounts, setSocialCounts] = useState({
    posts: 0,
    followers: 0,
    following: 0,
    blocked: 0,
  })

  const loadProfile = useCallback(async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
      setCurrentUserId(null)
      setProfile(null)
      setEmail('')
      setLoading(false)
      return
    }

    setCurrentUserId(user.id)

    const metadata = user.user_metadata || {}
    const fallbackProfile = {
      display_name: metadata.name || metadata.full_name || displayNameFromEmail(user.email),
      avatar_url: metadata.avatar_url || metadata.picture || null,
      cover_url: metadata.cover_url || null,
      is_verified: false,
      owner_verification_status: 'unverified',
    }

    const { data: dbProfile } = await supabase
      .from('user_profiles')
      .select('display_name, avatar_url, cover_url, is_verified, owner_verification_status')
      .eq('user_id', user.id)
      .maybeSingle()

    const [counts, nextProfile] = await Promise.all([
      fetchUserSocialCounts(user.id),
      Promise.resolve({
        ...fallbackProfile,
        ...(dbProfile || {}),
      }),
    ])

    setProfile(nextProfile)
    setSocialCounts(counts)
    setEmail(user.email || '')
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadProfile()
    }, [loadProfile])
  )

  const displayName = profile?.display_name || displayNameFromEmail(email)
  const avatarUrl = profile?.avatar_url || null
  const coverUrl = profile?.cover_url || null
  const isVerifiedOwner = getOwnerVerificationStatus(profile) === 'verified'
  const showAdminPanel = isPrimaryAdmin(email)

  function openConnections(kind) {
    if (!currentUserId) return

    navigation.navigate('Connections', {
      userId: currentUserId,
      kind,
      title: kind === 'following' ? 'Following' : 'Followers',
      isOwnProfile: true,
    })
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
      <SwipeTabView navigation={navigation} activeTab="profile">
        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 140 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ backgroundColor: '#fff', paddingBottom: 22 }}>
              <View style={{ height: 132, backgroundColor: '#1877F2' }}>
                {coverUrl ? (
                  <Image
                    source={{ uri: coverUrl }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                ) : null}
              </View>

              <View style={{ alignItems: 'center', marginTop: -42, paddingHorizontal: 18 }}>
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: 44,
                      backgroundColor: '#ddd',
                      borderWidth: 4,
                      borderColor: '#fff',
                    }}
                  />
                ) : (
                  <View
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: 44,
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

                  {isVerifiedOwner ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color="#1877F2"
                      style={{ marginLeft: 6 }}
                    />
                  ) : null}
                </View>

                <Text style={{ marginTop: 4, color: '#64748b' }}>
                  {email}
                </Text>

                <View
                  style={{
                    flexDirection: 'row',
                    width: '100%',
                    marginTop: 18,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    borderRadius: 18,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 14,
                      backgroundColor: '#fff',
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '900', color: '#0f172a' }}>
                      {socialCounts.posts}
                    </Text>
                    <Text style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>
                      Posts
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => openConnections('followers')}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 14,
                      backgroundColor: '#fff',
                      borderLeftWidth: 1,
                      borderLeftColor: '#e2e8f0',
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '900', color: '#0f172a' }}>
                      {socialCounts.followers}
                    </Text>
                    <Text style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>
                      Followers
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => openConnections('following')}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 14,
                      backgroundColor: '#fff',
                      borderLeftWidth: 1,
                      borderLeftColor: '#e2e8f0',
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '900', color: '#0f172a' }}>
                      {socialCounts.following}
                    </Text>
                    <Text style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>
                      Following
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={{ padding: 16, gap: 16 }}>
              <ActionCard
                icon="newspaper-outline"
                title="Ads Management"
                subtitle="View, edit, share, and delete your property posts."
                onPress={() => navigation.navigate('AdsManagement')}
              />

              {showAdminPanel ? (
                <ActionCard
                  icon="shield-checkmark-outline"
                  title="Admin panel"
                  subtitle="Review owner and property verification requests."
                  onPress={() => navigation.navigate('AdminPanel')}
                />
              ) : null}

              <ActionCard
                icon="settings-outline"
                title="Settings"
                subtitle="Profile, notifications, password, security, and account type."
                onPress={() => navigation.navigate('Settings')}
              />
            </View>
          </ScrollView>

          <BottomNavBar navigation={navigation} activeTab="profile" />
        </View>
      </SwipeTabView>
    </SafeAreaView>
  )
}
