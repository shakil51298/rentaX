import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { isPrimaryAdmin } from '../lib/admin'
import {
  dismissPropertyReport,
  dismissUserReport,
  fetchAdminReportQueue,
} from '../lib/reporting'
import { createNotification } from '../lib/notifications'

function formatReason(reason) {
  const map = {
    scam: 'Scam or fraud',
    spam: 'Spam',
    fake: 'Fake information',
    abuse: 'Abusive or unsafe',
    duplicate: 'Duplicate listing',
    other: 'Other',
  }

  return map[reason] || 'Report'
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)

  if (!date || Number.isNaN(seconds)) return ''
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function SectionTitle({ title, count }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 18 }}>
        {title}
      </Text>
      <View
        style={{
          marginLeft: 8,
          minWidth: 22,
          height: 22,
          borderRadius: 11,
          paddingHorizontal: 6,
          backgroundColor: '#2563eb',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>
          {count}
        </Text>
      </View>
    </View>
  )
}

function ActionPill({ title, icon, tint = '#2563eb', onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#eff6ff',
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginRight: 8,
        marginTop: 8,
      }}
    >
      <Ionicons name={icon} size={14} color={tint} />
      <Text style={{ color: tint, fontSize: 12, fontWeight: '800', marginLeft: 6 }}>
        {title}
      </Text>
    </TouchableOpacity>
  )
}

function ReportCard({
  title,
  subtitle,
  detail,
  timeLabel,
  onPrimaryPress,
  onDismissPress,
  primaryTitle,
  secondaryActions,
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 15,
        marginBottom: 12,
      }}
    >
      <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 15 }}>
        {title}
      </Text>
      <Text style={{ color: '#475569', marginTop: 5, lineHeight: 19 }}>
        {subtitle}
      </Text>
      {detail ? (
        <Text style={{ color: '#64748b', marginTop: 8, lineHeight: 19 }}>
          {detail}
        </Text>
      ) : null}
      <Text style={{ color: '#94a3b8', marginTop: 8, fontSize: 12, fontWeight: '700' }}>
        {timeLabel}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
        <ActionPill title={primaryTitle} icon="open-outline" onPress={onPrimaryPress} />
        {secondaryActions?.map((action) => (
          <ActionPill
            key={action.title}
            title={action.title}
            icon={action.icon}
            tint={action.tint}
            onPress={action.onPress}
          />
        ))}
        <ActionPill
          title="Dismiss"
          icon="checkmark-done-outline"
          tint="#64748b"
          onPress={onDismissPress}
        />
      </View>
    </View>
  )
}

