import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { CommonActions, useFocusEffect } from '@react-navigation/native'
import { Camera } from 'expo-camera'
import Avatar from '../components/common/Avatar'
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

const LOCAL_PREVIEW_WIDTH = 116
const LOCAL_PREVIEW_HEIGHT = 158

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getLocalPreviewDragBounds({ width, height, stage }) {
  const baseBottom = stage === 'incoming' ? 124 : 150
  const baseLeft = width - LOCAL_PREVIEW_WIDTH - 16
  const baseTop = height - LOCAL_PREVIEW_HEIGHT - baseBottom

  return {
    minX: 16 - baseLeft,
    maxX: 0,
    minY: 72 - baseTop,
    maxY: 0,
  }
}

function applyAutoPolishFace(engine, agoraModule) {
  if (!engine) return

  try {
    if (typeof engine.setBeautyEffectOptions === 'function') {
      engine.setBeautyEffectOptions(true, {
        lighteningContrastLevel:
          agoraModule?.LighteningContrastLevel?.LighteningContrastNormal ?? 1,
        lighteningLevel: 0.28,
        smoothnessLevel: 0.42,
        rednessLevel: 0.16,
        sharpnessLevel: 0.18,
      })
    }

    if (typeof engine.setCameraAutoFocusFaceModeEnabled === 'function') {
      engine.setCameraAutoFocusFaceModeEnabled(true)
    }

    if (typeof engine.setCameraAutoExposureFaceModeEnabled === 'function') {
      engine.setCameraAutoExposureFaceModeEnabled(true)
    }

    if (typeof engine.enableFaceDetection === 'function') {
      engine.enableFaceDetection(true)
    }
  } catch (error) {
    console.warn('Auto polish face effect failed:', error?.message || error)
  }
}

