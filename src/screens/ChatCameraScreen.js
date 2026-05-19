import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Alert,
  Easing,
  Image,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'
import { captureRef } from 'react-native-view-shot'

const FILTERS = [
  { id: 'none', label: 'Normal', tint: 'transparent' },
  { id: 'shades', label: 'Shades', tint: 'rgba(15,23,42,0.08)' },
  { id: 'bunny', label: 'Bunny', tint: 'rgba(244,114,182,0.09)' },
  { id: 'alien', label: 'Alien', tint: 'rgba(34,197,94,0.12)' },
  { id: 'comic', label: 'Comic', tint: 'rgba(251,191,36,0.12)' },
]

function FunnyOverlay({ filterId }) {
  const bob = useRef(new Animated.Value(0)).current
  const blink = useRef(new Animated.Value(1)).current
  const sparkle = useRef(new Animated.Value(0)).current
  const comicScale = useRef(new Animated.Value(0.96)).current

  useEffect(() => {
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    )

    const blinkLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(1000),
        Animated.timing(blink, {
          toValue: 0.15,
          duration: 85,
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.delay(1500),
        Animated.timing(blink, {
          toValue: 0.08,
          duration: 65,
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 95,
          useNativeDriver: true,
        }),
      ])
    )

    const sparkleLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkle, {
          toValue: 1,
          duration: 760,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sparkle, {
          toValue: 0,
          duration: 760,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    )

    const comicLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(comicScale, {
          toValue: 1.08,
          duration: 620,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
        Animated.timing(comicScale, {
          toValue: 0.97,
          duration: 720,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    )

    bobLoop.start()
    blinkLoop.start()
    sparkleLoop.start()
    comicLoop.start()

    return () => {
      bobLoop.stop()
      blinkLoop.stop()
      sparkleLoop.stop()
      comicLoop.stop()
    }
  }, [blink, bob, comicScale, sparkle])

  const earTranslateY = bob.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -11],
  })
  const earRotateLeft = bob.interpolate({
    inputRange: [0, 1],
    outputRange: ['-18deg', '-10deg'],
  })
  const earRotateRight = bob.interpolate({
    inputRange: [0, 1],
    outputRange: ['18deg', '10deg'],
  })
  const glassesTranslateY = bob.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -4],
  })
  const glassesScaleY = blink.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.58],
  })
  const sparkleOpacity = sparkle.interpolate({
    inputRange: [0, 1],
    outputRange: [0.26, 1],
  })
  const sparkleScale = sparkle.interpolate({
    inputRange: [0, 1],
    outputRange: [0.75, 1.2],
  })

  if (filterId === 'shades') {
    return (
      <>
        <Animated.View
          style={{
            position: 'absolute',
            top: '34%',
            left: '18%',
            right: '18%',
            height: 46,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ translateY: glassesTranslateY }, { scaleY: glassesScaleY }],
          }}
        >
          <View
            style={{
              width: 84,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(15,23,42,0.76)',
              borderWidth: 3,
              borderColor: '#0f172a',
            }}
          />
          <View style={{ width: 16, height: 6, backgroundColor: '#0f172a' }} />
          <View
            style={{
              width: 84,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(15,23,42,0.76)',
              borderWidth: 3,
              borderColor: '#0f172a',
            }}
          />
        </Animated.View>

        <Animated.Text
          style={{
            position: 'absolute',
            bottom: '18%',
            alignSelf: 'center',
            fontSize: 40,
            opacity: sparkleOpacity,
            transform: [{ scale: sparkleScale }],
          }}
        >
          😎
        </Animated.Text>
      </>
    )
  }

  if (filterId === 'bunny') {
    return (
      <>
        <Animated.View
          style={{
            position: 'absolute',
            top: '10%',
            left: '26%',
            width: 54,
            height: 130,
            borderRadius: 30,
            backgroundColor: '#fff',
            borderWidth: 4,
            borderColor: '#f9a8d4',
            transform: [{ translateY: earTranslateY }, { rotate: earRotateLeft }],
          }}
        />
        <Animated.View
          style={{
            position: 'absolute',
            top: '10%',
            right: '26%',
            width: 54,
            height: 130,
            borderRadius: 30,
            backgroundColor: '#fff',
            borderWidth: 4,
            borderColor: '#f9a8d4',
            transform: [{ translateY: earTranslateY }, { rotate: earRotateRight }],
          }}
        />
        <Animated.Text
          style={{
            position: 'absolute',
            top: '48%',
            alignSelf: 'center',
            fontSize: 32,
            transform: [{ translateY: glassesTranslateY }],
          }}
        >
          🐰
        </Animated.Text>
      </>
    )
  }

  if (filterId === 'alien') {
    return (
      <>
        <View
          style={{
            position: 'absolute',
            top: '28%',
            left: '14%',
            right: '14%',
            bottom: '20%',
            borderRadius: 999,
            borderWidth: 3,
            borderColor: 'rgba(74,222,128,0.7)',
            backgroundColor: 'rgba(34,197,94,0.08)',
          }}
        />
        <Animated.Text
          style={{
            position: 'absolute',
            top: '33%',
            left: '22%',
            fontSize: 36,
            opacity: sparkleOpacity,
            transform: [{ scale: sparkleScale }],
          }}
        >
          👽
        </Animated.Text>
        <Animated.Text
          style={{
            position: 'absolute',
            top: '33%',
            right: '22%',
            fontSize: 36,
            opacity: sparkleOpacity,
            transform: [{ scale: sparkleScale }],
          }}
        >
          👽
        </Animated.Text>
      </>
    )
  }

  if (filterId === 'comic') {
    return (
      <>
        <Animated.Text
          style={{
            position: 'absolute',
            top: '16%',
            right: '10%',
            fontSize: 28,
            fontWeight: '900',
            opacity: sparkleOpacity,
            transform: [{ scale: sparkleScale }],
          }}
        >
          💥
        </Animated.Text>
        <Animated.Text
          style={{
            position: 'absolute',
            top: '34%',
            left: '16%',
            fontSize: 36,
            opacity: sparkleOpacity,
            transform: [{ scale: sparkleScale }],
          }}
        >
          🤩
        </Animated.Text>
        <Animated.Text
          style={{
            position: 'absolute',
            top: '34%',
            right: '16%',
            fontSize: 36,
            opacity: sparkleOpacity,
            transform: [{ scale: sparkleScale }],
          }}
        >
          🤩
        </Animated.Text>
        <Animated.Text
          style={{
            position: 'absolute',
            bottom: '14%',
            alignSelf: 'center',
            fontSize: 24,
            fontWeight: '900',
            transform: [{ scale: comicScale }],
          }}
        >
          POW!
        </Animated.Text>
      </>
    )
  }

  return null
}

