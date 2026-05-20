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
import { Audio } from 'expo-av'
import Avatar from '../components/common/Avatar'
import {
  buildAgoraChannelName,
  clearActiveAgoraEngine,
  getAgoraRuntimeConfig,
  hashAgoraUid,
  loadAgoraModule,
  releaseActiveAgoraCall,
  replaceActiveAgoraEngine,
  reserveActiveAgoraCall,
  resolveAgoraToken,
  saveAgoraCallHistory,
} from '../lib/agoraCall'
import {
  buildCallSignalKey,
  sendCallSignal,
  subscribeToCallSignals,
  unsubscribeCallSignals,
} from '../lib/callSignaling'
import { getProfileName } from '../lib/userDisplay'
import { supabase } from '../lib/supabase'

function formatCallDuration(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds || 0)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getStatusLabel(stage, durationSeconds, startedByMe, participantName) {
  if (stage === 'incoming') return `${participantName} is calling...`
  if (stage === 'preparing') return 'Preparing video call...'
  if (stage === 'joining') return startedByMe ? 'Starting video call...' : `Joining ${participantName}...`
  if (stage === 'waiting') {
    return startedByMe
      ? `Calling ${participantName}...`
      : `Waiting for ${participantName} to connect...`
  }
  if (stage === 'connected') return formatCallDuration(durationSeconds)
  if (stage === 'ended') return 'Video call ended'
  return 'Connecting video...'
}