export default function VideoCallScreen({ navigation, route }) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
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
  const screenCallKey = useMemo(() => {
    const key = route?.params?.callId || channelNameFromRoute
    return key ? `video:${key}` : null
  }, [channelNameFromRoute, route?.params?.callId])

  const [stage, setStage] = useState(startedByMe ? 'preparing' : 'incoming')
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const [cameraOn, setCameraOn] = useState(true)
  const [speakerOn, setSpeakerOn] = useState(true)
  const [endingCall, setEndingCall] = useState(false)
  const [remoteUid, setRemoteUid] = useState(null)
  const [agoraModule, setAgoraModule] = useState(null)
  const [joinRequested, setJoinRequested] = useState(startedByMe)
  const [cameraPermissionError, setCameraPermissionError] = useState('')
  const [localVideoReady, setLocalVideoReady] = useState(false)
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
  const durationSecondsRef = useRef(0)
  const isJoiningRef = useRef(false)
  const isInChannelRef = useRef(false)
  const stageRef = useRef(stage)
  const joinRequestedRef = useRef(joinRequested)
  const localPreviewPan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current
  const localPreviewDragRef = useRef({ x: 0, y: 0 })
  const isMinimizedRef = useRef(false)

  const minimizeCall = useCallback(() => {
    if (endingCallRef.current || isMinimizedRef.current || !screenCallKey) return

    isMinimizedRef.current = true
    setMinimizedAgoraCall({
      callKey: screenCallKey,
      routeKey: route.key,
      kind: 'video',
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

  const localPreviewPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3,
        onPanResponderGrant: () => {
          localPreviewPan.stopAnimation((value) => {
            localPreviewDragRef.current = value
            localPreviewPan.setOffset(value)
            localPreviewPan.setValue({ x: 0, y: 0 })
          })
        },
        onPanResponderMove: Animated.event(
          [null, { dx: localPreviewPan.x, dy: localPreviewPan.y }],
          { useNativeDriver: false }
        ),
        onPanResponderRelease: () => {
          localPreviewPan.flattenOffset()
          const bounds = getLocalPreviewDragBounds({
            width: windowWidth,
            height: windowHeight,
            stage,
          })
          const current = localPreviewDragRef.current
          const nextValue = {
            x: clamp(current.x, bounds.minX, bounds.maxX),
            y: clamp(current.y, bounds.minY, bounds.maxY),
          }

          localPreviewDragRef.current = nextValue
          Animated.spring(localPreviewPan, {
            toValue: nextValue,
            useNativeDriver: false,
            friction: 8,
            tension: 95,
          }).start()
        },
        onPanResponderTerminate: () => {
          localPreviewPan.flattenOffset()
        },
      }),
    [localPreviewPan, stage, windowHeight, windowWidth]
  )

  useEffect(() => {
    endCallRef.current = endCall
  })

  useEffect(() => {
    const listenerId = localPreviewPan.addListener((value) => {
      localPreviewDragRef.current = value
    })

    return () => {
      localPreviewPan.removeListener(listenerId)
    }
  }, [localPreviewPan])

  useEffect(() => {
    const bounds = getLocalPreviewDragBounds({
      width: windowWidth,
      height: windowHeight,
      stage,
    })
    const current = localPreviewDragRef.current
    const nextValue = {
      x: clamp(current.x, bounds.minX, bounds.maxX),
      y: clamp(current.y, bounds.minY, bounds.maxY),
    }

    if (nextValue.x === current.x && nextValue.y === current.y) return

    localPreviewDragRef.current = nextValue
    Animated.spring(localPreviewPan, {
      toValue: nextValue,
      useNativeDriver: false,
      friction: 8,
      tension: 95,
    }).start()
  }, [localPreviewPan, stage, windowHeight, windowWidth])

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
      engine.stopPreview()
      engine.leaveChannel()
      engine.release(true)
    } catch (error) {
      console.warn('Video call cleanup failed:', error?.message || error)
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

        await requestCallMicrophonePermission()

        const requestCameraPermission = Camera?.requestCameraPermissionsAsync

        if (typeof requestCameraPermission !== 'function') {
          throw new Error('Camera permission is not available in this build. Please install the latest APK and try again.')
        }

        const cameraPermission = await requestCameraPermission()

        if (cameraPermission.status !== 'granted') {
          setCameraPermissionError('Camera permission is needed for video calls.')
          setCameraOn(false)
          throw new Error('Camera permission is needed for video calls.')
        }

        setCameraPermissionError('')

        currentUserIdRef.current = user.id
        const nextLocalUid = hashAgoraUid(user.id)

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

        engine.addListener('onFirstLocalVideoFrame', () => {
          if (!mountedRef.current) return
          setLocalVideoReady(true)
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
          endCallRef.current?.({ remoteEnded: true })
        })

        engine.addListener('onConnectionStateChanged', (_connection, state) => {
          if (!mountedRef.current || endingCallRef.current) return

          if (state === ConnectionStateType.ConnectionStateConnecting) {
            setStage('joining')
          }

          if (
            state === ConnectionStateType.ConnectionStateDisconnected
            && wasConnectedRef.current
          ) {
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
        engine.enableVideo()
        engine.enableLocalVideo(true)
        applyAutoPolishFace(engine, loadedAgoraModule)
        engine.startPreview(VideoSourceType.VideoSourceCamera)

        setStage('joining')

        if (isJoiningRef.current || isInChannelRef.current) {
          throw new Error('Agora is already joining this call. Please wait a moment.')
        }

        isJoiningRef.current = true

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
        Alert.alert('Video call unavailable', error?.message || 'Could not start the video call.')
        navigation.goBack()
      }
    }

    startVideoCall()

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
    setCallAudioRoute(speakerOn).catch(() => null)
  }, [speakerOn])

  useEffect(() => {
    const engine = rtcEngineRef.current

    if (!engine) return

    engine.muteLocalVideoStream(!cameraOn)
    engine.enableLocalVideo(cameraOn)
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
        console.warn('Video ringtone failed:', error?.message || error)
      }
    }

    syncRingtone()

    return () => {
      cancelled = true
    }
  }, [endingCall, stage, stopRingtone])

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

  const statusText = endingCall
    ? 'Saving call...'
    : getStatusLabel(stage, durationSeconds, startedByMe, participantName)
  const routeLabel = speakerOn ? 'Loud speaker' : 'Normal speaker'
  const showLocalPreview = cameraOn && AgoraSurfaceView && !cameraPermissionError

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#030712' }}>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: '#020617' }}>
          {remoteUid && AgoraSurfaceView ? (
            <AgoraSurfaceView
              style={StyleSheet.absoluteFill}
              canvas={{
                uid: remoteUid,
                renderMode: agoraModule.RenderModeType.RenderModeHidden,
                sourceType: agoraModule.VideoSourceType.VideoSourceRemote,
              }}
            />
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 26,
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  top: -80,
                  left: -50,
                  width: 260,
                  height: 260,
                  borderRadius: 130,
                  backgroundColor: 'rgba(37,99,235,0.22)',
                }}
              />
              <View
                style={{
                  position: 'absolute',
                  bottom: -110,
                  right: -60,
                  width: 290,
                  height: 290,
                  borderRadius: 145,
                  backgroundColor: 'rgba(20,184,166,0.16)',
                }}
              />
              <Avatar
                profile={participant}
                name={participantName}
                size={124}
                borderWidth={5}
                borderColor="rgba(255,255,255,0.26)"
                backgroundColor="#dbeafe"
                textColor="#1d4ed8"
              />
              <Text
                style={{
                  color: '#fff',
                  fontSize: 30,
                  fontWeight: '900',
                  marginTop: 20,
                  textAlign: 'center',
                }}
                numberOfLines={2}
              >
                {participantName}
              </Text>
            </View>
          )}

          <View
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: remoteUid ? 'rgba(2,6,23,0.16)' : 'transparent',
            }}
            pointerEvents="none"
          />

          <View
            style={{
              position: 'absolute',
              top: 14,
              left: 16,
              right: 16,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <View
              style={{
                maxWidth: '76%',
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 10,
                backgroundColor: 'rgba(2,6,23,0.58)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.12)',
              }}
            >
              <Text style={{ color: '#bfdbfe', fontSize: 12, fontWeight: '900' }}>Video call</Text>
              <Text
                style={{
                  color: stage === 'connected' ? '#bbf7d0' : '#fff',
                  fontSize: stage === 'connected' ? 28 : 15,
                  fontWeight: '900',
                  marginTop: 4,
                  fontVariant: ['tabular-nums'],
                }}
                numberOfLines={2}
              >
                {statusText}
              </Text>
              {property?.title ? (
                <Text style={{ color: '#cbd5e1', fontSize: 12, fontWeight: '700', marginTop: 5 }} numberOfLines={1}>
                  {property.title}
                </Text>
              ) : null}
            </View>

            <TouchableOpacity
              accessibilityLabel="Minimize call"
              onPress={minimizeCall}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: 'rgba(2,6,23,0.58)',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.12)',
              }}
            >
              <Ionicons name="chevron-down" size={23} color="#fff" />
            </TouchableOpacity>
          </View>

          <Animated.View
            {...localPreviewPanResponder.panHandlers}
            style={{
              position: 'absolute',
              right: 16,
              bottom: stage === 'incoming' ? 124 : 150,
              width: LOCAL_PREVIEW_WIDTH,
              height: LOCAL_PREVIEW_HEIGHT,
              borderRadius: 24,
              backgroundColor: '#0f172a',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.18)',
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
              transform: localPreviewPan.getTranslateTransform(),
            }}
          >
            {showLocalPreview ? (
              <>
                <AgoraSurfaceView
                  style={{ width: '100%', height: '100%' }}
                  zOrderMediaOverlay
                  canvas={{
                    uid: 0,
                    renderMode: agoraModule.RenderModeType.RenderModeHidden,
                    sourceType: agoraModule.VideoSourceType.VideoSourceCamera,
                  }}
                />
                {!localVideoReady ? (
                  <View
                    style={{
                      ...StyleSheet.absoluteFillObject,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(15,23,42,0.58)',
                    }}
                  >
                    <ActivityIndicator color="#fff" />
                    <Text style={{ color: '#dbeafe', fontSize: 11, fontWeight: '800', marginTop: 7 }}>
                      Camera
                    </Text>
                  </View>
                ) : null}
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    right: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      borderRadius: 999,
                      paddingHorizontal: 7,
                      paddingVertical: 4,
                      backgroundColor: 'rgba(2,6,23,0.52)',
                    }}
                  >
                    <Ionicons name="sparkles" size={11} color="#fde68a" />
                    <Text style={{ color: '#fff7ed', fontSize: 9, fontWeight: '900' }}>
                      Polish
                    </Text>
                  </View>
                  <Ionicons name="move-outline" size={15} color="rgba(255,255,255,0.86)" />
                </View>
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 42,
                    alignSelf: 'center',
                    width: 54,
                    height: 70,
                    borderRadius: 30,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.2)',
                    backgroundColor: 'rgba(255,255,255,0.045)',
                  }}
                />
              </>
            ) : (
              <View style={{ alignItems: 'center', paddingHorizontal: 10 }}>
                <Ionicons name="videocam-off" size={28} color="#cbd5e1" />
                <Text style={{ color: '#cbd5e1', fontSize: 11, fontWeight: '800', marginTop: 8, textAlign: 'center' }}>
                  {cameraPermissionError || 'Camera off'}
                </Text>
              </View>
            )}
          </Animated.View>

          <View
            style={{
              position: 'absolute',
              left: 16,
              bottom: stage === 'incoming' ? 124 : 150,
              flexDirection: 'row',
              gap: 8,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderRadius: 999,
                paddingHorizontal: 11,
                paddingVertical: 7,
                backgroundColor: 'rgba(2,6,23,0.62)',
              }}
            >
              <Ionicons name={speakerOn ? 'volume-high' : 'phone-portrait-outline'} size={15} color="#93c5fd" />
              <Text style={{ color: '#dbeafe', fontSize: 12, fontWeight: '900' }}>{routeLabel}</Text>
            </View>
          </View>
        </View>

        {stage === 'incoming' ? (
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 20,
              borderRadius: 30,
              padding: 14,
              backgroundColor: 'rgba(2,6,23,0.86)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.14)',
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
                <Ionicons name="videocam" size={21} color="#93c5fd" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: '#bfdbfe', fontSize: 12, fontWeight: '900' }}>
                  Incoming video call
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
                <Ionicons name="videocam" size={24} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>
                  Answer
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View
            style={{
              position: 'absolute',
              left: 14,
              right: 14,
              bottom: 20,
              paddingHorizontal: 12,
              paddingVertical: 14,
              borderRadius: 30,
              backgroundColor: 'rgba(2,6,23,0.82)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.12)',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <TouchableOpacity onPress={() => setMuted((current) => !current)} style={{ alignItems: 'center', width: 66 }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: muted ? '#fee2e2' : 'rgba(255,255,255,0.1)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={muted ? 'mic-off' : 'mic'} size={22} color={muted ? '#dc2626' : '#fff'} />
              </View>
              <Text style={{ color: '#cbd5e1', marginTop: 7, fontSize: 11, fontWeight: '800' }}>
                {muted ? 'Unmute' : 'Mute'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setCameraOn((current) => !current)} style={{ alignItems: 'center', width: 66 }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: cameraOn ? 'rgba(255,255,255,0.1)' : '#fee2e2',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={cameraOn ? 'videocam' : 'videocam-off'} size={22} color={cameraOn ? '#fff' : '#dc2626'} />
              </View>
              <Text style={{ color: '#cbd5e1', marginTop: 7, fontSize: 11, fontWeight: '800' }}>
                {cameraOn ? 'Camera' : 'Off'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => endCall()} disabled={endingCall} style={{ alignItems: 'center' }}>
              <View
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
                {endingCall ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setSpeakerOn((current) => !current)} style={{ alignItems: 'center', width: 66 }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  backgroundColor: speakerOn ? '#dbeafe' : 'rgba(255,255,255,0.1)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name={speakerOn ? 'volume-high' : 'phone-portrait-outline'} size={22} color={speakerOn ? '#2563eb' : '#fff'} />
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
