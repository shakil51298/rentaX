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

function formatDate(value) {
  if (!value) return 'Not available'

  try {
    return new Date(value).toLocaleString()
  } catch (_error) {
    return 'Not available'
  }
}

function Avatar({ user }) {
  if (user?.avatar_url) {
    return (
      <Image
        source={{ uri: user.avatar_url }}
        style={{ width: 74, height: 74, borderRadius: 37, backgroundColor: '#e2e8f0' }}
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
        backgroundColor: '#dbeafe',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#1d4ed8', fontSize: 28, fontWeight: '900' }}>{initial}</Text>
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

function SectionCard({ title, subtitle, children, right }) {
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#0f172a', fontSize: 17, fontWeight: '900' }}>{title}</Text>
          {subtitle ? (
            <Text style={{ color: '#64748b', marginTop: 4, lineHeight: 19 }}>{subtitle}</Text>
          ) : null}
        </View>
        {right || null}
      </View>
      <View style={{ marginTop: 14 }}>{children}</View>
    </View>
  )
}

function TableRow({ label, value, multiline }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: multiline ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eef2f7',
        gap: 16,
      }}
    >
      <Text style={{ color: '#475569', fontSize: 12, fontWeight: '800', width: 120 }}>
        {label}
      </Text>
      <Text
        style={{ flex: 1, color: '#0f172a', fontSize: 13, fontWeight: '700', textAlign: 'right' }}
        selectable
      >
        {value || 'Not available'}
      </Text>
    </View>
  )
}

function CountTile({ icon, label, value, tint }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#f8fafc',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 12,
      }}
    >
      <Ionicons name={icon} size={16} color={tint} />
      <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '900', marginTop: 8 }}>
        {value}
      </Text>
      <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '800', marginTop: 4 }}>
        {label}
      </Text>
    </View>
  )
}

export default function AdminUserDetailScreen({ navigation, route }) {
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
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#f7f7f7' }}>
        <ActivityIndicator />
      </View>
    )
  }

  if (!authorized) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
          <SectionCard title="Admin only">
            <Text style={{ color: '#64748b', lineHeight: 20 }}>
              This user detail page is only available for your first-level admin account.
            </Text>
          </SectionCard>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SectionCard
          title={userDetail?.display_name || userDetail?.email || 'User detail'}
          subtitle={userDetail?.email || 'No email'}
          right={<StatusChip label={verificationMeta.label} color={verificationMeta.textColor} background={verificationMeta.backgroundColor} border={verificationMeta.borderColor} />}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Avatar user={userDetail} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <StatusChip
                  label={userDetail?.user_type === 'property_owner' ? 'Property owner' : 'Finding property'}
                  color="#475569"
                  background="#f8fafc"
                  border="#e2e8f0"
                />
                {userDetail?.admin_is_banned ? (
                  <StatusChip label="Banned" color="#dc2626" background="#fef2f2" border="#fecaca" />
                ) : null}
                {presence?.is_online ? (
                  <StatusChip label="Online" color="#16a34a" background="#ecfdf5" border="#bbf7d0" />
                ) : null}
              </View>

              {userDetail?.location ? (
                <Text style={{ color: '#64748b', fontSize: 13, marginTop: 10 }}>
                  {userDetail.location}
                </Text>
              ) : null}
            </View>
          </View>
        </SectionCard>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
          <CountTile icon="newspaper-outline" label="Posts" value={socialCounts.posts} tint="#2563eb" />
          <CountTile icon="people-outline" label="Followers" value={socialCounts.followers} tint="#16a34a" />
          <CountTile icon="person-add-outline" label="Following" value={socialCounts.following} tint="#ea580c" />
          <CountTile icon="ban-outline" label="Blocked" value={socialCounts.blocked} tint="#dc2626" />
        </View>

        <SectionCard title="Account details" subtitle="Core account information in one place.">
          <TableRow label="User ID" value={userDetail?.user_id} />
          <TableRow label="Display name" value={userDetail?.display_name} />
          <TableRow label="Email" value={userDetail?.email} />
          <TableRow label="Phone" value={userDetail?.phone} />
          <TableRow label="User type" value={userDetail?.user_type === 'property_owner' ? 'Property owner' : 'Finding property'} />
          <TableRow label="Profile location" value={userDetail?.location} />
          <TableRow label="Bio" value={userDetail?.bio} multiline />
        </SectionCard>

        <SectionCard title="Verification & security" subtitle="Security-relevant details available in the current app build.">
          <TableRow label="Owner verify" value={verificationMeta.label} />
          <TableRow label="Requested at" value={formatDate(userDetail?.owner_verification_requested_at)} />
          <TableRow label="Reviewed at" value={formatDate(userDetail?.owner_verification_reviewed_at)} />
          <TableRow label="Rejected note" value={userDetail?.owner_verification_rejection_reason} />
          <TableRow label="Last location" value={userDetail?.location} />
          <TableRow label="Last offline" value={presence?.last_seen_at ? formatDate(presence.last_seen_at) : presence?.is_online ? 'Currently online' : 'Not available'} />
          <TableRow label="Device platform" value={platformsLabel} />
          <TableRow label="Last device seen" value={lastDeviceSeen} />
          <TableRow label="IP address" value="Not captured by current app build" />
        </SectionCard>

        <SectionCard title="Admin controls" subtitle="Ban or unban this user and keep a simple record.">
          <TextInput
            value={banReason}
            onChangeText={setBanReason}
            placeholder="Ban reason"
            placeholderTextColor="#94a3b8"
            multiline
            style={{
              backgroundColor: '#f8fafc',
              borderRadius: 14,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              paddingHorizontal: 12,
              paddingVertical: 12,
              minHeight: 78,
              textAlignVertical: 'top',
              color: '#0f172a',
              marginBottom: 12,
            }}
          />

          <TableRow label="Ban status" value={userDetail?.admin_is_banned ? 'Banned' : 'Active'} />
          <TableRow label="Banned at" value={formatDate(userDetail?.admin_banned_at)} />
          <TableRow label="Banned by" value={userDetail?.admin_banned_by_email} />
          <TableRow label="Ban reason" value={userDetail?.admin_ban_reason} />

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
                backgroundColor: '#1877F2',
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