function FilterChip({ filter, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 18,
        marginRight: 8,
        backgroundColor: active ? '#1877F2' : 'rgba(255,255,255,0.12)',
        borderWidth: 1,
        borderColor: active ? '#1877F2' : 'rgba(255,255,255,0.18)',
      }}
    >
      <Text
        style={{
          color: '#fff',
          fontSize: 12,
          fontWeight: '800',
        }}
      >
        {filter.label}
      </Text>
    </TouchableOpacity>
  )
}

export default function ChatCameraScreen({ navigation, route }) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions()
  const [facing, setFacing] = useState('front')
  const [capturing, setCapturing] = useState(false)
  const [sending, setSending] = useState(false)
  const [capturedPhoto, setCapturedPhoto] = useState(null)
  const [selectedFilterId, setSelectedFilterId] = useState('shades')
  const cameraRef = useRef(null)
  const previewCaptureRef = useRef(null)
  const remainingSlots = Math.max(0, Number(route?.params?.remainingSlots || 5))

  const activeFilter = useMemo(
    () => FILTERS.find((item) => item.id === selectedFilterId) || FILTERS[0],
    [selectedFilterId]
  )

  async function takePhoto() {
    if (!cameraRef.current || capturing) return

    try {
      setCapturing(true)
      const result = await cameraRef.current.takePictureAsync({
        quality: 0.92,
      })
      setCapturedPhoto(result)
    } catch (error) {
      Alert.alert('Camera failed', error?.message || 'Could not take this photo right now.')
    } finally {
      setCapturing(false)
    }
  }

  async function useCapturedPhoto() {
    if (!capturedPhoto?.uri || sending) return

    try {
      setSending(true)
      const composedUri =
        selectedFilterId === 'none'
          ? capturedPhoto.uri
          : await captureRef(previewCaptureRef, {
            format: 'png',
            quality: 1,
            result: 'tmpfile',
          })

      navigation.navigate({
        name: 'Chat',
        params: {
          capturedChatAsset: {
            uri: composedUri,
            width: capturedPhoto.width,
            height: capturedPhoto.height,
            type: 'image',
            mimeType: 'image/png',
          },
          capturedChatAssetNonce: Date.now(),
        },
        merge: true,
      })
      navigation.goBack()
    } catch (error) {
      Alert.alert('Photo failed', error?.message || 'Could not prepare this photo for chat.')
    } finally {
      setSending(false)
    }
  }

  if (!cameraPermission?.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#020617' }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28 }}>
          <Ionicons name="camera-outline" size={42} color="#cbd5e1" />
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 14 }}>
            Camera access needed
          </Text>
          <Text style={{ color: '#cbd5e1', marginTop: 8, textAlign: 'center', lineHeight: 22 }}>
            Allow camera access so we can open the funny chat camera.
          </Text>
          <TouchableOpacity
            onPress={requestCameraPermission}
            style={{
              marginTop: 18,
              borderRadius: 16,
              backgroundColor: '#1877F2',
              paddingHorizontal: 18,
              paddingVertical: 12,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '900' }}>Grant permission</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ marginTop: 12, padding: 10 }}
          >
            <Text style={{ color: '#94a3b8', fontWeight: '700' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#020617' }}>
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 14,
            paddingTop: 6,
            paddingBottom: 8,
          }}
        >
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>

          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>
              Funny camera
            </Text>
            <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
              Up to {remainingSlots} more photo{remainingSlots === 1 ? '' : 's'} in this batch
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setFacing((current) => (current === 'front' ? 'back' : 'front'))}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.08)',
            }}
          >
            <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={{ flex: 1, marginHorizontal: 12, borderRadius: 28, overflow: 'hidden', backgroundColor: '#0f172a' }}>
          {capturedPhoto?.uri ? (
            <View ref={previewCaptureRef} collapsable={false} style={{ flex: 1, backgroundColor: '#020617' }}>
              <Image source={{ uri: capturedPhoto.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  backgroundColor: activeFilter.tint,
                }}
              />
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
                <FunnyOverlay filterId={selectedFilterId} />
              </View>
            </View>
          ) : (
            <>
              <CameraView
                ref={cameraRef}
                style={{ flex: 1 }}
                facing={facing}
                mirror={facing === 'front'}
                active
              />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  bottom: 0,
                  backgroundColor: activeFilter.tint,
                }}
              />
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
                <FunnyOverlay filterId={selectedFilterId} />
              </View>
            </>
          )}
        </View>

        <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
            {FILTERS.map((filter) => (
              <FilterChip
                key={filter.id}
                filter={filter}
                active={filter.id === selectedFilterId}
                onPress={() => setSelectedFilterId(filter.id)}
              />
            ))}
          </ScrollView>
        </View>

        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 18,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {capturedPhoto?.uri ? (
            <>
              <TouchableOpacity
                onPress={() => setCapturedPhoto(null)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: 16,
                  backgroundColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>Retake</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={useCapturedPhoto}
                disabled={sending}
                style={{
                  minWidth: 132,
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  borderRadius: 16,
                  backgroundColor: '#1877F2',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '900' }}>Use photo</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={{ width: 72 }} />
              <Pressable
                onPress={takePhoto}
                disabled={capturing || remainingSlots <= 0}
                style={{
                  width: 82,
                  height: 82,
                  borderRadius: 41,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: remainingSlots <= 0 ? '#475569' : '#fff',
                  borderWidth: 5,
                  borderColor: '#cbd5e1',
                  opacity: capturing ? 0.75 : 1,
                }}
              >
                {capturing ? (
                  <ActivityIndicator color="#1877F2" />
                ) : (
                  <View
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: 31,
                      backgroundColor: remainingSlots <= 0 ? '#64748b' : '#1877F2',
                    }}
                  />
                )}
              </Pressable>
              <View style={{ width: 72, alignItems: 'flex-end' }}>
                {remainingSlots <= 0 ? (
                  <Text style={{ color: '#fca5a5', fontSize: 12, fontWeight: '800', textAlign: 'right' }}>
                    Batch full
                  </Text>
                ) : null}
              </View>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}
