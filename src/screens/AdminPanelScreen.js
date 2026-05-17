import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { isPrimaryAdmin } from '../lib/admin'

function HubCard({ icon, title, subtitle, badgeCount = 0, onPress, tint = '#2563eb' }) {
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
        marginBottom: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={22} color="#fff" />
        </View>

        <View style={{ marginLeft: 12, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
            <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 17 }}>
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

          <Text style={{ color: '#64748b', marginTop: 4, lineHeight: 19 }}>
            {subtitle}
          </Text>
        </View>
      </View>

      <Ionicons name="chevron-forward" size={20} color="#64748b" />
    </TouchableOpacity>
  )
}

function SummaryTile({ label, value, tint, icon }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 14,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={icon} size={17} color="#fff" />
      </View>

      <Text style={{ color: '#0f172a', fontSize: 22, fontWeight: '900', marginTop: 12 }}>
        {value}
      </Text>
      <Text style={{ color: '#64748b', marginTop: 4, fontSize: 12, fontWeight: '800' }}>
        {label}
      </Text>
    </View>
  )
}

export default function AdminPanelScreen({ navigation }) {
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [counts, setCounts] = useState({
    pendingOwnerReviews: 0,
    pendingPropertyReviews: 0,
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
        totalUsers: 0,
      })
      setLoading(false)
      return
    }

    const [{ count: ownerCount }, { count: propertyCount }, { count: totalUserCount }] = await Promise.all([
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
    ])

    setCounts({
      pendingOwnerReviews: ownerCount || 0,
      pendingPropertyReviews: propertyCount || 0,
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

    return () => {
      supabase.removeChannel(profileChannel)
      supabase.removeChannel(propertyChannel)
    }
  }, [authorized, loadAdminHub])

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
        <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              padding: 16,
            }}
          >
            <Text style={{ color: '#0f172a', fontSize: 20, fontWeight: '900' }}>
              Admin only
            </Text>
            <Text style={{ color: '#64748b', marginTop: 8, lineHeight: 20 }}>
              This panel is only available for your first-level admin account.
            </Text>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={{
                marginTop: 16,
                borderRadius: 14,
                backgroundColor: '#1877F2',
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f7f7f7' }} edges={['left', 'right', 'bottom']}>
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}>
        <Text style={{ color: '#64748b', lineHeight: 20, marginBottom: 14 }}>
          Manage reviews and keep an eye on everyone using Rental X from one place.
        </Text>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
          <SummaryTile
            label="Pending reviews"
            value={totalReviewCount}
            tint="#2563eb"
            icon="shield-checkmark"
          />
          <SummaryTile
            label="Registered users"
            value={counts.totalUsers}
            tint="#16a34a"
            icon="people"
          />
        </View>

        <HubCard
          icon="shield-checkmark-outline"
          title="Review Verify"
          subtitle="Review owner and property verification requests, history, and verified lists."
          badgeCount={totalReviewCount}
          tint="#2563eb"
          onPress={() => navigation.navigate('ReviewVerify')}
        />

        <HubCard
          icon="people-outline"
          title="Total Users"
          subtitle="See all users registered in your database."
          badgeCount={counts.totalUsers}
          tint="#16a34a"
          onPress={() => navigation.navigate('AdminUsers')}
        />
      </View>
    </SafeAreaView>
  )
}
