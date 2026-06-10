import { useCallback, useState, useEffect, useRef } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  Share,
  Switch,
  Text,
  TextInput,
  Pressable,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import * as Clipboard from 'expo-clipboard'
import QRCode from 'react-native-qrcode-svg'
import { supabase } from '../lib/supabase'
import { getCachedAuthUser } from '../lib/authSession'
import BottomNavBar from '../components/navigation/BottomNavBar'
import SwipeTabView from '../components/navigation/SwipeTabView'
import { fetchUserSocialCounts } from '../lib/social'
import { getOwnerVerificationStatus } from '../lib/verification'
import { isPrimaryAdmin } from '../lib/admin'
import { fetchAdminReportCounts } from '../lib/reporting'
import { fetchPendingWalletTopupRequestCount } from '../lib/wallet'
import { fetchPendingAccountDeletionRequestCount } from '../lib/accountDeletion'
import { deactivateDevicePushToken } from '../lib/pushNotifications'
import { APP_APPEARANCE_MODES, APP_LANGUAGES, APP_THEMES, useAppSettings } from '../lib/appSettings'

function displayNameFromEmail(email) {
  if (!email) return 'User'

  return email.split('@')[0]
}

function buildRentalXId(value) {
  const cleanValue = String(value || 'rentalx-user').replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  const shortId = cleanValue.slice(-8).padStart(8, '0')

  return `RX-${shortId}`
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
        paddingHorizontal: 14,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={20} color={theme.accent} />
        </View>

        <View style={{ marginLeft: 12, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <Text style={{ color: theme.text, fontWeight: '900', fontSize: 15 }}>
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
          {subtitle ? (
            <Text style={{ color: theme.mutedText, marginTop: 4, fontSize: 12 }}>
              {subtitle}
            </Text>
          ) : null}
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

function AccountField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoComplete,
  theme,
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.mutedText, fontSize: 12, fontWeight: '900' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={false}
        style={{
          minHeight: 44,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surfaceMuted,
          color: theme.text,
          paddingHorizontal: 12,
          fontSize: 13,
          fontWeight: '700',
        }}
      />
    </View>
  )
}

function AccountToggleRow({ title, subtitle, value, onValueChange, disabled, theme }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 10,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>{title}</Text>
        {subtitle ? (
          <Text style={{ color: theme.mutedText, fontSize: 11, lineHeight: 16, marginTop: 3 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: theme.border, true: theme.accentSoft }}
        thumbColor={value ? theme.accent : theme.surface}
      />
    </View>
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
  const [generalSettingsExpanded, setGeneralSettingsExpanded] = useState(false)
  const [accountSettingsExpanded, setAccountSettingsExpanded] = useState(false)
  const [notificationSettingsExpanded, setNotificationSettingsExpanded] = useState(false)
  const [securitySettingsExpanded, setSecuritySettingsExpanded] = useState(false)
  const [notifyMessages, setNotifyMessages] = useState(true)
  const [notifyActivity, setNotifyActivity] = useState(true)
  const [notificationSaving, setNotificationSaving] = useState(false)
  const [securitySaving, setSecuritySaving] = useState(false)
  const [loginEmail, setLoginEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [imageViewer, setImageViewer] = useState({
    visible: false,
    title: '',
    uri: null,
  })
  const [qrModalVisible, setQrModalVisible] = useState(false)
  const hasLoadedProfileRef = useRef(false)

  const loadProfile = useCallback(async ({ showLoader = false } = {}) => {
    if (showLoader) {
      setLoading(true)
    }

    const user = await getCachedAuthUser()

    if (!user?.id) {
      setCurrentUserId(null)
      setProfile(null)
      setEmail('')
      setLoginEmail('')
      hasLoadedProfileRef.current = false
      setLoading(false)
      return
    }

    setCurrentUserId(user.id)

    const metadata = user.user_metadata || {}
    setNotifyMessages(metadata.notify_messages !== false)
    setNotifyActivity(metadata.notify_activity !== false)
    setLoginEmail(user.email || '')
    const fallbackProfile = {
      display_name: metadata.name || metadata.full_name || displayNameFromEmail(user.email),
      rentalx_id: metadata.rentalx_id || buildRentalXId(user.id || user.email),
      avatar_url: metadata.avatar_url || metadata.picture || null,
      cover_url: metadata.cover_url || null,
      is_verified: false,
      owner_verification_status: 'unverified',
    }
    setProfile((current) => current || fallbackProfile)
    setEmail(user.email || '')
    hasLoadedProfileRef.current = true
    setLoading(false)

    const [{ data: dbProfile }, counts] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('display_name, rentalx_id, avatar_url, cover_url, is_verified, owner_verification_status')
        .eq('user_id', user.id)
        .maybeSingle(),
      fetchUserSocialCounts(user.id),
    ])
    const nextProfile = {
      ...fallbackProfile,
      ...(dbProfile || {}),
    }

    setProfile(nextProfile)
    setSocialCounts(counts)
    setEmail(user.email || '')
  }, [])

  const loadAdminPanelCount = useCallback(async () => {
    const user = await getCachedAuthUser()

    if (!isPrimaryAdmin(user)) {
      setAdminPanelCount(0)
      return
    }

    const [
      { count: ownerCount },
      { count: propertyCount },
      reportCounts,
      pendingWalletRequests,
      pendingDeletionRequests,
    ] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('owner_verification_status', 'pending'),
      supabase
        .from('properties')
        .select('id', { count: 'exact', head: true })
        .eq('verification_status', 'pending'),
      fetchAdminReportCounts(),
      fetchPendingWalletTopupRequestCount(),
      fetchPendingAccountDeletionRequestCount(),
    ])

    setAdminPanelCount(
      (ownerCount || 0)
      + (propertyCount || 0)
      + (reportCounts.userReportCount || 0)
      + (reportCounts.propertyReportCount || 0)
      + (pendingWalletRequests || 0)
      + (pendingDeletionRequests || 0)
    )
  }, [])

  const refreshProfile = useCallback(() => {
    loadProfile({ showLoader: !hasLoadedProfileRef.current })
    loadAdminPanelCount()
  }, [loadAdminPanelCount, loadProfile])

  useFocusEffect(
    useCallback(() => {
      refreshProfile()
      return undefined
    }, [refreshProfile])
  )

  const showAdminPanel = isPrimaryAdmin(email)

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

    const walletChannel = supabase
      .channel(`profile-admin-wallet-${Date.now()}-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_topup_requests' },
        refreshAdminCount
      )
      .subscribe()

    const deletionChannel = supabase
      .channel(`profile-admin-account-deletion-${Date.now()}-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'account_deletion_requests' },
        refreshAdminCount
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ownerChannel)
      supabase.removeChannel(propertyChannel)
      supabase.removeChannel(userReportChannel)
      supabase.removeChannel(propertyReportChannel)
      supabase.removeChannel(walletChannel)
      supabase.removeChannel(deletionChannel)
    }
  }, [loadAdminPanelCount, showAdminPanel])

  const displayName = profile?.display_name || displayNameFromEmail(email)
  const avatarUrl = profile?.avatar_url || null
  const rentalXId = profile?.rentalx_id || buildRentalXId(currentUserId || email)
  const qrLogoSource = avatarUrl ? { uri: avatarUrl } : undefined
  const qrPayload = JSON.stringify({
    type: 'rentalx_profile',
    rentalx_id: rentalXId,
    user_id: currentUserId,
  })
  const isVerifiedOwner = getOwnerVerificationStatus(profile) === 'verified'

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

  async function copyRentalXId() {
    if (!rentalXId) return

    await Clipboard.setStringAsync(rentalXId)
    Alert.alert('Copied', 'Rental X ID copied.')
  }

  async function shareRentalXProfile() {
    if (!rentalXId) return

    try {
      await Share.share({
        title: 'Rental X contact',
        message: `${displayName || 'Rental X profile'}\nRental X ID: ${rentalXId}\nScan my QR code in Messages or search this ID to add me on Rental X.`,
      })
    } catch (error) {
      Alert.alert('Share failed', error?.message || 'Could not share this profile.')
    }
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

  async function updateNotificationPreference(key, value) {
    const previousMessages = notifyMessages
    const previousActivity = notifyActivity
    const nextMessages = key === 'notify_messages' ? value : notifyMessages
    const nextActivity = key === 'notify_activity' ? value : notifyActivity

    setNotifyMessages(nextMessages)
    setNotifyActivity(nextActivity)
    setNotificationSaving(true)

    const { error } = await supabase.auth.updateUser({
      data: {
        notify_messages: nextMessages,
        notify_activity: nextActivity,
      },
    })

    setNotificationSaving(false)

    if (error) {
      setNotifyMessages(previousMessages)
      setNotifyActivity(previousActivity)
      Alert.alert('Notification update failed', error.message)
    }
  }

  async function saveSecuritySettings() {
    const trimmedEmail = loginEmail.trim().toLowerCase()
    const emailChanged = Boolean(trimmedEmail && trimmedEmail !== (email || '').toLowerCase())
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

    if (emailChanged) {
      setEmail(trimmedEmail)
    }

    Alert.alert(
      'Security updated',
      emailChanged
        ? 'Check your email to confirm the new login address.'
        : 'Your password was updated successfully.'
    )
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
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top', 'left', 'right', 'bottom']}>
      <SwipeTabView navigation={navigation} activeTab="profile">
        <View style={{ flex: 1 }}>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 140 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
              <View
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: theme.border,
                  padding: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <TouchableOpacity
                  onPress={() => navigation.navigate('Settings')}
                  activeOpacity={0.86}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    minWidth: 0,
                  }}
                >
                  {avatarUrl ? (
                    <Image
                      source={{ uri: avatarUrl }}
                      style={{
                        width: 62,
                        height: 62,
                        borderRadius: 31,
                        backgroundColor: theme.surfaceMuted,
                        borderWidth: 2,
                        borderColor: theme.border,
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 62,
                        height: 62,
                        borderRadius: 31,
                        backgroundColor: theme.hero,
                        borderWidth: 2,
                        borderColor: theme.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 22, fontWeight: '900', color: theme.heroText }}>
                        {displayName ? displayName.charAt(0).toUpperCase() : 'U'}
                      </Text>
                    </View>
                  )}

                  <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text
                        numberOfLines={1}
                        style={{ color: theme.text, fontSize: 18, fontWeight: '900', flexShrink: 1 }}
                      >
                        {displayName || 'User'}
                      </Text>

                      {isVerifiedOwner ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={17}
                          color={theme.accent}
                          style={{ marginLeft: 5 }}
                        />
                      ) : null}
                    </View>

                    <View
                      style={{
                        alignSelf: 'flex-start',
                        marginTop: 7,
                        borderRadius: 999,
                        backgroundColor: theme.surfaceMuted,
                        borderWidth: 1,
                        borderColor: theme.border,
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                      }}
                    >
                      <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '900' }}>
                        Rental X ID  <Text style={{ color: theme.text }}>{rentalXId}</Text>
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setQrModalVisible(true)}
                  activeOpacity={0.86}
                  style={{
                    marginLeft: 12,
                    width: 44,
                    height: 44,
                    borderRadius: 16,
                    backgroundColor: theme.accentSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Ionicons name="qr-code-outline" size={22} color={theme.accent} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ padding: 16, gap: 16 }}>
              <ActionCard
                icon="wallet-outline"
                title="Wallet"
                theme={theme}
                onPress={() => navigation.navigate('Wallet')}
              />

              <View
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: theme.border,
                  overflow: 'hidden',
                }}
              >
                <TouchableOpacity
                  onPress={() => setGeneralSettingsExpanded((current) => !current)}
                  activeOpacity={0.86}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 15,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 12, flexDirection: 'row', alignItems: 'center' }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: theme.accentSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      <Ionicons name="color-palette-outline" size={20} color={theme.accent} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>
                        {t('profileGeneralSettings', 'General settings')}
                      </Text>
                    </View>
                  </View>

                  <Ionicons
                    name={generalSettingsExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.mutedText}
                  />
                </TouchableOpacity>

                {generalSettingsExpanded ? (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 14 }}>
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
                ) : null}
              </View>

              <View
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: theme.border,
                  overflow: 'hidden',
                }}
              >
                <TouchableOpacity
                  onPress={() => setAccountSettingsExpanded((current) => !current)}
                  activeOpacity={0.86}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 15,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 12, flexDirection: 'row', alignItems: 'center' }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: theme.accentSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                    >
                      <Ionicons name="settings-outline" size={20} color={theme.accent} />
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>
                        Account settings
                      </Text>
                    </View>
                  </View>

                  <Ionicons
                    name={accountSettingsExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.mutedText}
                  />
                </TouchableOpacity>

                {accountSettingsExpanded ? (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
                    <TouchableOpacity
                      onPress={() => navigation.navigate('VerificationCenter')}
                      activeOpacity={0.86}
                      style={{
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: theme.surfaceMuted,
                        padding: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                      }}
                    >
                      <Ionicons name="shield-checkmark-outline" size={19} color={theme.accent} />
                      <View style={{ flex: 1, marginLeft: 10, justifyContent: 'center' }}>
                        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
                          Verification center
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={17} color={theme.mutedText} />
                    </TouchableOpacity>

                    <View
                      style={{
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: theme.surfaceMuted,
                        overflow: 'hidden',
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => setNotificationSettingsExpanded((current) => !current)}
                        activeOpacity={0.86}
                        style={{
                          padding: 12,
                          flexDirection: 'row',
                          alignItems: 'center',
                        }}
                      >
                        <Ionicons name="notifications-outline" size={19} color={theme.accent} />
                        <View style={{ flex: 1, marginLeft: 10, justifyContent: 'center' }}>
                          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
                            Notification settings
                          </Text>
                        </View>
                        <Ionicons
                          name={notificationSettingsExpanded ? 'chevron-up' : 'chevron-down'}
                          size={17}
                          color={theme.mutedText}
                        />
                      </TouchableOpacity>

                      {notificationSettingsExpanded ? (
                        <View
                          style={{
                            borderTopWidth: 1,
                            borderTopColor: theme.border,
                            paddingHorizontal: 12,
                            paddingBottom: 6,
                          }}
                        >
                          <AccountToggleRow
                            title="Messages"
                            value={notifyMessages}
                            disabled={notificationSaving}
                            onValueChange={(value) => updateNotificationPreference('notify_messages', value)}
                            theme={theme}
                          />
                          <View style={{ height: 1, backgroundColor: theme.border }} />
                          <AccountToggleRow
                            title="Post and comment activity"
                            value={notifyActivity}
                            disabled={notificationSaving}
                            onValueChange={(value) => updateNotificationPreference('notify_activity', value)}
                            theme={theme}
                          />
                        </View>
                      ) : null}
                    </View>

                    <View
                      style={{
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: theme.surfaceMuted,
                        overflow: 'hidden',
                      }}
                    >
                      <TouchableOpacity
                        onPress={() => setSecuritySettingsExpanded((current) => !current)}
                        activeOpacity={0.86}
                        style={{
                          padding: 12,
                          flexDirection: 'row',
                          alignItems: 'center',
                        }}
                      >
                        <Ionicons name="lock-closed-outline" size={19} color={theme.accent} />
                        <View style={{ flex: 1, marginLeft: 10, justifyContent: 'center' }}>
                          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
                            Password and security
                          </Text>
                        </View>
                        <Ionicons
                          name={securitySettingsExpanded ? 'chevron-up' : 'chevron-down'}
                          size={17}
                          color={theme.mutedText}
                        />
                      </TouchableOpacity>

                      {securitySettingsExpanded ? (
                        <View
                          style={{
                            borderTopWidth: 1,
                            borderTopColor: theme.border,
                            padding: 12,
                            gap: 12,
                          }}
                        >
                          <AccountField
                            label="Login email"
                            value={loginEmail}
                            onChangeText={setLoginEmail}
                            placeholder="you@example.com"
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoComplete="email"
                            theme={theme}
                          />
                          <AccountField
                            label="New password"
                            value={newPassword}
                            onChangeText={setNewPassword}
                            placeholder="At least 6 characters"
                            secureTextEntry
                            autoCapitalize="none"
                            autoComplete="password-new"
                            theme={theme}
                          />
                          <AccountField
                            label="Confirm new password"
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            placeholder="Re-enter new password"
                            secureTextEntry
                            autoCapitalize="none"
                            autoComplete="password-new"
                            theme={theme}
                          />

                          <TouchableOpacity
                            onPress={saveSecuritySettings}
                            disabled={securitySaving}
                            activeOpacity={0.86}
                            style={{
                              minHeight: 44,
                              borderRadius: 14,
                              backgroundColor: securitySaving ? theme.accentSoft : theme.accent,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>
                              {securitySaving ? 'Updating...' : 'Update security'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      onPress={logout}
                      activeOpacity={0.86}
                      style={{
                        minHeight: 46,
                        borderRadius: 16,
                        backgroundColor: theme.surfaceMuted,
                        borderWidth: 1,
                        borderColor: theme.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                      }}
                    >
                      <Ionicons name="log-out-outline" size={18} color="#ef4444" />
                      <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '900', marginLeft: 8 }}>
                        Logout
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              <ActionCard
                icon="newspaper-outline"
                title={t('profileAdsManagement', 'Ads Management')}
                theme={theme}
                onPress={() => navigation.navigate('AdsManagement')}
              />

              {showAdminPanel ? (
                <ActionCard
                  icon="shield-checkmark-outline"
                  title={t('profileAdminPanel', 'Admin panel')}
                  badgeCount={adminPanelCount}
                  theme={theme}
                  onPress={() => navigation.navigate('AdminPanel')}
                />
              ) : null}
            </View>
          </ScrollView>

          {!embeddedTabShell ? (
            <BottomNavBar navigation={navigation} activeTab="profile" />
          ) : null}
        </View>
      </SwipeTabView>

      <Modal
        visible={qrModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setQrModalVisible(false)}
      >
        <Pressable
          onPress={() => setQrModalVisible(false)}
          style={{
            flex: 1,
            backgroundColor: 'rgba(2, 6, 23, 0.72)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: '100%',
              maxWidth: 330,
              borderRadius: 24,
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 18,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 18,
                backgroundColor: theme.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}
            >
              <Ionicons name="qr-code-outline" size={24} color={theme.accent} />
            </View>

            <Text style={{ color: theme.text, fontSize: 17, fontWeight: '900', textAlign: 'center' }}>
              {displayName || 'Rental X profile'}
            </Text>
            <Text
              selectable
              style={{
                color: theme.mutedText,
                fontSize: 12,
                fontWeight: '900',
                marginTop: 5,
                textAlign: 'center',
              }}
            >
              Rental X ID  <Text style={{ color: theme.text }}>{rentalXId}</Text>
            </Text>

            <View
              style={{
                marginTop: 16,
                padding: 14,
                borderRadius: 22,
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#e5e7eb',
              }}
            >
              <QRCode
                value={qrPayload}
                size={210}
                color="#020617"
                backgroundColor="#fff"
                logo={qrLogoSource}
                logoSize={46}
                logoBackgroundColor="#fff"
                logoMargin={5}
                logoBorderRadius={23}
                quietZone={6}
                ecl="H"
              />
            </View>

            <Text style={{ color: theme.mutedText, fontSize: 12, textAlign: 'center', marginTop: 13 }}>
              Scan from Messages to add this contact.
            </Text>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, width: '100%' }}>
              <TouchableOpacity
                onPress={() => setQrModalVisible(false)}
                activeOpacity={0.84}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 15,
                  backgroundColor: theme.surfaceMuted,
                  borderWidth: 1,
                  borderColor: theme.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: theme.text, fontWeight: '900' }}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={copyRentalXId}
                activeOpacity={0.84}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 15,
                  backgroundColor: theme.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                }}
              >
                <Ionicons name="copy-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={{ color: '#fff', fontWeight: '900' }}>Copy ID</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={shareRentalXProfile}
                activeOpacity={0.84}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 15,
                  backgroundColor: theme.accentSoft,
                  borderWidth: 1,
                  borderColor: theme.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                }}
              >
                <Ionicons name="share-social-outline" size={16} color={theme.accent} style={{ marginRight: 6 }} />
                <Text style={{ color: theme.accentStrong, fontWeight: '900' }}>Share</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
