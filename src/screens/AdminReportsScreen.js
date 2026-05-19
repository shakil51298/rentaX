import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import {
  fetchAdminReportQueue,
  formatReportReason,
  getCaseStatusMeta,
  updatePropertyCase,
  updateUserCase,
} from '../lib/reporting'
import { createNotification } from '../lib/notifications'

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
  report,
  adminReplyDraft,
  onChangeReply,
  onPrimaryPress,
  onDismissPress,
  primaryTitle,
  secondaryActions,
}) {
  const caseMeta = getCaseStatusMeta(report?.case_status)

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
      <View
        style={{
          alignSelf: 'flex-start',
          marginTop: 8,
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 999,
          borderWidth: 1,
          borderColor: caseMeta.border,
          backgroundColor: caseMeta.background,
          paddingHorizontal: 9,
          paddingVertical: 5,
        }}
      >
        <Ionicons name={caseMeta.icon} size={12} color={caseMeta.tint} />
        <Text style={{ color: caseMeta.tint, fontSize: 11, fontWeight: '900', marginLeft: 5 }}>
          {caseMeta.label}
        </Text>
      </View>
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

      {report?.appeal_message ? (
        <View
          style={{
            marginTop: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: '#ddd6fe',
            backgroundColor: '#f5f3ff',
            padding: 11,
          }}
        >
          <Text style={{ color: '#6d28d9', fontSize: 11, fontWeight: '900' }}>Appeal submitted</Text>
          <Text style={{ color: '#5b21b6', lineHeight: 19, marginTop: 5 }}>
            {report.appeal_message}
          </Text>
        </View>
      ) : null}

      {report?.admin_reply ? (
        <View
          style={{
            marginTop: 10,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: '#dbeafe',
            backgroundColor: '#eff6ff',
            padding: 11,
          }}
        >
          <Text style={{ color: '#1d4ed8', fontSize: 11, fontWeight: '900' }}>Admin reply</Text>
          <Text style={{ color: '#1e3a8a', lineHeight: 19, marginTop: 5 }}>
            {report.admin_reply}
          </Text>
        </View>
      ) : null}

      <TextInput
        value={adminReplyDraft}
        onChangeText={onChangeReply}
        placeholder="Write an admin reply or resolution note..."
        multiline
        textAlignVertical="top"
        style={{
          marginTop: 10,
          minHeight: 84,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: '#dbe4ee',
          backgroundColor: '#f8fafc',
          paddingHorizontal: 12,
          paddingVertical: 11,
          color: '#0f172a',
          fontSize: 13,
        }}
      />

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
    resolvedUserReports: [],
    resolvedPropertyReports: [],
  })
  const [replyDrafts, setReplyDrafts] = useState({})

  const loadQueue = useCallback(async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    setAdminUser(user || null)
    const allowed = isPrimaryAdmin(user)
      setAuthorized(allowed)

    if (!allowed) {
      setQueue({ userReports: [], propertyReports: [], resolvedUserReports: [], resolvedPropertyReports: [] })
      setLoading(false)
      return
    }

    try {
      setQueue(await fetchAdminReportQueue())
    } catch (_error) {
      setQueue({ userReports: [], propertyReports: [], resolvedUserReports: [], resolvedPropertyReports: [] })
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
        admin_ban_reason: `Reported for ${formatReportReason(report.reason)}`,
        admin_banned_at: new Date().toISOString(),
        admin_banned_by_email: adminUser?.email || null,
      })
      .eq('id', property.id)

    if (error) {
      Alert.alert('Moderation failed', error.message)
      return
    }

    const replyText = replyDrafts[report.id] || `Post hidden after review for ${formatReportReason(report.reason).toLowerCase()}.`
    const { error: caseError } = await updatePropertyCase({
      reportId: report.id,
      reviewerEmail: adminUser?.email || null,
      reportStatus: 'actioned',
      caseStatus: 'unresolved',
      adminReply: replyText,
    })

    if (caseError) {
      Alert.alert('Case update failed', caseError.message)
      return
    }
    await createNotification({
      recipientId: property.owner_id,
      actorId: adminUser?.id,
      type: 'property_banned_by_admin',
      propertyId: property.id,
      title: 'Ad hidden by admin',
      body: 'Your ad was hidden from live feeds. Tap to review the case and appeal if needed.',
      eventKey: `property_banned_by_admin:${property.id}:${Date.now()}`,
      pushData: {
        propertyTitle: property.title || '',
        propertyLocation: property.location || '',
        propertyPrice: property.price || '',
        banReason: replyText,
      },
    })
    loadQueue()
  }

  function updateReplyDraft(reportId, value) {
    setReplyDrafts((current) => ({
      ...current,
      [reportId]: value,
    }))
  }

  async function resolveUser(report) {
    const { error } = await updateUserCase({
      reportId: report.id,
      reviewerEmail: adminUser?.email || null,
      reportStatus: 'dismissed',
      caseStatus: 'resolved',
      adminReply: replyDrafts[report.id],
    })
    if (error) {
      Alert.alert('Case update failed', error.message)
      return
    }
    await createNotification({
      recipientId: report.reporter_id,
      actorId: adminUser?.id,
      type: 'customer_care_case_updated',
      title: 'Report case updated',
      body: 'Admin replied to one of your user reports.',
      eventKey: `customer_care_case_updated:user:${report.id}:${Date.now()}`,
    })
    loadQueue()
  }

  async function resolveProperty(report) {
    const { error } = await updatePropertyCase({
      reportId: report.id,
      reviewerEmail: adminUser?.email || null,
      reportStatus: report.status === 'pending' ? 'dismissed' : report.status,
      caseStatus: 'resolved',
      adminReply: replyDrafts[report.id],
    })
    if (error) {
      Alert.alert('Case update failed', error.message)
      return
    }
    await createNotification({
      recipientId: report.target_user_id,
      actorId: adminUser?.id,
      type: 'customer_care_case_updated',
      propertyId: report.property_id,
      title: 'Customer care case updated',
      body: 'Admin replied to your moderated property case.',
      eventKey: `customer_care_case_updated:property:${report.id}:${Date.now()}`,
      pushData: {
        propertyTitle: report.property?.title || '',
      },
    })
    loadQueue()
  }

  async function markPropertyUnresolved(report) {
    const { error } = await updatePropertyCase({
      reportId: report.id,
      reviewerEmail: adminUser?.email || null,
      reportStatus: report.status === 'pending' ? 'actioned' : report.status,
      caseStatus: 'unresolved',
      adminReply: replyDrafts[report.id],
    })
    if (error) {
      Alert.alert('Case update failed', error.message)
      return
    }
    await createNotification({
      recipientId: report.target_user_id,
      actorId: adminUser?.id,
      type: 'customer_care_case_updated',
      propertyId: report.property_id,
      title: 'Customer care case updated',
      body: 'Admin replied to your moderated property case.',
      eventKey: `customer_care_case_updated:property:${report.id}:${Date.now()}`,
      pushData: {
        propertyTitle: report.property?.title || '',
      },
    })
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
          Review safety cases, respond to appeals, and keep a small history of what has been resolved already.
        </Text>

        <SectionTitle title="Post reports" count={queue.propertyReports.length} />
        {queue.propertyReports.length ? (
          queue.propertyReports.map((report) => (
            <ReportCard
              key={report.id}
              title={report.property?.title || 'Reported property'}
              report={report}
              adminReplyDraft={replyDrafts[report.id] || ''}
              onChangeReply={(value) => updateReplyDraft(report.id, value)}
              subtitle={`${report.reporter_profile?.display_name || report.reporter_profile?.email || 'A user'} reported this post for ${formatReportReason(report.reason).toLowerCase()}.`}
              detail={report.details || report.property?.location || ''}
              timeLabel={timeAgo(report.created_at)}
              primaryTitle="Open post"
              onPrimaryPress={() => navigation.navigate('Property', { property: report.property })}
              onDismissPress={() => resolveProperty(report)}
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
                {
                  title: 'Leave unresolved',
                  icon: 'time-outline',
                  tint: '#ea580c',
                  onPress: () => markPropertyUnresolved(report),
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
              report={report}
              adminReplyDraft={replyDrafts[report.id] || ''}
              onChangeReply={(value) => updateReplyDraft(report.id, value)}
              subtitle={`${report.reporter_profile?.display_name || report.reporter_profile?.email || 'A user'} reported this account for ${formatReportReason(report.reason).toLowerCase()}.`}
              detail={report.details || ''}
              timeLabel={timeAgo(report.created_at)}
              primaryTitle="Open user"
              onPrimaryPress={() => navigation.navigate('AdminUserDetail', {
                userId: report.target_user_id,
              })}
              onDismissPress={() => resolveUser(report)}
            />
          ))
        ) : (
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' }}>
            <Text style={{ color: '#64748b' }}>No pending user reports right now.</Text>
          </View>
        )}

        <SectionTitle
          title="Resolved recently"
          count={queue.resolvedPropertyReports.length + queue.resolvedUserReports.length}
        />
        {[...queue.resolvedPropertyReports, ...queue.resolvedUserReports]
          .sort((left, right) => new Date(right.resolved_at || right.created_at).getTime() - new Date(left.resolved_at || left.created_at).getTime())
          .slice(0, 8)
          .map((report) => (
            <View
              key={`resolved-${report.id}`}
              style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                padding: 14,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 14 }}>
                {report.property?.title || report.target_profile?.display_name || report.target_profile?.email || 'Resolved case'}
              </Text>
              <Text style={{ color: '#64748b', marginTop: 5, lineHeight: 19 }}>
                {report.admin_reply || 'Case resolved by admin.'}
              </Text>
              <Text style={{ color: '#94a3b8', marginTop: 8, fontSize: 12, fontWeight: '700' }}>
                {timeAgo(report.resolved_at || report.created_at)}
              </Text>
            </View>
          ))}
      </ScrollView>
    </SafeAreaView>
  )
}
