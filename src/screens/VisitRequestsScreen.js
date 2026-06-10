import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { getCachedAuthUser } from '../lib/authSession'
import Avatar from '../components/common/Avatar'
import { createNotification } from '../lib/notifications'
import {
  fetchOwnerVisitRequests,
  formatVisitDateTime,
  getVisitStatusMeta,
  splitVisitTimestamp,
  updateVisitRequestStatus,
  buildVisitTimestamp,
} from '../lib/visitScheduling'
import { getProfileName } from '../lib/userDisplay'
import { useAppSettings } from '../lib/appSettings'

function SummaryCard({ label, value, tone = '#1877F2', bg = '#eff6ff', theme }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: bg,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 14,
      }}
    >
      <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '800' }}>{label}</Text>
      <Text style={{ color: tone, fontSize: 22, fontWeight: '900', marginTop: 6 }}>{value}</Text>
    </View>
  )
}

export default function VisitRequestsScreen({ navigation }) {
  const { theme } = useAppSettings()
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [requests, setRequests] = useState([])
  const [actionRequest, setActionRequest] = useState(null)
  const [responseNote, setResponseNote] = useState('')
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [saving, setSaving] = useState(false)
  const hasLoadedRequestsRef = useRef(false)

  const loadRequests = useCallback(async () => {
    if (!hasLoadedRequestsRef.current) {
      setLoading(true)
    }

    const user = await getCachedAuthUser()

    setCurrentUser(user || null)

    if (!user?.id) {
      setRequests([])
      hasLoadedRequestsRef.current = true
      setLoading(false)
      return
    }

    try {
      setRequests(await fetchOwnerVisitRequests(user.id))
    } catch (error) {
      Alert.alert(
        'Visit scheduling setup needed',
        error?.message || 'Run supabase-visit-scheduling-features.sql in Supabase, then try again.'
      )
    } finally {
      hasLoadedRequestsRef.current = true
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadRequests()
    }, [loadRequests])
  )

  useFocusEffect(
    useCallback(() => {
      if (!currentUser?.id) return undefined

      const channel = supabase
        .channel(`owner-visit-requests-${currentUser.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'property_visit_requests',
            filter: `owner_id=eq.${currentUser.id}`,
          },
          loadRequests
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }, [currentUser?.id, loadRequests])
  )

  const pendingCount = useMemo(
    () => requests.filter((item) => item.status === 'pending').length,
    [requests]
  )
  const confirmedCount = useMemo(
    () => requests.filter((item) => ['accepted', 'rescheduled'].includes(item.status)).length,
    [requests]
  )

  function openRescheduleModal(item) {
    const fallbackTimestamp = item.owner_proposed_for || item.requested_for
    const { dateText, timeText } = splitVisitTimestamp(fallbackTimestamp)
    setActionRequest(item)
    setResponseNote(item.owner_response_note || '')
    setRescheduleDate(dateText)
    setRescheduleTime(timeText)
  }

  function closeRescheduleModal() {
    setActionRequest(null)
    setResponseNote('')
    setRescheduleDate('')
    setRescheduleTime('')
  }

  async function notifyRequester(item, type, body) {
    if (!currentUser?.id || !item?.requester_id) return

    await createNotification({
      recipientId: item.requester_id,
      actorId: currentUser.id,
      type,
      propertyId: item.property_id,
      title: item.property?.title || 'Visit request update',
      body,
      eventKey: `${type}:${item.id}:${item.updated_at || Date.now()}`,
      pushTitle: 'Visit request update',
      pushBody: body,
      pushData: {
        propertyTitle: item.property?.title || '',
        visitRequestId: item.id,
      },
    })
  }

  async function acceptRequest(item) {
    try {
      setSaving(true)
      const updated = await updateVisitRequestStatus({
        requestId: item.id,
        nextStatus: 'accepted',
        ownerResponseNote: '',
        ownerProposedFor: item.requested_for,
      })

      const nextItem = {
        ...item,
        ...updated,
      }

      setRequests((current) => current.map((request) => (request.id === item.id ? nextItem : request)))

      await notifyRequester(
        nextItem,
        'visit_request_accepted',
        `Your visit request for ${item.property?.title || 'this property'} was accepted for ${formatVisitDateTime(updated.owner_proposed_for || updated.requested_for)}.`
      )
    } catch (error) {
      Alert.alert('Accept failed', error?.message || 'Could not update this visit request.')
    } finally {
      setSaving(false)
    }
  }

  async function rejectRequest(item) {
    try {
      setSaving(true)
      const updated = await updateVisitRequestStatus({
        requestId: item.id,
        nextStatus: 'rejected',
        ownerResponseNote: 'This time is not available. Please request another time.',
        ownerProposedFor: null,
      })

      const nextItem = {
        ...item,
        ...updated,
      }

      setRequests((current) => current.map((request) => (request.id === item.id ? nextItem : request)))

      await notifyRequester(
        nextItem,
        'visit_request_rejected',
        `Your visit request for ${item.property?.title || 'this property'} was declined.`
      )
    } catch (error) {
      Alert.alert('Reject failed', error?.message || 'Could not update this visit request.')
    } finally {
      setSaving(false)
    }
  }

  async function saveReschedule() {
    if (!actionRequest) return

    let nextTimestamp = null

    try {
      nextTimestamp = buildVisitTimestamp(rescheduleDate, rescheduleTime)
    } catch (error) {
      Alert.alert('Invalid schedule', error.message)
      return
    }

    try {
      setSaving(true)
      const updated = await updateVisitRequestStatus({
        requestId: actionRequest.id,
        nextStatus: 'rescheduled',
        ownerResponseNote: responseNote,
        ownerProposedFor: nextTimestamp,
      })

      const nextItem = {
        ...actionRequest,
        ...updated,
      }

      setRequests((current) =>
        current.map((request) => (request.id === actionRequest.id ? nextItem : request))
      )

      await notifyRequester(
        nextItem,
        'visit_request_rescheduled',
        `Your visit request for ${actionRequest.property?.title || 'this property'} was rescheduled to ${formatVisitDateTime(updated.owner_proposed_for)}.`
      )

      closeRescheduleModal()
    } catch (error) {
      Alert.alert('Reschedule failed', error?.message || 'Could not reschedule this visit.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '900' }}>
            Visit Requests
          </Text>
          <Text style={{ color: theme.mutedText, marginTop: 4, lineHeight: 19 }}>
            Review renter visit requests, accept a preferred time, or propose a new time.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <SummaryCard label="Pending" value={pendingCount} tone="#b45309" bg="#fef3c7" theme={theme} />
            <SummaryCard label="Confirmed" value={confirmedCount} tone="#15803d" bg="#dcfce7" theme={theme} />
          </View>
        </View>

        {requests.length === 0 ? (
          <View
            style={{
              backgroundColor: theme.surface,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.border,
              paddingVertical: 28,
              paddingHorizontal: 18,
              alignItems: 'center',
            }}
          >
            <Ionicons name="calendar-outline" size={28} color={theme.mutedText} />
            <Text style={{ color: theme.text, fontWeight: '900', marginTop: 10 }}>
              No visit requests yet
            </Text>
            <Text style={{ color: theme.mutedText, marginTop: 6, textAlign: 'center', lineHeight: 19 }}>
              When renters request a visit time for one of your properties, they will appear here.
            </Text>
          </View>
        ) : (
          requests.map((item) => {
            const statusMeta = getVisitStatusMeta(item.status)
            const requesterName = getProfileName(item.requester_profile, 'Renter')

            return (
              <View
                key={item.id}
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: theme.border,
                  padding: 16,
                  marginBottom: 14,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Avatar profile={item.requester_profile} name={requesterName} size={44} />

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: theme.text, fontWeight: '900', fontSize: 15 }}>
                      {requesterName}
                    </Text>
                    <Text style={{ color: theme.mutedText, marginTop: 4, fontSize: 12 }}>
                      {item.property?.title || 'Property'}
                    </Text>
                  </View>

                  <View
                    style={{
                      backgroundColor: statusMeta.backgroundColor,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <Ionicons name={statusMeta.icon} size={13} color={statusMeta.color} />
                    <Text style={{ color: statusMeta.color, fontWeight: '900', fontSize: 11, marginLeft: 5 }}>
                      {statusMeta.label}
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    marginTop: 14,
                    borderRadius: 14,
                    backgroundColor: theme.surfaceMuted,
                    borderWidth: 1,
                    borderColor: theme.border,
                    padding: 12,
                    gap: 8,
                  }}
                >
                  <Text style={{ color: theme.text, fontWeight: '800' }}>
                    Requested time: {formatVisitDateTime(item.requested_for)}
                  </Text>

                  {item.owner_proposed_for ? (
                    <Text style={{ color: theme.text, lineHeight: 19 }}>
                      Owner time: {formatVisitDateTime(item.owner_proposed_for)}
                    </Text>
                  ) : null}

                  {item.request_message ? (
                    <Text style={{ color: theme.mutedText, lineHeight: 19 }}>
                      Note: {item.request_message}
                    </Text>
                  ) : null}

                  {item.owner_response_note ? (
                    <Text style={{ color: theme.mutedText, lineHeight: 19 }}>
                      Owner response: {item.owner_response_note}
                    </Text>
                  ) : null}
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <TouchableOpacity
                    onPress={() => navigation.navigate('Property', { property: item.property })}
                    style={{
                      flex: 1,
                      borderRadius: 12,
                      backgroundColor: theme.surfaceMuted,
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: 42,
                    }}
                  >
                    <Text style={{ color: theme.text, fontWeight: '900', fontSize: 12 }}>View property</Text>
                  </TouchableOpacity>

                  {item.status === 'pending' ? (
                    <>
                      <TouchableOpacity
                        onPress={() => acceptRequest(item)}
                        disabled={saving}
                        style={{
                          flex: 1,
                          borderRadius: 12,
                          backgroundColor: '#16a34a',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 42,
                          opacity: saving ? 0.6 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>Accept</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => openRescheduleModal(item)}
                        style={{
                          flex: 1,
                          borderRadius: 12,
                          backgroundColor: '#ede9fe',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 42,
                        }}
                      >
                        <Text style={{ color: '#6d28d9', fontWeight: '900', fontSize: 12 }}>Reschedule</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => rejectRequest(item)}
                        disabled={saving}
                        style={{
                          flex: 1,
                          borderRadius: 12,
                          backgroundColor: '#fee2e2',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 42,
                          opacity: saving ? 0.6 : 1,
                        }}
                      >
                        <Text style={{ color: '#b91c1c', fontWeight: '900', fontSize: 12 }}>Reject</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      onPress={() => openRescheduleModal(item)}
                      style={{
                        flex: 1,
                        borderRadius: 12,
                        backgroundColor: '#eef2ff',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 42,
                      }}
                    >
                      <Text style={{ color: '#4338ca', fontWeight: '900', fontSize: 12 }}>Update schedule</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )
          })
        )}
      </ScrollView>

      <Modal
        visible={Boolean(actionRequest)}
        transparent
        animationType="fade"
        onRequestClose={closeRescheduleModal}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15,23,42,0.48)',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <TouchableOpacity style={{ position: 'absolute', inset: 0 }} activeOpacity={1} onPress={closeRescheduleModal} />

          <View
            style={{
              backgroundColor: theme.surface,
              borderRadius: 20,
              padding: 18,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text style={{ color: theme.text, fontWeight: '900', fontSize: 18 }}>Reschedule visit</Text>
            <Text style={{ color: theme.mutedText, marginTop: 4, lineHeight: 19 }}>
              Propose a better time for this visit request.
            </Text>

            <View style={{ marginTop: 14 }}>
              <Text style={{ color: theme.mutedText, fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
                New date
              </Text>
              <TextInput
                value={rescheduleDate}
                onChangeText={setRescheduleDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94a3b8"
                style={{
                  backgroundColor: theme.surfaceMuted,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 14,
                  paddingHorizontal: 13,
                  paddingVertical: 12,
                  color: theme.text,
                }}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: theme.mutedText, fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
                New time
              </Text>
              <TextInput
                value={rescheduleTime}
                onChangeText={setRescheduleTime}
                placeholder="HH:MM"
                placeholderTextColor="#94a3b8"
                style={{
                  backgroundColor: theme.surfaceMuted,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 14,
                  paddingHorizontal: 13,
                  paddingVertical: 12,
                  color: theme.text,
                }}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: theme.mutedText, fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
                Note
              </Text>
              <TextInput
                value={responseNote}
                onChangeText={setResponseNote}
                placeholder="Add a note for the renter"
                placeholderTextColor="#94a3b8"
                multiline
                style={{
                  minHeight: 84,
                  backgroundColor: theme.surfaceMuted,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 14,
                  paddingHorizontal: 13,
                  paddingVertical: 12,
                  color: theme.text,
                  textAlignVertical: 'top',
                }}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                onPress={closeRescheduleModal}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 14,
                  backgroundColor: theme.surfaceMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: theme.text, fontWeight: '900' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={saveReschedule}
                disabled={saving}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 14,
                  backgroundColor: '#1877F2',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '900' }}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