export default function AdminReportsScreen({ navigation }) {
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [adminUser, setAdminUser] = useState(null)
  const [queue, setQueue] = useState({
    userReports: [],
    propertyReports: [],
  })

  const loadQueue = useCallback(async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    setAdminUser(user || null)
    const allowed = isPrimaryAdmin(user)
    setAuthorized(allowed)

    if (!allowed) {
      setQueue({ userReports: [], propertyReports: [] })
      setLoading(false)
      return
    }

    try {
      setQueue(await fetchAdminReportQueue())
    } catch (_error) {
      setQueue({ userReports: [], propertyReports: [] })
    }

    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadQueue()
    }, [loadQueue])
  )

  useEffect(() => {
    if (!authorized) return undefined

    const refresh = () => {
      loadQueue()
    }

    const userReportChannel = supabase
      .channel(`admin-user-reports-${Date.now()}-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_reports' }, refresh)
      .subscribe()

    const propertyReportChannel = supabase
      .channel(`admin-property-reports-${Date.now()}-${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'property_reports' }, refresh)
      .subscribe()

    return () => {
      supabase.removeChannel(userReportChannel)
      supabase.removeChannel(propertyReportChannel)
    }
  }, [authorized, loadQueue])

  async function hideReportedPost(report) {
    const property = report?.property
    if (!property?.id) return

    const { error } = await supabase
      .from('properties')
      .update({
        admin_is_banned: true,
        admin_ban_reason: `Reported for ${formatReason(report.reason)}`,
        admin_banned_at: new Date().toISOString(),
        admin_banned_by_email: adminUser?.email || null,
      })
      .eq('id', property.id)

    if (error) {
      Alert.alert('Moderation failed', error.message)
      return
    }

    await dismissPropertyReport(report.id, adminUser?.email || null)
    await createNotification({
      recipientId: property.owner_id,
      actorId: adminUser?.id,
      type: 'property_banned_by_admin',
      propertyId: property.id,
      title: 'Ad hidden by admin',
      body: 'Your ad was hidden from live feeds. Tap to contact customer care.',
      eventKey: `property_banned_by_admin:${property.id}:${Date.now()}`,
      pushData: {
        propertyTitle: property.title || '',
        propertyLocation: property.location || '',
        propertyPrice: property.price || '',
        banReason: `Reported for ${formatReason(report.reason)}`,
      },
    })
    loadQueue()
  }

  async function dismissUser(report) {
    const { error } = await dismissUserReport(report.id, adminUser?.email || null)
    if (error) {
      Alert.alert('Dismiss failed', error.message)
      return
    }
    loadQueue()
  }

  async function dismissProperty(report) {
    const { error } = await dismissPropertyReport(report.id, adminUser?.email || null)
    if (error) {
      Alert.alert('Dismiss failed', error.message)
      return
    }
    loadQueue()
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
          <View style={{ backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e2e8f0', padding: 16 }}>
            <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '900' }}>Admin only</Text>
            <Text style={{ color: '#64748b', marginTop: 8, lineHeight: 20 }}>
              This report queue is only available for your first-level admin account.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 28 }}
      >
        <Text style={{ color: '#64748b', marginBottom: 14, lineHeight: 20 }}>
          Review user safety reports, open the reported content, and clear items from the queue as you handle them.
        </Text>

        <SectionTitle title="Post reports" count={queue.propertyReports.length} />
        {queue.propertyReports.length ? (
          queue.propertyReports.map((report) => (
            <ReportCard
              key={report.id}
              title={report.property?.title || 'Reported property'}
              subtitle={`${report.reporter_profile?.display_name || report.reporter_profile?.email || 'A user'} reported this post for ${formatReason(report.reason).toLowerCase()}.`}
              detail={report.details || report.property?.location || ''}
              timeLabel={timeAgo(report.created_at)}
              primaryTitle="Open post"
              onPrimaryPress={() => navigation.navigate('Property', { property: report.property })}
              onDismissPress={() => dismissProperty(report)}
              secondaryActions={[
                {
                  title: 'Open owner',
                  icon: 'person-outline',
                  tint: '#2563eb',
                  onPress: () => navigation.navigate('AdminUserDetail', {
                    userId: report.target_user_id,
                  }),
                },
                {
                  title: 'Hide post',
                  icon: 'ban-outline',
                  tint: '#dc2626',
                  onPress: () => hideReportedPost(report),
                },
              ]}
            />
          ))
        ) : (
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 18 }}>
            <Text style={{ color: '#64748b' }}>No pending post reports right now.</Text>
          </View>
        )}

        <SectionTitle title="User reports" count={queue.userReports.length} />
        {queue.userReports.length ? (
          queue.userReports.map((report) => (
            <ReportCard
              key={report.id}
              title={report.target_profile?.display_name || report.target_profile?.email || 'Reported user'}
              subtitle={`${report.reporter_profile?.display_name || report.reporter_profile?.email || 'A user'} reported this account for ${formatReason(report.reason).toLowerCase()}.`}
              detail={report.details || ''}
              timeLabel={timeAgo(report.created_at)}
              primaryTitle="Open user"
              onPrimaryPress={() => navigation.navigate('AdminUserDetail', {
                userId: report.target_user_id,
              })}
              onDismissPress={() => dismissUser(report)}
            />
          ))
        ) : (
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' }}>
            <Text style={{ color: '#64748b' }}>No pending user reports right now.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
