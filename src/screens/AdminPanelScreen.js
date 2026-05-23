import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { isPrimaryAdmin } from '../lib/admin'
import { fetchAdminReportCounts } from '../lib/reporting'
import { useAppSettings } from '../lib/appSettings'

function withAlpha(hexColor, alphaHex) {
  const cleanHex = String(hexColor || '').replace('#', '')

  if (cleanHex.length !== 6) {
    return `#000000${alphaHex}`
  }

  return `#${cleanHex}${alphaHex}`
}

const STATUS_COLORS = {
  review: '#2563eb',
  report: '#dc2626',
  users: '#16a34a',
}

function HubCard({ icon, title, subtitle, badgeCount = 0, onPress, tint, theme }) {
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
        marginBottom: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: withAlpha(tint, '26'),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={22} color={tint} />
        </View>

        <View style={{ marginLeft: 12, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <Text style={{ color: theme.text, fontWeight: '900', fontSize: 17 }}>
              {title}
            </Text>
            {badgeCount ? (
              <View
                style={{
                  marginLeft: 8,
                  minWidth: 22,
                  height: 22,
                  borderRadius: 11,
                  paddingHorizontal: 6,
                  backgroundColor: STATUS_COLORS.report,
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

          <Text style={{ color: theme.mutedText, marginTop: 4, lineHeight: 19 }}>
            {subtitle}
          </Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={20} color={theme.mutedText} />
    </TouchableOpacity>
  )
}

function SummaryTile({ label, value, tint, icon, theme }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.border,
        paddingHorizontal: 10,
        paddingVertical: 11,
        minHeight: 96,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: withAlpha(tint, '26'),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={15} color={tint} />
      </View>

      <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900', marginTop: 10 }}>
        {value}
      </Text>
      <Text style={{ color: theme.mutedText, marginTop: 3, fontSize: 10, fontWeight: '800', lineHeight: 13 }}>
        {label}
      </Text>
    </View>
  )
}

export default function AdminPanelScreen({ navigation }) {
  const { theme } = useAppSettings()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [counts, setCounts] = useState({
    pendingOwnerReviews: 0,
    pendingPropertyReviews: 0,
    pendingUserReports: 0,
    pendingPropertyReports: 0,
    totalUsers: 0,
  })

  const loadAdminHub = useCallback(async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const allowed = isPrimaryAdmin(user)
    setAuthorized(allowed)

    if (!allowed) {
      setCounts({
        pendingOwnerReviews: 0,
        pendingPropertyReviews: 0,
        pendingUserReports: 0,
        pendingPropertyReports: 0,
        totalUsers: 0,
      })
      setLoading(false)
      return
    }

    const [
      { count: ownerCount },
      { count: propertyCount },
      { count: totalUserCount },
      reportCounts,
    ] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('owner_verification_status', 'pending'),
      supabase
        .from('properties')
        .select('id', { count: 'exact', head: true })
        .eq('verification_status', 'pending'),
      supabase
        .from('user_profiles')
        .select('user_id', { count: 'exact', head: true }),
      fetchAdminReportCounts(),
    ])

    setCounts({
      pendingOwnerReviews: ownerCount || 0,
      pendingPropertyReviews: propertyCount || 0,
      pendingUserReports: reportCounts.userReportCount || 0,
      pendingPropertyReports: reportCounts.propertyReportCount || 0,
      totalUsers: totalUserCount || 0,
    })
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadAdminHub()
    }, [loadAdminHub])
  )

  useEffect(() => {
    if (!authorized) return undefined

    const refresh = () => {
      loadAdminHub()
    }

    const profileChannel = supabase
      .channel(`admin-hub-profiles-${Date.now()}-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles' },
        refresh
      )
      .subscribe()

    const propertyChannel = supabase
      .channel(`admin-hub-properties-${Date.now()}-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'properties' },
        refresh
      )
      .subscribe()

    const userReportChannel = supabase
      .channel(`admin-hub-user-reports-${Date.now()}-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_reports' },
        refresh
      )
      .subscribe()

    const propertyReportChannel = supabase
      .channel(`admin-hub-property-reports-${Date.now()}-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'property_reports' },
        refresh
      )
      .subscribe()

    return () => {
      supabase.removeChannel(profileChannel)
      supabase.removeChannel(propertyChannel)
      supabase.removeChannel(userReportChannel)
      supabase.removeChannel(propertyReportChannel)
    }
  }, [authorized, loadAdminHub])

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
        <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
          <View
            style={{
              backgroundColor: theme.surface,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 16,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: '900' }}>
              Admin only
            </Text>
            <Text style={{ color: theme.mutedText, marginTop: 8, lineHeight: 20 }}>
              This panel is only available for your first-level admin account.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{
                marginTop: 16,
                borderRadius: 14,
                backgroundColor: theme.accent,
                paddingVertical: 13,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '900' }}>Go back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  const totalReviewCount = counts.pendingOwnerReviews + counts.pendingPropertyReviews
  const totalReportCount = counts.pendingUserReports + counts.pendingPropertyReports

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ color: theme.mutedText, lineHeight: 20, marginBottom: 14 }}>
          Manage reviews and keep an eye on everyone using Rental X from one place.
        </Text>

        <TouchableOpacity
          onPress={() => navigation.navigate('AdminBanners')}
          activeOpacity={0.86}
          style={{
            alignSelf: 'flex-start',
            marginBottom: 12,
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 14,
            backgroundColor: theme.accentSoft,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Ionicons name="images-outline" size={16} color={theme.accent} />
          <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '900' }}>
            Manage home banners
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <SummaryTile
            label="Pending reviews"
            value={totalReviewCount}
            tint={STATUS_COLORS.review}
            icon="shield-checkmark"
            theme={theme}
          />
          <SummaryTile
            label="Pending reports"
            value={totalReportCount}
            tint={STATUS_COLORS.report}
            icon="flag"
            theme={theme}
          />
          <SummaryTile
            label="Registered users"
            value={counts.totalUsers}
            tint={STATUS_COLORS.users}
            icon="people"
            theme={theme}
          />
        </View>

        <HubCard
          icon="flag-outline"
          title="Report Queue"
          subtitle="Review scam, spam, abuse, and fake listing reports from users."
          badgeCount={totalReportCount}
          tint={STATUS_COLORS.report}
          theme={theme}
          onPress={() => navigation.navigate('AdminReports')}
        />

        <HubCard
          icon="shield-checkmark-outline"
          title="Review Verify"
          subtitle="Review owner and property verification requests, history, and verified lists."
          badgeCount={totalReviewCount}
          tint={STATUS_COLORS.review}
          theme={theme}
          onPress={() => navigation.navigate('ReviewVerify')}
        />

        <HubCard
          icon="people-outline"
          title="Total Users"
          subtitle="See all users registered in your database."
          badgeCount={counts.totalUsers}
          tint={STATUS_COLORS.users}
          theme={theme}
          onPress={() => navigation.navigate('AdminUsers')}
        />
      </ScrollView>
    </SafeAreaView>
  )
}
