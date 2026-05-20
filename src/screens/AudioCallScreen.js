import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import {
  buildAgoraChannelName,
  clearActiveAgoraEngine,
  getAgoraRuntimeConfig,
  hashAgoraUid,
  loadAgoraModule,
  replaceActiveAgoraEngine,
  resolveAgoraToken,
  saveAgoraCallHistory,
} from '../lib/agoraCall'
import Avatar from '../components/common/Avatar'
import { getProfileName } from '../lib/userDisplay'
import { supabase } from '../lib/supabase'

function formatCallDuration(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds || 0)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getStatusLabel(stage, durationSeconds, startedByMe, participantName) {
  if (stage === 'preparing') return 'Preparing audio call...'
  if (stage === 'joining') return startedByMe ? 'Starting call...' : `Joining ${participantName}...`
  if (stage === 'waiting') {
    return startedByMe
      ? `Calling ${participantName}...`
      : `Waiting for ${participantName} to connect...`
  }
  if (stage === 'connected') return formatCallDuration(durationSeconds)
  if (stage === 'ended') return 'Call ended'
  return 'Connecting audio...'
}

export default function AudioCallScreen({ navigation, route }) {
  const participant = route?.params?.participant || null
  const property = route?.params?.property || null
  const conversationId = route?.params?.conversationId || null
  const channelNameFromRoute = route?.params?.channelName || null
  const startedByMe = route?.params?.startedByMe !== false
  const participantName = useMemo(
    () => getProfileName(participant, 'Rental X member'),
    [participant]
  )

  const [stage, setStage] = useState('preparing')
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [endingCall, setEndingCall] = useState(false)
  const [remoteJoined, setRemoteJoined] = useState(false)

  const rtcEngineRef = useRef(null)
  const intervalRef = useRef(null)
  const currentUserIdRef = useRef(null)
  const cleanedUpRef = useRef(false)
  const wasConnectedRef = useRef(false)
  const mountedRef = useRef(true)

  const cleanupRtcEngine = useCallback(() => {
    if (cleanedUpRef.current) return

    cleanedUpRef.current = true

    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    const engine = rtcEngineRef.current
    rtcEngineRef.current = null

    if (!engine) return

    try {
      engine.removeAllListeners()
      engine.leaveChannel()
      engine.release()
    } catch (error) {
      console.warn('Audio call cleanup failed:', error?.message || error)
    } finally {
      clearActiveAgoraEngine(engine)
    }
  }, [])

  const endCall = useCallback(async ({ remoteEnded = false } = {}) => {
    if (endingCall) return

    setEndingCall(true)
    setStage('ended')

    cleanupRtcEngine()

    const callStatus = wasConnectedRef.current ? 'completed' : 'cancelled'
    const totalDurationSeconds = wasConnectedRef.current ? durationSeconds : 0

    try {
      await saveAgoraCallHistory({
        conversationId,
        participantId: participant?.id,
        currentUserId: currentUserIdRef.current,
        callKind: 'audio',
        callStatus,
        durationSeconds: totalDurationSeconds,
        startedByMe,
      })
    } catch (error) {
      if (!remoteEnded) {
        Alert.alert(
          'Call history failed',
          error?.message || 'Could not save this call in chat.'
        )
      }
    } finally {
      navigation.goBack()
    }
  }, [cleanupRtcEngine, conversationId, durationSeconds, endingCall, navigation, participant?.id, startedByMe])

  useEffect(() => {
    mountedRef.current = true

    async function startAudioCall() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!mountedRef.current) return

        if (!user?.id || !participant?.id) {
          throw new Error('This call is missing user information.')
        }

        const agoraModule = loadAgoraModule()

        if (!agoraModule) {
          throw new Error(
            'Agora native module is not linked in this build yet. Rebuild the app with EAS or a development build and try again.'
          )
        }

        const {
          ChannelProfileType,
          ClientRoleType,
          ConnectionStateType,
          createAgoraRtcEngine,
        } = agoraModule

        const { appId } = getAgoraRuntimeConfig()

        if (!appId) {
          throw new Error('Agora is not configured yet. Add EXPO_PUBLIC_AGORA_APP_ID and rebuild the app.')
        }

        currentUserIdRef.current = user.id
        const localUid = hashAgoraUid(user.id)
        const channelName =
          channelNameFromRoute ||
          buildAgoraChannelName({
            conversationId,
            callerId: startedByMe ? user.id : participant.id,
            recipientId: startedByMe ? participant.id : user.id,
            kind: 'audio',
          })

        const token = await resolveAgoraToken({
          channelName,
          uid: localUid,
          callKind: 'audio',
        })

        const engine = createAgoraRtcEngine()
        replaceActiveAgoraEngine(engine)
        rtcEngineRef.current = engine
        cleanedUpRef.current = false

        engine.initialize({
          appId,
          channelProfile: ChannelProfileType.ChannelProfileCommunication,
        })

        engine.addListener('onError', (_code, message) => {
          if (!mountedRef.current) return
          Alert.alert('Agora error', message || 'The audio call ran into a problem.')
        })

        engine.addListener('onJoinChannelSuccess', () => {
          if (!mountedRef.current) return
          setStage('waiting')
        })

        engine.addListener('onUserJoined', () => {
          if (!mountedRef.current) return
          wasConnectedRef.current = true
          setRemoteJoined(true)
          setStage('connected')
        })

        engine.addListener('onUserOffline', () => {
          if (!mountedRef.current) return
          setRemoteJoined(false)
          endCall({ remoteEnded: true })
        })

        engine.addListener('onConnectionStateChanged', (_connection, state) => {
          if (!mountedRef.current || endingCall) return

          if (state === ConnectionStateType.ConnectionStateConnecting) {
            setStage('joining')
          }

          if (
            state === ConnectionStateType.ConnectionStateDisconnected
            && wasConnectedRef.current
          ) {
            endCall({ remoteEnded: true })
          }
        })

        engine.enableAudio()
        engine.setEnableSpeakerphone(true)

        setStage('joining')

        const joinCode = engine.joinChannel(token, channelName, localUid, {
          channelProfile: ChannelProfileType.ChannelProfileCommunication,
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          autoSubscribeAudio: true,
          autoSubscribeVideo: false,
          enableAudioRecordingOrPlayout: true,
        })

        if (joinCode < 0) {
          throw new Error(engine.getErrorDescription(joinCode) || `Agora join failed (${joinCode}).`)
        }
      } catch (error) {
        Alert.alert('Audio call unavailable', error?.message || 'Could not start the audio call.')
        navigation.goBack()
      }
    }

    startAudioCall()

    return () => {
      mountedRef.current = false
      cleanupRtcEngine()
    }
  }, [channelNameFromRoute, cleanupRtcEngine, conversationId, endingCall, endCall, navigation, participant?.id, startedByMe])

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

  useEffect(() => {
    const engine = rtcEngineRef.current

    if (!engine) return

    engine.muteLocalAudioStream(muted)
  }, [muted])

  useEffect(() => {
    const engine = rtcEngineRef.current

    if (!engine) return

    engine.setEnableSpeakerphone(speakerOn)
  }, [speakerOn])

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
            onPress={() => endCall()}
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
            {endingCall
              ? 'Saving call...'
              : getStatusLabel(stage, durationSeconds, startedByMe, participantName)}
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
              {remoteJoined
                ? 'You are live on a real Agora audio call now.'
                : 'The call is live. We are waiting for the other person to join this channel.'}
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

          <View
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
                backgroundColor: remoteJoined ? '#dcfce7' : 'rgba(255,255,255,0.12)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons
                name={remoteJoined ? 'radio' : 'hourglass-outline'}
                size={24}
                color={remoteJoined ? '#15803d' : '#fff'}
              />
            </View>
            <Text style={{ color: '#cbd5e1', marginTop: 8, fontWeight: '700' }}>
              {remoteJoined ? 'Connected' : 'Waiting'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => endCall()}
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