export default function VideoCallScreen({ navigation, route }) {
  const participant = route?.params?.participant || null
  const property = route?.params?.property || null
  const conversationId = route?.params?.conversationId || null
  const channelNameFromRoute = route?.params?.channelName || null
  const startedByMe = route?.params?.startedByMe !== false
  const participantName = useMemo(
    () => getProfileName(participant, 'Rental X member'),
    [participant]
  )
  const callSignalKey = useMemo(
    () => buildCallSignalKey('video', { callId: route?.params?.callId, channelName: channelNameFromRoute }),
    [channelNameFromRoute, route?.params?.callId]
  )

  const [stage, setStage] = useState(startedByMe ? 'preparing' : 'incoming')
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const [cameraOn, setCameraOn] = useState(true)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [endingCall, setEndingCall] = useState(false)
  const [remoteUid, setRemoteUid] = useState(null)
  const [localUid, setLocalUid] = useState(0)
  const [agoraModule, setAgoraModule] = useState(null)
  const [joinRequested, setJoinRequested] = useState(startedByMe)
  const AgoraSurfaceView = agoraModule?.RtcSurfaceView || null

  const rtcEngineRef = useRef(null)
  const intervalRef = useRef(null)
  const currentUserIdRef = useRef(null)
  const cleanedUpRef = useRef(false)
  const wasConnectedRef = useRef(false)
  const mountedRef = useRef(true)
  const hasStartedRef = useRef(false)
  const ringtoneRef = useRef(null)
  const callKeyRef = useRef(null)
  const signalChannelRef = useRef(null)
  const signalReadyRef = useRef(Promise.resolve(null))
  const endCallRef = useRef(null)
  const endingCallRef = useRef(false)
  const connectedAtRef = useRef(null)
  const joinRequestedRef = useRef(joinRequested)

  useEffect(() => {
    endCallRef.current = endCall
  })

  useEffect(() => {
    endingCallRef.current = endingCall
  }, [endingCall])

  useEffect(() => {
    joinRequestedRef.current = joinRequested
  }, [joinRequested])

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
      engine.stopPreview()
      engine.leaveChannel()
      engine.release()
    } catch (error) {
      console.warn('Video call cleanup failed:', error?.message || error)
    } finally {
      clearActiveAgoraEngine(engine)
      releaseActiveAgoraCall(callKeyRef.current)
    }
  }, [])

  const stopRingtone = useCallback(async () => {
    const sound = ringtoneRef.current
    ringtoneRef.current = null

    if (!sound) return

    try {
      await sound.stopAsync()
    } catch (_error) {
      // ignore stop errors during fast transitions
    }

    try {
      await sound.unloadAsync()
    } catch (_error) {
      // ignore unload errors
    }
  }, [])

  const endCall = useCallback(async ({ remoteEnded = false } = {}) => {
    if (endingCall) return

    setEndingCall(true)
    setStage('ended')

    if (!remoteEnded) {
      const signalType =
        !startedByMe && !joinRequestedRef.current && !wasConnectedRef.current
          ? 'declined'
          : 'ended'

      try {
        await signalReadyRef.current
        await sendCallSignal(signalChannelRef.current, {
          type: signalType,
          senderId: currentUserIdRef.current,
        })
      } catch (_error) {
        // ignore signaling errors during teardown
      }
    }

    await stopRingtone()
    cleanupRtcEngine()

    const callStatus = wasConnectedRef.current ? 'completed' : 'cancelled'
    const totalDurationSeconds = wasConnectedRef.current ? durationSeconds : 0

    try {
      await saveAgoraCallHistory({
        conversationId,
        participantId: participant?.id,
        currentUserId: currentUserIdRef.current,
        callKind: 'video',
        callStatus,
        durationSeconds: totalDurationSeconds,
        startedByMe,
      })
    } catch (error) {
      if (!remoteEnded) {
        Alert.alert(
          'Call history failed',
          error?.message || 'Could not save this video call in chat.'
        )
      }
    } finally {
      navigation.goBack()
    }
  }, [cleanupRtcEngine, conversationId, durationSeconds, endingCall, navigation, participant?.id, startedByMe, stopRingtone])

  useEffect(() => {
    const { channel, ready } = subscribeToCallSignals(callSignalKey, (payload) => {
      if (!mountedRef.current) return
      if (payload?.senderId && payload.senderId === currentUserIdRef.current) return

      if (payload?.type === 'accepted' && startedByMe) {
        stopRingtone()
        setStage((current) => (current === 'connected' ? current : 'waiting'))
        return
      }

      if (payload?.type === 'ended' || payload?.type === 'declined') {
        if (endingCallRef.current) return
        endCallRef.current?.({ remoteEnded: true })
      }
    })

    signalChannelRef.current = channel
    signalReadyRef.current = ready.catch(() => null)

    return () => {
      unsubscribeCallSignals(channel)
      signalChannelRef.current = null
      signalReadyRef.current = Promise.resolve(null)
    }
  }, [callSignalKey, startedByMe, stopRingtone])

  useEffect(() => {
    mountedRef.current = true

    async function startVideoCall() {
      if (!joinRequested || hasStartedRef.current) return
      hasStartedRef.current = true

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!mountedRef.current) return

        if (!user?.id || !participant?.id) {
          throw new Error('This call is missing user information.')
        }

        const loadedAgoraModule = loadAgoraModule()

        if (!loadedAgoraModule) {
          throw new Error(
            'Agora native module is not linked in this build yet. Rebuild the app with EAS or a development build and try again.'
          )
        }

        setAgoraModule(loadedAgoraModule)

        const {
          ChannelProfileType,
          ClientRoleType,
          ConnectionStateType,
          VideoSourceType,
          createAgoraRtcEngine,
        } = loadedAgoraModule

        const { appId } = getAgoraRuntimeConfig()

        if (!appId) {
          throw new Error('Agora is not configured yet. Add EXPO_PUBLIC_AGORA_APP_ID and rebuild the app.')
        }

        currentUserIdRef.current = user.id
        const nextLocalUid = hashAgoraUid(user.id)
        setLocalUid(nextLocalUid)

        const channelName =
          channelNameFromRoute ||
          buildAgoraChannelName({
            conversationId,
            callerId: startedByMe ? user.id : participant.id,
            recipientId: startedByMe ? participant.id : user.id,
            kind: 'video',
          })
        const callKey = `video:${route?.params?.callId || channelName}`

        if (!reserveActiveAgoraCall(callKey)) {
          throw new Error('This video call is already opening. Please wait a moment and try again.')
        }

        callKeyRef.current = callKey

        await signalReadyRef.current

        if (startedByMe) {
          await sendCallSignal(signalChannelRef.current, {
            type: 'ringing',
            senderId: user.id,
          })
        } else {
          await sendCallSignal(signalChannelRef.current, {
            type: 'accepted',
            senderId: user.id,
          })
        }

        const token = await resolveAgoraToken({
          channelName,
          uid: nextLocalUid,
          callKind: 'video',
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
          Alert.alert('Agora error', message || 'The video call ran into a problem.')
        })

        engine.addListener('onJoinChannelSuccess', () => {
          if (!mountedRef.current) return
          setStage('waiting')
        })

        engine.addListener('onUserJoined', (_connection, joinedUid) => {
          if (!mountedRef.current) return
          wasConnectedRef.current = true
          connectedAtRef.current = Date.now()
          setRemoteUid(joinedUid)
          setDurationSeconds(0)
          stopRingtone()
          setStage('connected')
        })

        engine.addListener('onUserOffline', () => {
          if (!mountedRef.current) return
          setRemoteUid(null)
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

        engine.setEnableSpeakerphone(true)
        engine.enableVideo()
        engine.startPreview(VideoSourceType.VideoSourceCamera)

        setStage('joining')

        const joinCode = engine.joinChannel(token, channelName, nextLocalUid, {
          channelProfile: ChannelProfileType.ChannelProfileCommunication,
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          publishCameraTrack: true,
          autoSubscribeAudio: true,
          autoSubscribeVideo: true,
          enableAudioRecordingOrPlayout: true,
        })

        if (joinCode < 0) {
          throw new Error(engine.getErrorDescription(joinCode) || `Agora join failed (${joinCode}).`)
        }
      } catch (error) {
        releaseActiveAgoraCall(callKeyRef.current)
        Alert.alert('Video call unavailable', error?.message || 'Could not start the video call.')
        navigation.goBack()
      }
    }

    startVideoCall()

    return () => {
      mountedRef.current = false
      stopRingtone()
      cleanupRtcEngine()
    }
  }, [channelNameFromRoute, cleanupRtcEngine, conversationId, endingCall, endCall, joinRequested, navigation, participant?.id, route?.params?.callId, startedByMe, stopRingtone])

  useEffect(() => {
    if (stage !== 'connected') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return undefined
    }

    intervalRef.current = setInterval(() => {
      const connectedAt = connectedAtRef.current || Date.now()
      setDurationSeconds(Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)))
    }, 500)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [stage])

  useEffect(() => {
    if (!startedByMe) return undefined
    if (stage !== 'joining' && stage !== 'waiting') return undefined
    if (remoteUid) return undefined

    const timeout = setTimeout(() => {
      if (!mountedRef.current || endingCallRef.current || remoteUid) return
      Alert.alert('No answer', `${participantName} did not join the call.`)
      endCallRef.current?.()
    }, 35000)

    return () => clearTimeout(timeout)
  }, [participantName, remoteUid, stage, startedByMe])

  async function acceptIncomingCall() {
    if (endingCall || joinRequested) return
    setJoinRequested(true)
    setStage('preparing')
  }

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
    const engine = rtcEngineRef.current

    if (!engine) return

    engine.muteLocalVideoStream(!cameraOn)
  }, [cameraOn])

  useEffect(() => {
    let cancelled = false

    async function syncRingtone() {
      const shouldRing =
        !endingCall
        && (
          stage === 'incoming'
          || stage === 'joining'
          || stage === 'waiting'
        )

      if (!shouldRing) {
        await stopRingtone()
        return
      }

      if (ringtoneRef.current) return

      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        })

        const { sound } = await Audio.Sound.createAsync(
          require('../../assets/sounds/notification.mp3'),
          {
            shouldPlay: true,
            isLooping: true,
            volume: 0.65,
          }
        )

        if (cancelled) {
          await sound.unloadAsync()
          return
        }

        ringtoneRef.current = sound
      } catch (error) {
        console.warn('Video ringtone failed:', error?.message || error)
      }
    }

    syncRingtone()

    return () => {
      cancelled = true
    }
  }, [endingCall, stage, stopRingtone])

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

            {remoteUid ? (
              AgoraSurfaceView ? (
                <AgoraSurfaceView
                  style={StyleSheet.absoluteFill}
                  canvas={{
                    uid: remoteUid,
                    renderMode: agoraModule.RenderModeType.RenderModeHidden,
                  }}
                />
              ) : null
            ) : (
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
              </View>
            )}

            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 24,
                alignItems: 'center',
                paddingHorizontal: 22,
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: 16,
                  fontWeight: '800',
                  textAlign: 'center',
                }}
              >
                {endingCall
                  ? 'Saving call...'
                  : getStatusLabel(stage, durationSeconds, startedByMe, participantName)}
              </Text>

              {!startedByMe && stage === 'incoming' ? (
                <Text
                  style={{
                    color: '#cbd5e1',
                    fontSize: 13,
                    marginTop: 10,
                    textAlign: 'center',
                    lineHeight: 19,
                  }}
                >
                  Tap join to answer this video call or decline to dismiss it.
                </Text>
              ) : null}
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
                AgoraSurfaceView ? (
                  <AgoraSurfaceView
                    style={{ width: '100%', height: '100%' }}
                    zOrderMediaOverlay
                    canvas={{
                      uid: localUid || 0,
                      renderMode: agoraModule.RenderModeType.RenderModeHidden,
                      sourceType: agoraModule.VideoSourceType.VideoSourceCamera,
                    }}
                  />
                ) : null
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

        {stage === 'incoming' ? (
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 22,
            }}
          >
            <TouchableOpacity
              onPress={() => endCall()}
              disabled={endingCall}
              style={{
                width: 74,
                height: 74,
                borderRadius: 37,
                backgroundColor: '#ef4444',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: endingCall ? 0.75 : 1,
              }}
            >
              <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={acceptIncomingCall}
              style={{
                width: 74,
                height: 74,
                borderRadius: 37,
                backgroundColor: '#16a34a',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="videocam" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <>
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
          </>
        )}
      </View>
    </SafeAreaView>
  )
}
