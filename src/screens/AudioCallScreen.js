import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BackHandler,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Avatar from '../components/common/Avatar'
import { supabase } from '../lib/supabase'
import { getProfileName } from '../lib/userDisplay'
import { formatDurationSeconds } from '../lib/chatUtils'

function formatCallDuration(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds || 0)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getStatusLabel(stage, durationSeconds) {
  if (stage === 'calling') return 'Calling...'
  if (stage === 'ringing') return 'Ringing...'
  if (stage === 'connecting') return 'Connecting audio...'
  if (stage === 'connected') return formatCallDuration(durationSeconds)
  if (stage === 'ended') return 'Call ended'
  return 'Preparing call...'
}

export default function AudioCallScreen({ navigation, route }) {
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
  const [speakerOn, setSpeakerOn] = useState(true)
  const [micOn, setMicOn] = useState(true)
  const [endingCall, setEndingCall] = useState(false)
  const durationIntervalRef = useRef(null)
  const hasLoggedCallRef = useRef(false)

  useEffect(() => {
    const callingTimer = setTimeout(() => setStage('ringing'), 1600)
    const connectingTimer = setTimeout(() => setStage('connecting'), 3800)
    const connectedTimer = setTimeout(() => setStage('connected'), 5200)

    return () => {
      clearTimeout(callingTimer)
      clearTimeout(connectingTimer)
      clearTimeout(connectedTimer)
    }
  }, [])

  useEffect(() => {
    if (stage !== 'connected') {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
        durationIntervalRef.current = null
      }
      return undefined
    }

    durationIntervalRef.current = setInterval(() => {
      setDurationSeconds((current) => current + 1)
    }, 1000)

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
        durationIntervalRef.current = null
      }
    }
  }, [stage])

  const logCallHistory = useCallback(async (callStatus, totalDurationSeconds) => {
    if (hasLoggedCallRef.current || !conversationId || !participant?.id) return

    hasLoggedCallRef.current = true

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) return

    const createdAt = new Date().toISOString()
    const summary =
      callStatus === 'completed'
        ? 'Outgoing audio call'
        : 'Outgoing call cancelled'
    const lastMessage =
      callStatus === 'completed'
        ? `Audio call • ${formatDurationSeconds(totalDurationSeconds)}`
        : 'Cancelled audio call'

    await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      sender_id: user.id,
      receiver_id: participant.id,
      body: summary,
      message_type: 'call',
      call_kind: 'audio',
      call_status: callStatus,
      call_duration_seconds: totalDurationSeconds,
      created_at: createdAt,
      updated_at: createdAt,
    })

    await supabase
      .from('chat_conversations')
      .update({
        last_message: lastMessage,
        last_message_type: 'call',
        last_message_at: createdAt,
        last_sender_id: user.id,
        updated_at: createdAt,
      })
      .eq('id', conversationId)
  }, [conversationId, participant?.id])

  const endCall = useCallback(async () => {
    if (endingCall) return

    setEndingCall(true)
    setStage('ended')

    const callStatus = stage === 'connected' ? 'completed' : 'cancelled'
    const totalDurationSeconds = stage === 'connected' ? durationSeconds : 0

    try {
      await logCallHistory(callStatus, totalDurationSeconds)
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: 24,
          paddingTop: 10,
          paddingBottom: 24,
        }}
      >
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

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Avatar
            profile={participant}
            name={participantName}
            size={116}
            borderWidth={4}
            borderColor="rgba(255,255,255,0.22)"
            backgroundColor="#dbeafe"
            textColor="#1d4ed8"
          />

          <Text
            style={{
              color: '#fff',
              fontSize: 28,
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

          {property?.title ? (
            <View
              style={{
                marginTop: 18,
                backgroundColor: 'rgba(255,255,255,0.08)',
                borderRadius: 16,
                paddingHorizontal: 14,
                paddingVertical: 12,
                width: '100%',
              }}
            >
              <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '800' }}>
                About this property
              </Text>
              <Text
                style={{
                  color: '#fff',
                  fontWeight: '800',
                  marginTop: 5,
                }}
                numberOfLines={2}
              >
                {property.title}
              </Text>
            </View>
          ) : null}

          <View
            style={{
              marginTop: 20,
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 12,
              width: '100%',
            }}
          >
            <Text style={{ color: '#e2e8f0', lineHeight: 20 }}>
              Phase 1 demo call screen is live now. We can connect this to real audio transport in the next upgrade.
            </Text>
          </View>
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
            style={{
              alignItems: 'center',
              flex: 1,
            }}
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
            onPress={() => setSpeakerOn((current) => !current)}
            style={{
              alignItems: 'center',
              flex: 1,
            }}
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

          <TouchableOpacity
            onPress={() => setMicOn((current) => !current)}
            style={{
              alignItems: 'center',
              flex: 1,
            }}
          >
            <View
              style={{
                width: 58,
                height: 58,
                borderRadius: 29,
                backgroundColor: micOn ? 'rgba(255,255,255,0.12)' : '#fee2e2',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name={micOn ? 'radio-outline' : 'pause-outline'}
                size={24}
                color={micOn ? '#fff' : '#dc2626'}
              />
            </View>
            <Text style={{ color: '#cbd5e1', marginTop: 8, fontWeight: '700' }}>
              {micOn ? 'Live' : 'Paused'}
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
