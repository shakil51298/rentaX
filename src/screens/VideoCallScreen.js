import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Avatar from '../components/common/Avatar'
import { supabase } from '../lib/supabase'
import { formatDurationSeconds } from '../lib/chatUtils'
import { getProfileName } from '../lib/userDisplay'

function formatCallDuration(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds || 0)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getStatusLabel(stage, durationSeconds) {
  if (stage === 'calling') return 'Starting video call...'
  if (stage === 'ringing') return 'Ringing...'
  if (stage === 'connecting') return 'Connecting video...'
  if (stage === 'connected') return formatCallDuration(durationSeconds)
  if (stage === 'ended') return 'Video call ended'
  return 'Preparing video...'
}

export default function VideoCallScreen({ navigation, route }) {
  const participant = route?.params?.participant || null
  const property = route?.params?.property || null
  const conversationId = route?.params?.conversationId || null
  const participantName = useMemo(
    () => getProfileName(participant, 'Rental X member'),
    [participant]
  )

  const [stage, setStage] = useState('calling')
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const [cameraOn, setCameraOn] = useState(true)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [endingCall, setEndingCall] = useState(false)
  const intervalRef = useRef(null)
  const hasLoggedCallRef = useRef(false)

  useEffect(() => {
    const callingTimer = setTimeout(() => setStage('ringing'), 1200)
    const connectingTimer = setTimeout(() => setStage('connecting'), 2800)
    const connectedTimer = setTimeout(() => setStage('connected'), 4300)

    return () => {
      clearTimeout(callingTimer)
      clearTimeout(connectingTimer)
      clearTimeout(connectedTimer)
    }
  }, [])

  useEffect(() => {
    if (stage !== 'connected') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return undefined
    }

    intervalRef.current = setInterval(() => {
      setDurationSeconds((current) => current + 1)
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [stage])

  const logCallHistory = useCallback(async (callStatus, totalDurationSeconds) => {
    if (hasLoggedCallRef.current || !conversationId || !participant?.id) return

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) return

    const createdAt = new Date().toISOString()
    const summary =
      callStatus === 'completed'
        ? 'Outgoing video call'
        : 'Outgoing video call cancelled'
    const lastMessage =
      callStatus === 'completed'
        ? `Video call • ${formatDurationSeconds(totalDurationSeconds)}`
        : 'Cancelled video call'

    const basePayload = {
      conversation_id: conversationId,
      sender_id: user.id,
      receiver_id: participant.id,
      body: summary,
      message_type: 'call',
      call_status: callStatus,
      call_duration_seconds: totalDurationSeconds,
      created_at: createdAt,
      updated_at: createdAt,
    }

    let insertError = null
    const { error: videoInsertError } = await supabase
      .from('chat_messages')
      .insert({
        ...basePayload,
        call_kind: 'video',
      })

    if (videoInsertError) {
      const { error: fallbackInsertError } = await supabase
        .from('chat_messages')
        .insert({
          ...basePayload,
          call_kind: null,
        })

      insertError = fallbackInsertError || videoInsertError
    }

    if (insertError) {
      throw insertError
    }

    const { error: conversationError } = await supabase
      .from('chat_conversations')
      .update({
        last_message: lastMessage,
        last_message_type: 'call',
        last_message_at: createdAt,
        last_sender_id: user.id,
        updated_at: createdAt,
      })
      .eq('id', conversationId)

    if (conversationError) {
      throw conversationError
    }

    hasLoggedCallRef.current = true
  }, [conversationId, participant?.id])

  const endCall = useCallback(async () => {
    if (endingCall) return

    setEndingCall(true)
    setStage('ended')

    const callStatus = stage === 'connected' ? 'completed' : 'cancelled'
    const totalDurationSeconds = stage === 'connected' ? durationSeconds : 0

    try {
      await logCallHistory(callStatus, totalDurationSeconds)
    } catch (error) {
      hasLoggedCallRef.current = false
      Alert.alert('Call history failed', error?.message || 'Could not save this video call in chat.')
    } finally {
      navigation.goBack()
    }
  }, [durationSeconds, endingCall, logCallHistory, navigation, stage])

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      endCall()
      return true
    })

    return () => {
      subscription.remove()
    }
  }, [endCall])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#020617' }}>
      <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24 }}>
        <View style={{ alignItems: 'flex-end' }}>
          <TouchableOpacity
            onPress={endCall}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: 'rgba(255,255,255,0.12)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View
            style={{
              borderRadius: 26,
              overflow: 'hidden',
              backgroundColor: '#111827',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.08)',
              height: 320,
            }}
          >
            <View
              style={{
                ...StyleSheet.absoluteFillObject,
                backgroundColor: '#0f172a',
              }}
            />
            <View
              style={{
                position: 'absolute',
                top: -30,
                right: -10,
                width: 190,
                height: 190,
                borderRadius: 999,
                backgroundColor: 'rgba(37,99,235,0.26)',
              }}
            />
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 22,
              }}
            >
              <Avatar
                profile={participant}
                name={participantName}
                size={108}
                borderWidth={4}
                borderColor="rgba(255,255,255,0.22)"
                backgroundColor="#dbeafe"
                textColor="#1d4ed8"
              />
              <Text
                style={{
                  color: '#fff',
                  fontSize: 26,
                  fontWeight: '900',
                  marginTop: 18,
                  textAlign: 'center',
                }}
              >
                {participantName}
              </Text>
              <Text
                style={{
                  color: '#cbd5e1',
                  fontSize: 16,
                  marginTop: 8,
                  textAlign: 'center',
                }}
              >
                {endingCall ? 'Saving call...' : getStatusLabel(stage, durationSeconds)}
              </Text>
              <Text
                style={{
                  color: '#94a3b8',
                  fontSize: 13,
                  marginTop: 12,
                  textAlign: 'center',
                  lineHeight: 19,
                }}
              >
                Demo video call screen is ready. We can plug in the real call API and camera streams later.
              </Text>
            </View>

            <View
              style={{
                position: 'absolute',
                right: 16,
                bottom: 16,
                width: 108,
                height: 148,
                borderRadius: 20,
                backgroundColor: cameraOn ? '#1e293b' : '#0f172a',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.12)',
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {cameraOn ? (
                <>
                  <View
                    style={{
                      width: 58,
                      height: 58,
                      borderRadius: 29,
                      backgroundColor: '#dbeafe',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="person" size={28} color="#1d4ed8" />
                  </View>
                  <Text style={{ color: '#e2e8f0', fontWeight: '800', marginTop: 10 }}>
                    You
                  </Text>
                </>
              ) : (
                <Ionicons name="videocam-off" size={28} color="#94a3b8" />
              )}
            </View>
          </View>

          {property?.title ? (
            <View
              style={{
                marginTop: 14,
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
            >
              <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '800' }}>
                About this property
              </Text>
              <Text style={{ color: '#fff', fontWeight: '800', marginTop: 5 }} numberOfLines={2}>
                {property.title}
              </Text>
            </View>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
          }}
        >
          <TouchableOpacity
            onPress={() => setMuted((current) => !current)}
            style={{ alignItems: 'center', flex: 1 }}
          >
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 29,
                backgroundColor: muted ? '#fee2e2' : 'rgba(255,255,255,0.12)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name={muted ? 'mic-off' : 'mic'}
                size={24}
                color={muted ? '#dc2626' : '#fff'}
              />
            </View>
            <Text style={{ color: '#cbd5e1', marginTop: 8, fontWeight: '700' }}>
              {muted ? 'Unmute' : 'Mute'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setCameraOn((current) => !current)}
            style={{ alignItems: 'center', flex: 1 }}
          >
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 29,
                backgroundColor: cameraOn ? 'rgba(255,255,255,0.12)' : '#fee2e2',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name={cameraOn ? 'videocam' : 'videocam-off'}
                size={24}
                color={cameraOn ? '#fff' : '#dc2626'}
              />
            </View>
            <Text style={{ color: '#cbd5e1', marginTop: 8, fontWeight: '700' }}>
              {cameraOn ? 'Camera' : 'Camera off'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setSpeakerOn((current) => !current)}
            style={{ alignItems: 'center', flex: 1 }}
          >
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 29,
                backgroundColor: speakerOn ? '#dbeafe' : 'rgba(255,255,255,0.12)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name={speakerOn ? 'volume-high' : 'volume-mute'}
                size={24}
                color={speakerOn ? '#2563eb' : '#fff'}
              />
            </View>
            <Text style={{ color: '#cbd5e1', marginTop: 8, fontWeight: '700' }}>
              {speakerOn ? 'Speaker' : 'Earpiece'}
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={endCall}
          disabled={endingCall}
          style={{
            alignSelf: 'center',
            width: 74,
            height: 74,
            borderRadius: 37,
            backgroundColor: '#ef4444',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: endingCall ? 0.75 : 1,
          }}
        >
          {endingCall ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}
