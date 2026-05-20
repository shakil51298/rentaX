import { useCallback, useState, useEffect } from 'react'
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Text,
  Pressable,
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
import { fetchAdminReportCounts } from '../lib/reporting'
import { APP_APPEARANCE_MODES, APP_LANGUAGES, APP_THEMES, useAppSettings } from '../lib/appSettings'

function displayNameFromEmail(email) {
  if (!email) return 'User'

  return email.split('@')[0]
}

function ActionCard({ icon, title, subtitle, onPress, badgeCount = 0, theme }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      style={{
        backgroundColor: theme.surface,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.border,
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
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={22} color={theme.accent} />
        </View>

        <View style={{ marginLeft: 12, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <Text style={{ color: theme.text, fontWeight: '900', fontSize: 16 }}>
              {title}
            </Text>
            {badgeCount ? (
              <View
                style={{
                  marginLeft: 8,
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  paddingHorizontal: 6,
                  backgroundColor: '#ef4444',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>
                  {badgeCount > 99 ? '99+' : badgeCount}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={{ color: theme.mutedText, marginTop: 4 }}>
            {subtitle}
          </Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={20} color={theme.mutedText} />
    </TouchableOpacity>
  )
}

function ThemeSwatch({ preset, selected, theme, title, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      style={{
        width: '18.4%',
        minWidth: 58,
        alignItems: 'center',
        gap: 7,
      }}
    >
      <View
        style={{
          width: 50,
          height: 50,
          borderRadius: 18,
          backgroundColor: preset.surface,
          borderWidth: 2,
          borderColor: selected ? theme.accent : preset.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: preset.accent,
          }}
        />
      </View>
      <Text
        style={{
          color: selected ? theme.text : theme.mutedText,
          fontSize: 10,
          fontWeight: selected ? '900' : '700',
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
    </TouchableOpacity>
  )
}

function LanguageOption({ label, selected, onPress, theme }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      style={{
        flex: 1,
        minHeight: 42,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: selected ? theme.accent : theme.border,
        backgroundColor: selected ? theme.accentSoft : theme.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: selected ? theme.accentStrong : theme.mutedText,
          fontSize: 13,
          fontWeight: '900',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}

export default function ProfileScreen({ navigation, embeddedTabShell = false }) {
  const {
    theme,
    language,
    setLanguage,
    themeId,
    setThemeId,
    appearanceMode,
    setAppearanceMode,
    t,
  } = useAppSettings()
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
  const [adminPanelCount, setAdminPanelCount] = useState(0)
  const [imageViewer, setImageViewer] = useState({
    visible: false,
    title: '',
    uri: null,
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

  const loadAdminPanelCount = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!isPrimaryAdmin(user)) {
      setAdminPanelCount(0)
      return
    }

    const [{ count: ownerCount }, { count: propertyCount }, reportCounts] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('owner_verification_status', 'pending'),
      supabase
        .from('properties')
        .select('id', { count: 'exact', head: true })
        .eq('verification_status', 'pending'),
      fetchAdminReportCounts(),
    ])

    setAdminPanelCount(
      (ownerCount || 0)
      + (propertyCount || 0)
      + (reportCounts.userReportCount || 0)
      + (reportCounts.propertyReportCount || 0)
    )
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (embeddedTabShell) {
        return undefined
      }

      loadProfile()
      loadAdminPanelCount()
    }, [embeddedTabShell, loadAdminPanelCount, loadProfile])
  )

  useEffect(() => {
    if (!embeddedTabShell) return

    loadProfile()
    loadAdminPanelCount()
  }, [embeddedTabShell, loadAdminPanelCount, loadProfile])

  useEffect(() => {
    if (!showAdminPanel) return undefined

    const refreshAdminCount = () => {
      loadAdminPanelCount()
    }

    const ownerChannel = supabase
      .channel(`profile-admin-owners-${Date.now()}-${Math.random()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_profiles',
        },
        refreshAdminCount
      )
      .subscribe()

    const propertyChannel = supabase
      .channel(`profile-admin-properties-${Date.now()}-${Math.random()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'properties',
        },
        refreshAdminCount
      )
      .subscribe()

    const userReportChannel = supabase
      .channel(`profile-admin-user-reports-${Date.now()}-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_reports' },
        refreshAdminCount
      )
      .subscribe()

    const propertyReportChannel = supabase
      .channel(`profile-admin-property-reports-${Date.now()}-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'property_reports' },
        refreshAdminCount
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ownerChannel)
      supabase.removeChannel(propertyChannel)
      supabase.removeChannel(userReportChannel)
      supabase.removeChannel(propertyReportChannel)
    }
  }, [loadAdminPanelCount, showAdminPanel])

  const displayName = profile?.display_name || displayNameFromEmail(email)
  const avatarUrl = profile?.avatar_url || null
  const coverUrl = profile?.cover_url || null
  const isVerifiedOwner = getOwnerVerificationStatus(profile) === 'verified'
  const showAdminPanel = isPrimaryAdmin(email)

  function openImageViewer(title, uri) {
    if (!uri) return

    setImageViewer({
      visible: true,
      title,
      uri,
    })
  }

  function closeImageViewer() {
    setImageViewer({
      visible: false,
      title: '',
      uri: null,
    })
  }

  function openConnections(kind) {
    if (!currentUserId) return

    navigation.navigate('Connections', {
      userId: currentUserId,
      kind,
      title: kind === 'following' ? t('profileFollowing', 'Following') : t('profileFollowers', 'Followers'),
      isOwnProfile: true,
    })
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'left', 'right', 'bottom']}>
      <SwipeTabView navigation={navigation} activeTab="profile">
        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 140 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ backgroundColor: theme.surface, paddingBottom: 18 }}>
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={() => openImageViewer('Cover photo', coverUrl)}
                disabled={!coverUrl}
                style={{ height: 96, backgroundColor: theme.accent }}
              >
                {coverUrl ? (
                  <Image
                    source={{ uri: coverUrl }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                ) : null}
              </TouchableOpacity>

              <View style={{ alignItems: 'center', marginTop: -30, paddingHorizontal: 18 }}>
                {avatarUrl ? (
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => openImageViewer('Profile photo', avatarUrl)}
                  >
                    <Image
                      source={{ uri: avatarUrl }}
                      style={{
                        width: 76,
                        height: 76,
                        borderRadius: 38,
                        backgroundColor: '#ddd',
                        borderWidth: 4,
                        borderColor: '#fff',
                      }}
                    />
                  </TouchableOpacity>
                ) : (
                  <View
                    style={{
                      width: 76,
                      height: 76,
                      borderRadius: 38,
                      backgroundColor: theme.hero,
                      borderWidth: 4,
                      borderColor: '#fff',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 26, fontWeight: '900', color: theme.heroText }}>
                      {displayName ? displayName.charAt(0).toUpperCase() : 'U'}
                    </Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: theme.text }}>
                    {displayName || 'User'}
                  </Text>

                  {isVerifiedOwner ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={theme.accent}
                      style={{ marginLeft: 6 }}
                    />
                  ) : null}
                </View>

                <Text style={{ marginTop: 3, color: theme.mutedText, fontSize: 13 }}>
                  {email}
                </Text>

                <View
                  style={{
                    flexDirection: 'row',
                    width: '100%',
                    marginTop: 14,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 18,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 14,
                      backgroundColor: theme.surface,
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '900', color: theme.text }}>
                      {socialCounts.posts}
                    </Text>
                    <Text style={{ marginTop: 4, color: theme.mutedText, fontSize: 12 }}>
                      {t('profilePosts', 'Posts')}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => openConnections('followers')}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 14,
                      backgroundColor: theme.surface,
                      borderLeftWidth: 1,
                      borderLeftColor: theme.border,
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '900', color: theme.text }}>
                      {socialCounts.followers}
                    </Text>
                    <Text style={{ marginTop: 4, color: theme.mutedText, fontSize: 12 }}>
                      {t('profileFollowers', 'Followers')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => openConnections('following')}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 14,
                      backgroundColor: theme.surface,
                      borderLeftWidth: 1,
                      borderLeftColor: theme.border,
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '900', color: theme.text }}>
                      {socialCounts.following}
                    </Text>
                    <Text style={{ marginTop: 4, color: theme.mutedText, fontSize: 12 }}>
                      {t('profileFollowing', 'Following')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={{ padding: 16, gap: 16 }}>
              <View
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: theme.border,
                  padding: 16,
                  gap: 14,
                }}
              >
                <View>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>
                    {t('profileGeneralSettings', 'General settings')}
                  </Text>
                  <Text style={{ color: theme.mutedText, marginTop: 4, fontSize: 12, lineHeight: 18 }}>
                    {t('profileGeneralSettingsSubtitle', 'Change the app theme and switch between Bangla and English.')}
                  </Text>
                </View>

                <View
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surfaceMuted,
                    padding: 12,
                    gap: 12,
                  }}
                >
                  <View>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
                      {t('settingsAppearanceTitle', 'Appearance')}
                    </Text>
                    <Text style={{ color: theme.mutedText, marginTop: 3, fontSize: 11, lineHeight: 17 }}>
                      {t('settingsAppearanceSubtitle', 'Choose a light or dark look for the app.')}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {APP_APPEARANCE_MODES.map((option) => (
                      <LanguageOption
                        key={option.id}
                        label={t(option.labelKey, option.id)}
                        selected={appearanceMode === option.id}
                        onPress={() => setAppearanceMode(option.id)}
                        theme={theme}
                      />
                    ))}
                  </View>
                </View>

                <View
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surfaceMuted,
                    padding: 12,
                    gap: 12,
                  }}
                >
                  <View>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
                      {t('settingsThemeTitle', 'Theme')}
                    </Text>
                    <Text style={{ color: theme.mutedText, marginTop: 3, fontSize: 11, lineHeight: 17 }}>
                      {t('settingsThemeSubtitle', 'Pick the colors and button style you want across the app.')}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
                    {APP_THEMES.map((preset) => (
                      <ThemeSwatch
                        key={preset.id}
                        preset={preset}
                        selected={themeId === preset.id}
                        theme={theme}
                        title={t(preset.nameKey, preset.id)}
                        onPress={() => setThemeId(preset.id)}
                      />
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View
                      style={{
                        flex: 1,
                        minHeight: 40,
                        borderRadius: 13,
                        backgroundColor: theme.accent,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>
                        {t('settingsPreviewPrimary', 'Primary')}
                      </Text>
                    </View>
                    <View
                      style={{
                        flex: 1,
                        minHeight: 40,
                        borderRadius: 13,
                        backgroundColor: theme.accentSoft,
                        borderWidth: 1,
                        borderColor: theme.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: theme.accentStrong, fontSize: 12, fontWeight: '900' }}>
                        {t('settingsPreviewSoft', 'Soft')}
                      </Text>
                    </View>
                  </View>
                </View>

                <View
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surfaceMuted,
                    padding: 12,
                    gap: 12,
                  }}
                >
                  <View>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
                      {t('settingsLanguageTitle', 'Language')}
                    </Text>
                    <Text style={{ color: theme.mutedText, marginTop: 3, fontSize: 11, lineHeight: 17 }}>
                      {t('settingsLanguageSubtitle', 'Switch app text between English and Bangla.')}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {APP_LANGUAGES.map((option) => (
                      <LanguageOption
                        key={option.id}
                        label={option.label}
                        selected={language === option.id}
                        onPress={() => setLanguage(option.id)}
                        theme={theme}
                      />
                    ))}
                  </View>
                </View>
              </View>

              <ActionCard
                icon="newspaper-outline"
                title={t('profileAdsManagement', 'Ads Management')}
                subtitle={t('profileAdsManagementSubtitle', 'View, edit, share, and delete your property posts.')}
                theme={theme}
                onPress={() => navigation.navigate('AdsManagement')}
              />

              {showAdminPanel ? (
                <ActionCard
                  icon="shield-checkmark-outline"
                  title={t('profileAdminPanel', 'Admin panel')}
                  subtitle={t('profileAdminPanelSubtitle', 'Review owner and property verification requests.')}
                  badgeCount={adminPanelCount}
                  theme={theme}
                  onPress={() => navigation.navigate('AdminPanel')}
                />
              ) : null}

              <ActionCard
                icon="settings-outline"
                title={t('profileSettings', 'Settings')}
                subtitle={t('profileSettingsSubtitle', 'Profile, notifications, password, security, and account type.')}
                theme={theme}
                onPress={() => navigation.navigate('Settings')}
              />
            </View>
          </ScrollView>

          {!embeddedTabShell ? (
            <BottomNavBar navigation={navigation} activeTab="profile" />
          ) : null}
        </View>
      </SwipeTabView>

      <Modal
        visible={imageViewer.visible}
        transparent
        animationType="fade"
        onRequestClose={closeImageViewer}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(2, 6, 23, 0.96)',
          }}
        >
          <Pressable
            onPress={closeImageViewer}
            style={{
              position: 'absolute',
              inset: 0,
            }}
          />

          <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right', 'bottom']}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingTop: 6,
              }}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800' }}>
                {imageViewer.title}
              </Text>

              <TouchableOpacity
                onPress={closeImageViewer}
                activeOpacity={0.85}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: 'rgba(255, 255, 255, 0.12)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
            </View>

            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 14,
                paddingBottom: 20,
              }}
            >
              {imageViewer.uri ? (
                <Image
                  source={{ uri: imageViewer.uri }}
                  style={{
                    width: '100%',
                    height: '82%',
                    borderRadius: 18,
                    backgroundColor: '#0f172a',
                  }}
                  resizeMode="contain"
                />
              ) : null}
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
