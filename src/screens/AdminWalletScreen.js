import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
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
import { useAppSettings } from '../lib/appSettings'
import {
  fetchAdminWalletTopupRequests,
  formatWalletAmount,
  getWalletRequestStatusMeta,
  reviewWalletTopupRequest,
} from '../lib/wallet'

function formatShortDate(date) {
  if (!date) return ''

  return new Date(date).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getUserName(request) {
  return request.user_profile?.display_name || request.user_profile?.email || 'Rental X user'
}

function RequestAvatar({ request, theme }) {
  const avatarUrl = request.user_profile?.avatar_url
  const initial = getUserName(request).charAt(0).toUpperCase()

  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: theme.surfaceMuted }}
      />
    )
  }

  return (
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
      <Text style={{ color: theme.accentStrong, fontSize: 15, fontWeight: '900' }}>
        {initial}
      </Text>
    </View>
  )
}

function StatusPill({ status }) {
  const meta = getWalletRequestStatusMeta(status)

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderRadius: 999,
        backgroundColor: meta.bg,
        paddingHorizontal: 8,
        paddingVertical: 4,
      }}
    >
      <Ionicons name={meta.icon} size={12} color={meta.color} />
      <Text style={{ color: meta.color, fontSize: 10, fontWeight: '900' }}>
        {meta.label}
      </Text>
    </View>
  )
}

export default function AdminWalletScreen({ navigation }) {
  const { theme } = useAppSettings()
  const [adminUser, setAdminUser] = useState(null)
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [requests, setRequests] = useState([])
  const [reviewingId, setReviewingId] = useState(null)

  const pendingCount = useMemo(
    () => requests.filter((request) => request.status === 'pending').length,
    [requests]
  )

  const loadRequests = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    setAdminUser(user || null)
    const allowed = isPrimaryAdmin(user)
    setAuthorized(allowed)

    if (!allowed) {
      setRequests([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    try {
      setRequests(await fetchAdminWalletTopupRequests())
    } catch (error) {
      Alert.alert(
        'Wallet setup needed',
        error?.message || 'Run supabase-red-packet-features.sql to enable admin wallet requests.'
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadRequests()
    }, [loadRequests])
  )

  async function refreshRequests() {
    setRefreshing(true)
    await loadRequests(false)
  }

  async function reviewRequest(request, status) {
    if (!request?.id || reviewingId) return

    try {
      setReviewingId(request.id)
      await reviewWalletTopupRequest({
        request,
        adminUser,
        status,
      })
      await loadRequests(false)
      Alert.alert(
        status === 'approved' ? 'Money added' : 'Request rejected',
        status === 'approved'
          ? `${formatWalletAmount(request.amount, request.currency)} was added to ${getUserName(request)}.`
          : 'The user was notified.'
      )
    } catch (error) {
      Alert.alert('Review failed', error?.message || 'Could not review this wallet request.')
    } finally {
      setReviewingId(null)
    }
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
        <View style={{ flex: 1, padding: 20, justifyContent: 'center' }}>
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surface,
              padding: 16,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: '900' }}>
              Admin only
            </Text>
            <Text style={{ color: theme.mutedText, marginTop: 8, lineHeight: 20 }}>
              Wallet approvals are only available for your first-level admin account.
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshRequests} tintColor={theme.accent} />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            borderRadius: 18,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900' }}>
              E-money requests
            </Text>
            <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 4 }}>
              {pendingCount} pending approval
            </Text>
          </View>
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: theme.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="cash-outline" size={23} color={theme.accent} />
          </View>
        </View>

        {requests.length ? (
          requests.map((request) => {
            const isPending = request.status === 'pending'
            const isReviewing = reviewingId === request.id

            return (
              <View
                key={request.id}
                style={{
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  padding: 14,
                  gap: 12,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <RequestAvatar request={request} theme={theme} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text
                        numberOfLines={1}
                        style={{ flex: 1, color: theme.text, fontSize: 14, fontWeight: '900' }}
                      >
                        {getUserName(request)}
                      </Text>
                      <StatusPill status={request.status} />
                    </View>
                    <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 3 }}>
                      {request.user_profile?.rentalx_id || request.user_profile?.email || request.user_id}
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    borderRadius: 14,
                    backgroundColor: theme.surfaceMuted,
                    borderWidth: 1,
                    borderColor: theme.border,
                    padding: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '900' }}>
                      Requested amount
                    </Text>
                    <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900', marginTop: 3 }}>
                      {formatWalletAmount(request.amount, request.currency)}
                    </Text>
                  </View>
                  <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '800' }}>
                    {formatShortDate(request.created_at)}
                  </Text>
                </View>

                {request.note ? (
                  <Text style={{ color: theme.mutedText, fontSize: 12, lineHeight: 18 }}>
                    {request.note}
                  </Text>
                ) : null}

                {isPending ? (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => reviewRequest(request, 'rejected')}
                      disabled={Boolean(reviewingId)}
                      activeOpacity={0.86}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        borderRadius: 14,
                        backgroundColor: '#fee2e2',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: reviewingId ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ color: '#dc2626', fontSize: 13, fontWeight: '900' }}>
                        Reject
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => reviewRequest(request, 'approved')}
                      disabled={Boolean(reviewingId)}
                      activeOpacity={0.86}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        borderRadius: 14,
                        backgroundColor: theme.accent,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: reviewingId ? 0.6 : 1,
                      }}
                    >
                      {isReviewing ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>
                          Add money
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '800' }}>
                    Reviewed {formatShortDate(request.reviewed_at)}
                  </Text>
                )}
              </View>
            )
          })
        ) : (
          <Text style={{ color: theme.mutedText, textAlign: 'center', paddingVertical: 28 }}>
            No wallet requests yet.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
