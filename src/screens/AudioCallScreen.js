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
import { CommonActions, useFocusEffect } from '@react-navigation/native'
import {
  buildAgoraChannelName,
  clearActiveAgoraEngine,
  clearMinimizedAgoraCall,
  getAgoraRuntimeConfig,
  hashAgoraUid,
  loadAgoraModule,
  releaseActiveAgoraCall,
  replaceActiveAgoraEngine,
  reserveActiveAgoraCall,
  resolveAgoraToken,
  saveAgoraCallHistory,
  setMinimizedAgoraCall,
  updateMinimizedAgoraCall,
} from '../lib/agoraCall'
import {
  buildCallSignalKey,
  sendCallSignal,
  subscribeToCallSignals,
  unsubscribeCallSignals,
} from '../lib/callSignaling'
import Avatar from '../components/common/Avatar'
import { getProfileName } from '../lib/userDisplay'
import { supabase } from '../lib/supabase'
import { createRingtoneSound } from '../lib/sounds'
import {
  requestCallMicrophonePermission,
  resetCallAudioRoute,
  setCallAudioRoute,
  setCallRingtoneAudioMode,
} from '../lib/callAudioRoute'

function formatCallDuration(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds || 0)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function getStatusLabel(stage, durationSeconds, startedByMe, participantName) {
  if (stage === 'incoming') return `${participantName} is calling...`
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
  const callSignalKey = useMemo(
    () => buildCallSignalKey('audio', { callId: route?.params?.callId, channelName: channelNameFromRoute }),
    [channelNameFromRoute, route?.params?.callId]
  )
  const screenCallKey = useMemo(() => {
    const key = route?.params?.callId || channelNameFromRoute
    return key ? `audio:${key}` : null
  }, [channelNameFromRoute, route?.params?.callId])

  const [stage, setStage] = useState(startedByMe ? 'preparing' : 'incoming')
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [endingCall, setEndingCall] = useState(false)
  const [remoteJoined, setRemoteJoined] = useState(false)
  const [joinRequested, setJoinRequested] = useState(startedByMe)

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
  const durationSecondsRef = useRef(0)
  const isJoiningRef = useRef(false)
  const isInChannelRef = useRef(false)
  const stageRef = useRef(stage)
  const joinRequestedRef = useRef(joinRequested)
  const isMinimizedRef = useRef(false)

  const minimizeCall = useCallback(() => {
    if (endingCallRef.current || isMinimizedRef.current || !screenCallKey) return

    isMinimizedRef.current = true
    setMinimizedAgoraCall({
      callKey: screenCallKey,
      routeKey: route.key,
      kind: 'audio',
      participantName,
      statusText: getStatusLabel(
        stageRef.current,
        durationSecondsRef.current,
        startedByMe,
        participantName
      ),
      onEnd: () => endCallRef.current?.(),
    })

    navigation.dispatch((state) => {
      const routeIndex = state.routes.findIndex((item) => item.key === route.key)

      if (routeIndex <= 0) {
        isMinimizedRef.current = false
        clearMinimizedAgoraCall(screenCallKey)
        return CommonActions.reset(state)
      }

      const callRoute = state.routes[routeIndex]
      const routes = [
        callRoute,
        ...state.routes.filter((item) => item.key !== route.key),
      ]

      return CommonActions.reset({
        ...state,
        routes,
        index: routes.length - 1,
      })
    })
  }, [navigation, participantName, route.key, screenCallKey, startedByMe])

  useEffect(() => {
    endCallRef.current = endCall
  })

  useEffect(() => {
    endingCallRef.current = endingCall
  }, [endingCall])

  useEffect(() => {
    durationSecondsRef.current = durationSeconds
  }, [durationSeconds])

  useEffect(() => {
    stageRef.current = stage
  }, [stage])

  useEffect(() => {
    joinRequestedRef.current = joinRequested
  }, [joinRequested])

  useEffect(() => {
    if (!screenCallKey) return undefined

    if (!reserveActiveAgoraCall(screenCallKey)) {
      Alert.alert('Line busy', 'End the current call before opening another one.')
      navigation.goBack()
      return undefined
    }

    callKeyRef.current = screenCallKey
    return undefined
  }, [navigation, screenCallKey])

  const cleanupRtcEngine = useCallback(() => {
    if (cleanedUpRef.current) return

    cleanedUpRef.current = true
    isJoiningRef.current = false
    isInChannelRef.current = false

    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    const engine = rtcEngineRef.current
    const callKey = callKeyRef.current
    rtcEngineRef.current = null

    if (!engine) {
      releaseActiveAgoraCall(callKey)
      return
    }

    try {
      engine.removeAllListeners()
      engine.leaveChannel()
      engine.release(true)
    } catch (error) {
      console.warn('Audio call cleanup failed:', error?.message || error)
    } finally {
      clearActiveAgoraEngine(engine)
      releaseActiveAgoraCall(callKey)
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
    if (endingCallRef.current) return

    endingCallRef.current = true
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
    await resetCallAudioRoute().catch(() => null)

    const callStatus = wasConnectedRef.current ? 'completed' : 'cancelled'
    const totalDurationSeconds = wasConnectedRef.current ? durationSecondsRef.current : 0

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
      const callKey = callKeyRef.current || screenCallKey
      clearMinimizedAgoraCall(callKey)

      if (isMinimizedRef.current) {
        navigation.dispatch((state) => {
          const routes = state.routes.filter((item) => item.key !== route.key)

          if (!routes.length) {
            return CommonActions.goBack()
          }

          return CommonActions.reset({
            ...state,
            routes,
            index: Math.min(state.index, routes.length - 1),
          })
        })
        return
      }

      navigation.goBack()
    }
  }, [cleanupRtcEngine, conversationId, navigation, participant?.id, route.key, screenCallKey, startedByMe, stopRingtone])

  useEffect(() => {
    const { channel, ready } = subscribeToCallSignals(callSignalKey, (payload) => {
      if (!mountedRef.current) return
      if (payload?.senderId && payload.senderId === currentUserIdRef.current) return

      if (payload?.type === 'accepted' && startedByMe) {
        stopRingtone()
        setStage((current) => (current === 'connected' ? current : 'waiting'))
        return
      }

      if (payload?.type === 'busy' && startedByMe) {
        if (endingCallRef.current) return
        Alert.alert('Line busy', `${participantName} is already on another call.`)
        endCallRef.current?.({ remoteEnded: true })
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
  }, [callSignalKey, participantName, startedByMe, stopRingtone])

  useEffect(() => {
    mountedRef.current = true

    async function startAudioCall() {
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

        await requestCallMicrophonePermission()

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
        const callKey = `audio:${route?.params?.callId || channelName}`

        if (!reserveActiveAgoraCall(callKey)) {
          throw new Error('This audio call is already opening. Please wait a moment and try again.')
        }

        callKeyRef.current = callKey

        await signalReadyRef.current

        if (startedByMe) {
          await sendCallSignal(signalChannelRef.current, {
            type: 'ringing',
            senderId: user.id,
          })
        }

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
          isJoiningRef.current = false
          isInChannelRef.current = true
          if (!startedByMe) {
            sendCallSignal(signalChannelRef.current, {
              type: 'accepted',
              senderId: currentUserIdRef.current,
            }).catch(() => null)
          }
          setStage('waiting')
        })

        engine.addListener('onUserJoined', () => {
          if (!mountedRef.current) return
          wasConnectedRef.current = true
          connectedAtRef.current = Date.now()
          setRemoteJoined(true)
          setDurationSeconds(0)
          stopRingtone()
          setStage('connected')
        })

        engine.addListener('onUserOffline', () => {
          if (!mountedRef.current) return
          setRemoteJoined(false)
          endCallRef.current?.({ remoteEnded: true })
        })

        engine.addListener('onConnectionStateChanged', (_connection, state) => {
          if (!mountedRef.current || endingCallRef.current) return

          if (state === ConnectionStateType.ConnectionStateConnecting) {
            setStage('joining')
          }

          if (state === ConnectionStateType.ConnectionStateDisconnected && wasConnectedRef.current) {
            endCallRef.current?.({ remoteEnded: true })
          }
        })

        engine.enableAudio()
        engine.enableLocalAudio?.(true)
        engine.muteLocalAudioStream(false)
        engine.muteAllRemoteAudioStreams?.(false)
        engine.adjustRecordingSignalVolume?.(100)
        engine.adjustPlaybackSignalVolume?.(100)
        engine.setEnableSpeakerphone(true)
        await setCallAudioRoute(true)

        setStage('joining')

        if (isJoiningRef.current || isInChannelRef.current) {
          throw new Error('Agora is already joining this call. Please wait a moment.')
        }

        isJoiningRef.current = true

        const joinCode = engine.joinChannel(token, channelName, localUid, {
          channelProfile: ChannelProfileType.ChannelProfileCommunication,
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
          publishMicrophoneTrack: true,
          autoSubscribeAudio: true,
          autoSubscribeVideo: false,
          enableAudioRecordingOrPlayout: true,
        })

        if (joinCode < 0) {
          isJoiningRef.current = false
          throw new Error(engine.getErrorDescription(joinCode) || `Agora join failed (${joinCode}).`)
        }
      } catch (error) {
        isJoiningRef.current = false
        isInChannelRef.current = false
        if (!startedByMe && currentUserIdRef.current) {
          try {
            await signalReadyRef.current
            await sendCallSignal(signalChannelRef.current, {
              type: 'declined',
              senderId: currentUserIdRef.current,
            })
          } catch (_signalError) {
            // ignore failed join teardown signaling
          }
        }
        releaseActiveAgoraCall(callKeyRef.current)
        cleanupRtcEngine()
        Alert.alert('Audio call unavailable', error?.message || 'Could not start the audio call.')
        navigation.goBack()
      }
    }

    startAudioCall()

    return () => {
      mountedRef.current = false
      stopRingtone()
      cleanupRtcEngine()
      resetCallAudioRoute().catch(() => null)
    }
  }, [channelNameFromRoute, cleanupRtcEngine, conversationId, endCall, joinRequested, navigation, participant?.id, route?.params?.callId, startedByMe, stopRingtone])

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
    if (remoteJoined) return undefined

    const timeout = setTimeout(() => {
      if (!mountedRef.current || endingCallRef.current || remoteJoined) return
      Alert.alert('No answer', `${participantName} did not join the call.`)
      endCallRef.current?.()
    }, 35000)

    return () => clearTimeout(timeout)
  }, [participantName, remoteJoined, stage, startedByMe])

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
    setCallAudioRoute(speakerOn).catch(() => null)
  }, [speakerOn])

  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      minimizeCall()
      return true
    })

    return () => {
      subscription.remove()
    }
  }, [minimizeCall]))

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (!isMinimizedRef.current) return

      isMinimizedRef.current = false
      clearMinimizedAgoraCall(screenCallKey)
    })

    return unsubscribe
  }, [navigation, screenCallKey])

  useEffect(() => {
    if (!isMinimizedRef.current || !screenCallKey) return

    updateMinimizedAgoraCall(screenCallKey, {
      statusText: endingCall
        ? 'Ending call...'
        : getStatusLabel(stage, durationSeconds, startedByMe, participantName),
    })
  }, [durationSeconds, endingCall, participantName, screenCallKey, stage, startedByMe])

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
        await setCallRingtoneAudioMode()

        const sound = await createRingtoneSound({
          conversationId,
          shouldPlay: true,
          isLooping: true,
          volume: 0.65,
        })

        if (!sound) return

        if (cancelled) {
          await sound.unloadAsync()
          return
        }

        ringtoneRef.current = sound
      } catch (error) {
        console.warn('Audio ringtone failed:', error?.message || error)
      }
    }

    syncRingtone()

    return () => {
      cancelled = true
    }
  }, [endingCall, stage, stopRingtone])

  const statusText = endingCall
    ? 'Saving call...'
    : getStatusLabel(stage, durationSeconds, startedByMe, participantName)
  const routeLabel = speakerOn ? 'Loud speaker' : 'Normal speaker'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#050914' }}>
      <View style={{ flex: 1, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 9,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Ionicons name="call-outline" size={16} color="#93c5fd" />
            <Text style={{ color: '#e0f2fe', fontSize: 12, fontWeight: '900' }}>Audio call</Text>
          </View>

          <TouchableOpacity
            accessibilityLabel="Minimize call"
            onPress={minimizeCall}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: 'rgba(255,255,255,0.1)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="chevron-down" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View
          style={{
            flex: 1,
            marginTop: 18,
            borderRadius: 34,
            backgroundColor: '#0f172a',
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(147,197,253,0.18)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 22,
          }}
        >
          <View
            style={{
              position: 'absolute',
              top: -110,
              width: 260,
              height: 260,
              borderRadius: 130,
              backgroundColor: 'rgba(59,130,246,0.22)',
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: -120,
              right: -50,
              width: 250,
              height: 250,
              borderRadius: 125,
              backgroundColor: 'rgba(20,184,166,0.16)',
            }}
          />

          <View
            style={{
              width: 176,
              height: 176,
              borderRadius: 88,
              backgroundColor: 'rgba(255,255,255,0.07)',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.13)',
            }}
          >
            <Avatar
              profile={participant}
              name={participantName}
              size={134}
              borderWidth={5}
              borderColor={remoteJoined ? '#22c55e' : '#60a5fa'}
              backgroundColor="#dbeafe"
              textColor="#1d4ed8"
            />
          </View>

          <Text
            style={{
              color: '#fff',
              fontSize: 30,
              fontWeight: '900',
              marginTop: 24,
              textAlign: 'center',
            }}
            numberOfLines={2}
          >
            {participantName}
          </Text>

          <Text
            style={{
              color: stage === 'connected' ? '#bbf7d0' : '#bfdbfe',
              fontSize: stage === 'connected' ? 32 : 15,
              fontWeight: stage === 'connected' ? '900' : '800',
              marginTop: 10,
              textAlign: 'center',
              fontVariant: ['tabular-nums'],
            }}
          >
            {statusText}
          </Text>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 18, flexWrap: 'wrap', justifyContent: 'center' }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 7,
                backgroundColor: remoteJoined ? 'rgba(34,197,94,0.16)' : 'rgba(255,255,255,0.08)',
              }}
            >
              <Ionicons name={remoteJoined ? 'radio' : 'hourglass-outline'} size={15} color={remoteJoined ? '#86efac' : '#cbd5e1'} />
              <Text style={{ color: remoteJoined ? '#bbf7d0' : '#e2e8f0', fontSize: 12, fontWeight: '900' }}>
                {remoteJoined ? 'Connected' : 'Waiting'}
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 7,
                backgroundColor: 'rgba(96,165,250,0.14)',
              }}
            >
              <Ionicons name={speakerOn ? 'volume-high' : 'phone-portrait-outline'} size={15} color="#93c5fd" />
              <Text style={{ color: '#dbeafe', fontSize: 12, fontWeight: '900' }}>{routeLabel}</Text>
            </View>
          </View>

          {property?.title ? (
            <Text
              style={{
                color: '#cbd5e1',
                fontSize: 13,
                fontWeight: '700',
                marginTop: 18,
                textAlign: 'center',
              }}
              numberOfLines={2}
            >
              {property.title}
            </Text>
          ) : null}
        </View>

        {stage === 'incoming' ? (
          <View
            style={{
              marginTop: 18,
              borderRadius: 30,
              padding: 14,
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  backgroundColor: 'rgba(59,130,246,0.18)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="call" size={21} color="#93c5fd" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: '#bfdbfe', fontSize: 12, fontWeight: '900' }}>
                  Incoming audio call
                </Text>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900', marginTop: 2 }} numberOfLines={1}>
                  {participantName}
                </Text>
              </View>
              <View
                style={{
                  borderRadius: 999,
                  paddingHorizontal: 9,
                  paddingVertical: 5,
                  backgroundColor: 'rgba(34,197,94,0.14)',
                }}
              >
                <Text style={{ color: '#bbf7d0', fontSize: 11, fontWeight: '900' }}>
                  Ringing
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => endCall()}
                disabled={endingCall}
                activeOpacity={0.84}
                style={{
                  flex: 1,
                  height: 62,
                  borderRadius: 22,
                  backgroundColor: 'rgba(239,68,68,0.95)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                  opacity: endingCall ? 0.75 : 1,
                }}
              >
                <Ionicons name="call" size={24} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>
                  Decline
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={acceptIncomingCall}
                activeOpacity={0.84}
                style={{
                  flex: 1,
                  height: 62,
                  borderRadius: 22,
                  backgroundColor: '#22c55e',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                  gap: 8,
                }}
              >
                <Ionicons name="call" size={24} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>
                  Answer
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View
            style={{
              marginTop: 18,
              paddingHorizontal: 12,
              paddingVertical: 14,
              borderRadius: 28,
              backgroundColor: 'rgba(255,255,255,0.08)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.1)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <TouchableOpacity onPress={() => setMuted((current) => !current)} style={{ alignItems: 'center', width: 72 }}>
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  backgroundColor: muted ? '#fee2e2' : 'rgba(255,255,255,0.1)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={muted ? 'mic-off' : 'mic'} size={23} color={muted ? '#dc2626' : '#fff'} />
              </View>
              <Text style={{ color: '#cbd5e1', marginTop: 7, fontSize: 11, fontWeight: '800' }}>
                {muted ? 'Unmute' : 'Mute'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => endCall()} disabled={endingCall} style={{ alignItems: 'center' }}>
              <View
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: 38,
                  backgroundColor: '#ef4444',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: endingCall ? 0.75 : 1,
                }}
              >
                {endingCall ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setSpeakerOn((current) => !current)} style={{ alignItems: 'center', width: 72 }}>
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  backgroundColor: speakerOn ? '#dbeafe' : 'rgba(255,255,255,0.1)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={speakerOn ? 'volume-high' : 'phone-portrait-outline'} size={23} color={speakerOn ? '#2563eb' : '#fff'} />
              </View>
              <Text style={{ color: '#cbd5e1', marginTop: 7, fontSize: 11, fontWeight: '800' }}>
                {speakerOn ? 'Speaker' : 'Normal'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}
