import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
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
import { fetchUserSocialCounts } from '../lib/social'
import { getOwnerVerificationStatus, getVerificationMeta } from '../lib/verification'
import { useAppSettings } from '../lib/appSettings'

function withAlpha(hexColor, alphaHex) {
  const cleanHex = String(hexColor || '').replace('#', '')

  if (cleanHex.length !== 6) {
    return `#000000${alphaHex}`
  }

  return `#${cleanHex}${alphaHex}`
}

function formatDate(value) {
  if (!value) return 'Not available'

  try {
    return new Date(value).toLocaleString()
  } catch (_error) {
    return 'Not available'
  }
}

function Avatar({ user, theme }) {
  if (user?.avatar_url) {
    return (
      <Image
        source={{ uri: user.avatar_url }}
        style={{ width: 74, height: 74, borderRadius: 37, backgroundColor: theme.surfaceMuted }}
      />
    )
  }

  const initial = (user?.display_name || user?.email || 'U').charAt(0).toUpperCase()

  return (
    <View
      style={{
        width: 74,
        height: 74,
        borderRadius: 37,
        backgroundColor: theme.hero,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: theme.heroText, fontSize: 28, fontWeight: '900' }}>{initial}</Text>
    </View>
  )
}

function StatusChip({ label, color, background, border }) {
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: background,
        borderWidth: 1,
        borderColor: border,
      }}
    >
      <Text style={{ color, fontSize: 12, fontWeight: '900' }}>{label}</Text>
    </View>
  )
}

function SectionCard({ title, subtitle, children, right, theme }) {
  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.border,
        padding: 16,
        marginBottom: 14,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: '900' }}>{title}</Text>
          {subtitle ? (
            <Text style={{ color: theme.mutedText, marginTop: 4, lineHeight: 19 }}>{subtitle}</Text>
          ) : null}
        </View>
        {right || null}
      </View>
      <View style={{ marginTop: 14 }}>{children}</View>
    </View>
  )
}

function TableRow({ label, value, multiline, theme }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: multiline ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        gap: 16,
      }}
    >
      <Text style={{ color: theme.mutedText, fontSize: 12, fontWeight: '800', width: 120 }}>
        {label}
      </Text>
      <Text
        style={{ flex: 1, color: theme.text, fontSize: 13, fontWeight: '700', textAlign: 'right' }}
        selectable
      >
        {value || 'Not available'}
      </Text>
    </View>
  )
}

function CountTile({ icon, label, value, tint, onPress, theme }) {
  const content = (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.surfaceMuted,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.border,
        padding: 12,
      }}
    >
      <Ionicons name={icon} size={16} color={tint} />
      <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900', marginTop: 8 }}>
        {value}
      </Text>
      <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '800', marginTop: 4 }}>
        {label}
      </Text>
    </View>
  )

  if (!onPress) {
    return content
  }

  return (
    <TouchableOpacity activeOpacity={0.86} onPress={onPress} style={{ flex: 1 }}>
      {content}
    </TouchableOpacity>
  )
}

