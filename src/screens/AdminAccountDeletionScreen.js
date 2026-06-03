import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { isPrimaryAdmin } from '../lib/admin'
import {
  fetchAdminAccountDeletionRequests,
  formatAccountDeletionDate,
  getAccountDeletionStatusMeta,
  reviewAccountDeletionRequest,
} from '../lib/accountDeletion'
import { supabase } from '../lib/supabase'
import { useAppSettings } from '../lib/appSettings'

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
  return request.user_profile?.display_name || request.user_name || request.user_email || 'Rental X user'
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
  const meta = getAccountDeletionStatusMeta(status)

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

export default function AdminAccountDeletionScreen({ navigation }) {
  const { theme } = useAppSettings()
  const [adminUser, setAdminUser] = useState(null)
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [requests, setRequests] = useState([])
  const [reviewingId, setReviewingId] = useState(null)
  const [noteDrafts, setNoteDrafts] = useState({})

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
      setRequests(await fetchAdminAccountDeletionRequests())
    } catch (error) {
      Alert.alert(
        'Deletion setup needed',
        error?.message || 'Run supabase-account-deletion-features.sql to enable account deletion requests.'
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

    Alert.alert(
      status === 'approved' ? 'Approve deletion?' : 'Reject request?',
      status === 'approved'
        ? 'This will delete this user account using the server function.'
        : 'The user will be notified that the request was rejected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: status === 'approved' ? 'Delete account' : 'Reject',
          style: status === 'approved' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setReviewingId(request.id)
              await reviewAccountDeletionRequest({
                request,
                adminUser,
                status,
                adminNote: noteDrafts[request.id],
              })
              await loadRequests(false)
              Alert.alert(
                status === 'approved' ? 'Deletion approved' : 'Request rejected',
                status === 'approved'
                  ? 'The server processed this account deletion request.'
                  : 'The user was notified.'
              )
            } catch (error) {
              Alert.alert(
                'Review failed',
                error?.message || 'Could not review this account deletion request.'
              )
            } finally {
              setReviewingId(null)
            }
          },
        },
      ]
    )
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
              Account deletion approvals are only available for your first-level admin account.
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
              Account deletion
            </Text>
            <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 4 }}>
              {pendingCount} pending request{pendingCount === 1 ? '' : 's'}
            </Text>
          </View>
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: '#fee2e2',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="trash-outline" size={23} color="#dc2626" />
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
                      {request.user_profile?.rentalx_id || request.user_email || request.user_id}
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
                    gap: 5,
                  }}
                >
                  <Text style={{ color: theme.text, fontSize: 12, fontWeight: '900' }}>
                    Requested {formatShortDate(request.requested_at)}
                  </Text>
                  <Text style={{ color: theme.mutedText, fontSize: 12, lineHeight: 18 }}>
                    Auto deletion due {formatAccountDeletionDate(request.scheduled_deletion_at)}
                  </Text>
                  {request.reason ? (
                    <Text style={{ color: theme.mutedText, fontSize: 12, lineHeight: 18 }}>
                      Reason: {request.reason}
                    </Text>
                  ) : null}
                </View>

                {isPending ? (
                  <>
                    <TextInput
                      value={noteDrafts[request.id] || ''}
                      onChangeText={(value) =>
                        setNoteDrafts((current) => ({
                          ...current,
                          [request.id]: value,
                        }))
                      }
                      placeholder="Admin note optional"
                      placeholderTextColor={theme.mutedText}
                      multiline
                      style={{
                        minHeight: 72,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: theme.surfaceMuted,
                        color: theme.text,
                        padding: 12,
                        textAlignVertical: 'top',
                      }}
                    />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity
                        onPress={() => reviewRequest(request, 'rejected')}
                        disabled={Boolean(reviewingId)}
                        activeOpacity={0.86}
                        style={{
                          flex: 1,
                          minHeight: 44,
                          borderRadius: 14,
                          backgroundColor: '#f1f5f9',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: reviewingId ? 0.6 : 1,
                        }}
                      >
                        <Text style={{ color: '#334155', fontSize: 13, fontWeight: '900' }}>
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
                          backgroundColor: '#dc2626',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: reviewingId ? 0.6 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>
                          {isReviewing ? 'Working...' : 'Approve delete'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : request.admin_note ? (
                  <Text style={{ color: theme.mutedText, fontSize: 12, lineHeight: 18 }}>
                    Admin note: {request.admin_note}
                  </Text>
                ) : null}
              </View>
            )
          })
        ) : (
          <View
            style={{
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surface,
              padding: 18,
              alignItems: 'center',
            }}
          >
            <Ionicons name="checkmark-done-circle-outline" size={34} color={theme.accent} />
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900', marginTop: 10 }}>
              No deletion requests
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