export default function AdminUserDetailScreen({ navigation, route }) {
  const { theme } = useAppSettings()
  const targetUserId = route?.params?.userId || null
  const fallbackUser = route?.params?.fallbackUser || null

  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [userDetail, setUserDetail] = useState(fallbackUser)
  const [socialCounts, setSocialCounts] = useState({
    posts: 0,
    followers: 0,
    following: 0,
    blocked: 0,
  })
  const [presence, setPresence] = useState(null)
  const [pushTokens, setPushTokens] = useState([])
  const [banReason, setBanReason] = useState('')
  const [savingBan, setSavingBan] = useState(false)

  const loadUserDetail = useCallback(async () => {
    setLoading(true)

    const {
      data: { user: adminUser },
    } = await supabase.auth.getUser()

    const allowed = isPrimaryAdmin(adminUser)
    setAuthorized(allowed)

    if (!allowed || !targetUserId) {
      setLoading(false)
      return
    }

    const [{ data: profile }, counts, { data: presenceRow }, { data: tokenRows }] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', targetUserId)
        .maybeSingle(),
      fetchUserSocialCounts(targetUserId),
      supabase
        .from('user_presence')
        .select('user_id, is_online, last_seen_at, updated_at')
        .eq('user_id', targetUserId)
        .maybeSingle(),
      supabase
        .from('user_push_tokens')
        .select('platform, is_active, last_registered_at, updated_at')
        .eq('user_id', targetUserId)
        .order('updated_at', { ascending: false }),
    ])

    setUserDetail(profile || fallbackUser || null)
    setSocialCounts(counts)
    setPresence(presenceRow || null)
    setPushTokens(tokenRows || [])
    setBanReason(profile?.admin_ban_reason || '')
    setLoading(false)
  }, [fallbackUser, targetUserId])

  useFocusEffect(
    useCallback(() => {
      loadUserDetail()
    }, [loadUserDetail])
  )

  useEffect(() => {
    if (!authorized || !targetUserId) return undefined

    const refresh = () => {
      loadUserDetail()
    }

    const profileChannel = supabase
      .channel(`admin-user-detail-profile-${targetUserId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles', filter: `user_id=eq.${targetUserId}` },
        refresh
      )
      .subscribe()

    const presenceChannel = supabase
      .channel(`admin-user-detail-presence-${targetUserId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_presence', filter: `user_id=eq.${targetUserId}` },
        refresh
      )
      .subscribe()

    const pushChannel = supabase
      .channel(`admin-user-detail-push-${targetUserId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_push_tokens', filter: `user_id=eq.${targetUserId}` },
        refresh
      )
      .subscribe()

    return () => {
      supabase.removeChannel(profileChannel)
      supabase.removeChannel(presenceChannel)
      supabase.removeChannel(pushChannel)
    }
  }, [authorized, loadUserDetail, targetUserId])

  const ownerVerificationStatus = getOwnerVerificationStatus(userDetail)
  const verificationMeta = getVerificationMeta(ownerVerificationStatus, {
    verifiedLabel: 'Verified owner',
    pendingLabel: 'Pending review',
    rejectedLabel: 'Rejected',
    defaultLabel: 'Not verified',
  })

  const platformsLabel = useMemo(() => {
    const uniquePlatforms = [...new Set(pushTokens.map((item) => item.platform).filter(Boolean))]
    return uniquePlatforms.length ? uniquePlatforms.join(', ') : 'Not available'
  }, [pushTokens])

  const lastDeviceSeen = useMemo(() => {
    if (!pushTokens.length) return 'Not available'
    return formatDate(pushTokens[0]?.updated_at || pushTokens[0]?.last_registered_at)
  }, [pushTokens])

  async function toggleBan() {
    if (!authorized || !targetUserId || !userDetail) return

    const nextBanned = !Boolean(userDetail.admin_is_banned)

    if (nextBanned && !banReason.trim()) {
      return
    }

    setSavingBan(true)

    const {
      data: { user: adminUser },
    } = await supabase.auth.getUser()

    const { error } = await supabase
      .from('user_profiles')
      .update({
        admin_is_banned: nextBanned,
        admin_ban_reason: nextBanned ? banReason.trim() : null,
        admin_banned_at: nextBanned ? new Date().toISOString() : null,
        admin_banned_by_email: nextBanned ? adminUser?.email || null : null,
      })
      .eq('user_id', targetUserId)

    setSavingBan(false)

    if (error) {
      return
    }

    loadUserDetail()
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  if (!authorized) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
          <SectionCard title="Admin only" theme={theme}>
            <Text style={{ color: theme.mutedText, lineHeight: 20 }}>
              This user detail page is only available for your first-level admin account.
            </Text>
          </SectionCard>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SectionCard
          title={userDetail?.display_name || userDetail?.email || 'User detail'}
          subtitle={userDetail?.email || 'No email'}
          right={
            <StatusChip
              label={verificationMeta.label}
              color={verificationMeta.textColor}
              background={withAlpha(verificationMeta.textColor, '20')}
              border={withAlpha(verificationMeta.textColor, '44')}
            />
          }
          theme={theme}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Avatar user={userDetail} theme={theme} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <StatusChip
                  label={userDetail?.user_type === 'property_owner' ? 'Property owner' : 'Finding property'}
                  color={theme.mutedText}
                  background={theme.surfaceMuted}
                  border={theme.border}
                />
                {userDetail?.admin_is_banned ? (
                  <StatusChip
                    label="Banned"
                    color="#dc2626"
                    background={withAlpha('#dc2626', '20')}
                    border={withAlpha('#dc2626', '44')}
                  />
                ) : null}
                {presence?.is_online ? (
                  <StatusChip
                    label="Online"
                    color="#16a34a"
                    background={withAlpha('#16a34a', '20')}
                    border={withAlpha('#16a34a', '44')}
                  />
                ) : null}
              </View>

              {userDetail?.location ? (
                <Text style={{ color: theme.mutedText, fontSize: 13, marginTop: 10 }}>
                  {userDetail.location}
                </Text>
              ) : null}
            </View>
          </View>
        </SectionCard>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
          <CountTile
            icon="newspaper-outline"
            label="Posts"
            value={socialCounts.posts}
            tint="#2563eb"
            theme={theme}
            onPress={() =>
              navigation.navigate('AdminUserPosts', {
                userId: targetUserId,
                ownerName: userDetail?.display_name || userDetail?.email || 'User posts',
              })
            }
          />
          <CountTile
            icon="people-outline"
            label="Followers"
            value={socialCounts.followers}
            tint="#16a34a"
            theme={theme}
            onPress={() =>
              navigation.navigate('Connections', {
                userId: targetUserId,
                kind: 'followers',
                title: 'Followers',
                isOwnProfile: false,
                readOnly: true,
                showBlockListButton: false,
              })
            }
          />
          <CountTile
            icon="person-add-outline"
            label="Following"
            value={socialCounts.following}
            tint="#ea580c"
            theme={theme}
            onPress={() =>
              navigation.navigate('Connections', {
                userId: targetUserId,
                kind: 'following',
                title: 'Following',
                isOwnProfile: false,
                readOnly: true,
                showBlockListButton: false,
              })
            }
          />
          <CountTile
            icon="ban-outline"
            label="Blocked"
            value={socialCounts.blocked}
            tint="#dc2626"
            theme={theme}
            onPress={() =>
              navigation.navigate('BlockList', {
                userId: targetUserId,
                title: 'Blocked users',
                isOwnProfile: false,
                readOnly: true,
              })
            }
          />
        </View>

        <SectionCard title="Account details" subtitle="Core account information in one place." theme={theme}>
          <TableRow label="User ID" value={userDetail?.user_id} theme={theme} />
          <TableRow label="Display name" value={userDetail?.display_name} theme={theme} />
          <TableRow label="Email" value={userDetail?.email} theme={theme} />
          <TableRow label="Phone" value={userDetail?.phone} theme={theme} />
          <TableRow label="User type" value={userDetail?.user_type === 'property_owner' ? 'Property owner' : 'Finding property'} theme={theme} />
          <TableRow label="Profile location" value={userDetail?.location} theme={theme} />
          <TableRow label="Bio" value={userDetail?.bio} multiline theme={theme} />
        </SectionCard>

        <SectionCard title="Verification & security" subtitle="Security-relevant details available in the current app build." theme={theme}>
          <TableRow label="Owner verify" value={verificationMeta.label} theme={theme} />
          <TableRow label="Requested at" value={formatDate(userDetail?.owner_verification_requested_at)} theme={theme} />
          <TableRow label="Reviewed at" value={formatDate(userDetail?.owner_verification_reviewed_at)} theme={theme} />
          <TableRow label="Rejected note" value={userDetail?.owner_verification_rejection_reason} theme={theme} />
          <TableRow label="Last location" value={userDetail?.location} theme={theme} />
          <TableRow label="Last offline" value={presence?.last_seen_at ? formatDate(presence.last_seen_at) : presence?.is_online ? 'Currently online' : 'Not available'} theme={theme} />
          <TableRow label="Device platform" value={platformsLabel} theme={theme} />
          <TableRow label="Last device seen" value={lastDeviceSeen} theme={theme} />
          <TableRow label="IP address" value="Not captured by current app build" theme={theme} />
        </SectionCard>

        <SectionCard title="Admin controls" subtitle="Ban or unban this user and keep a simple record." theme={theme}>
          <TextInput
            value={banReason}
            onChangeText={setBanReason}
            placeholder="Ban reason"
            placeholderTextColor={theme.mutedText}
            multiline
            style={{
              backgroundColor: theme.surfaceMuted,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.border,
              paddingHorizontal: 12,
              paddingVertical: 12,
              minHeight: 78,
              textAlignVertical: 'top',
              color: theme.text,
              marginBottom: 12,
            }}
          />

          <TableRow label="Ban status" value={userDetail?.admin_is_banned ? 'Banned' : 'Active'} theme={theme} />
          <TableRow label="Banned at" value={formatDate(userDetail?.admin_banned_at)} theme={theme} />
          <TableRow label="Banned by" value={userDetail?.admin_banned_by_email} theme={theme} />
          <TableRow label="Ban reason" value={userDetail?.admin_ban_reason} theme={theme} />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              onPress={toggleBan}
              disabled={savingBan || (!userDetail?.admin_is_banned && !banReason.trim())}
              style={{
                flex: 1,
                borderRadius: 14,
                backgroundColor: userDetail?.admin_is_banned ? '#16a34a' : '#dc2626',
                paddingVertical: 13,
                alignItems: 'center',
                opacity: savingBan || (!userDetail?.admin_is_banned && !banReason.trim()) ? 0.6 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '900' }}>
                {savingBan
                  ? 'Saving...'
                  : userDetail?.admin_is_banned
                    ? 'Unban user'
                    : 'Ban user'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                navigation.navigate('OwnerProfile', {
                  owner: {
                    id: userDetail?.user_id,
                    name: userDetail?.display_name || userDetail?.email || 'User',
                  },
                })
              }
              style={{
                flex: 1,
                borderRadius: 14,
                backgroundColor: theme.accent,
                paddingVertical: 13,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '900' }}>Open public profile</Text>
            </TouchableOpacity>
          </View>
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  )
}
