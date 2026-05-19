import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Svg, { Path } from 'react-native-svg'
import { captureRef } from 'react-native-view-shot'
import { VideoView, useVideoPlayer } from 'expo-video'

function distanceBetweenTouches(touches) {
  if (touches.length < 2) return 0

  const [firstTouch, secondTouch] = touches
  const dx = firstTouch.pageX - secondTouch.pageX
  const dy = firstTouch.pageY - secondTouch.pageY
  return Math.sqrt(dx * dx + dy * dy)
}

function createAssetKey(asset, index) {
  return asset?.id || asset?.assetId || asset?.uri || String(index)
}

function normalizeAssets(items = []) {
  return items.map((asset, index) => ({
    ...asset,
    composerKey: createAssetKey(asset, index),
    type: asset?.type || 'image',
  }))
}

function DrawHint({ drawMode }) {
  return (
    <View
      style={{
        position: 'absolute',
        left: 14,
        right: 14,
        bottom: 18,
        borderRadius: 14,
        backgroundColor: 'rgba(15,23,42,0.64)',
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', textAlign: 'center' }}>
        {drawMode ? 'Draw with one finger. Use Done to apply or Clear to reset.' : 'Double tap to zoom. Pinch and drag to inspect.'}
      </Text>
    </View>
  )
}

const EditableImageCanvas = forwardRef(function EditableImageCanvas(
  { asset, width, height, drawMode, active, onZoomStateChange },
  ref
) {
  const viewShotRef = useRef(null)
  const [paths, setPaths] = useState([])
  const [currentPath, setCurrentPath] = useState('')
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  const startDistanceRef = useRef(0)
  const startScaleRef = useRef(1)
  const startOffsetRef = useRef({ x: 0, y: 0 })
  const drawEnabledRef = useRef(drawMode)
  const lastTapRef = useRef(0)

  useEffect(() => {
    drawEnabledRef.current = drawMode
  }, [drawMode])

  useEffect(() => {
    onZoomStateChange?.(scale > 1.02)
  }, [onZoomStateChange, scale])

  const resetView = useCallback(() => {
    scaleRef.current = 1
    offsetRef.current = { x: 0, y: 0 }
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2,
        onPanResponderGrant: (event) => {
          const { touches, locationX, locationY } = event.nativeEvent
          const now = Date.now()

          if (!drawEnabledRef.current && touches.length === 1 && now - lastTapRef.current < 260) {
            const nextScale = scaleRef.current > 1.2 ? 1 : 2.35
            scaleRef.current = nextScale
            setScale(nextScale)
            if (nextScale === 1) {
              offsetRef.current = { x: 0, y: 0 }
              setOffset({ x: 0, y: 0 })
            }
            lastTapRef.current = 0
            return
          }

          lastTapRef.current = now

          if (drawEnabledRef.current && touches.length === 1) {
            setCurrentPath(`M ${locationX} ${locationY}`)
            return
          }

          if (touches.length === 2) {
            startDistanceRef.current = distanceBetweenTouches(touches)
            startScaleRef.current = scaleRef.current
            return
          }

          startOffsetRef.current = offsetRef.current
        },
        onPanResponderMove: (event, gestureState) => {
          const { touches, locationX, locationY } = event.nativeEvent

          if (drawEnabledRef.current) {
            if (touches.length === 1) {
              setCurrentPath((existing) => `${existing} L ${locationX} ${locationY}`)
            }
            return
          }

          if (touches.length === 2 && startDistanceRef.current) {
            const nextDistance = distanceBetweenTouches(touches)
            const nextScale = Math.min(
              Math.max(startScaleRef.current * (nextDistance / startDistanceRef.current), 1),
              4
            )
            scaleRef.current = nextScale
            setScale(nextScale)
            return
          }

          if (scaleRef.current > 1.02) {
            const nextOffset = {
              x: startOffsetRef.current.x + gestureState.dx,
              y: startOffsetRef.current.y + gestureState.dy,
            }
            offsetRef.current = nextOffset
            setOffset(nextOffset)
          }
        },
        onPanResponderRelease: () => {
          if (drawEnabledRef.current) {
            if (currentPath) {
              setPaths((existing) => [...existing, currentPath])
              setCurrentPath('')
            }
            return
          }

          startDistanceRef.current = 0
          startScaleRef.current = scaleRef.current
          startOffsetRef.current = offsetRef.current
        },
        onPanResponderTerminate: () => {
          startDistanceRef.current = 0
          if (drawEnabledRef.current && currentPath) {
            setPaths((existing) => [...existing, currentPath])
            setCurrentPath('')
          }
        },
      }),
    [currentPath]
  )

  useImperativeHandle(ref, () => ({
    async applyEdits() {
      if (!viewShotRef.current) return asset.uri
      if (!paths.length && !currentPath) return asset.uri

      const uri = await captureRef(viewShotRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      })

      setPaths([])
      setCurrentPath('')
      resetView()
      return uri
    },
    clearDrawing() {
      setPaths([])
      setCurrentPath('')
    },
    hasDrawing() {
      return Boolean(paths.length || currentPath)
    },
    resetView,
  }))

  return (
    <View
      {...panResponder.panHandlers}
      style={{
        width,
        height,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        backgroundColor: '#000',
      }}
    >
      <View
        ref={viewShotRef}
        collapsable={false}
        style={{
          width,
          height,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [
            { translateX: offset.x },
            { translateY: offset.y },
            { scale },
          ],
        }}
      >
        <Image
          source={{ uri: asset.uri }}
          style={{ width, height }}
          resizeMode="contain"
        />
        <Svg
          width={width}
          height={height}
          style={{ position: 'absolute', left: 0, top: 0 }}
        >
          {paths.map((pathValue, index) => (
            <Path
              key={`${asset.composerKey}-path-${index}`}
              d={pathValue}
              stroke="#38bdf8"
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {currentPath ? (
            <Path
              d={currentPath}
              stroke="#38bdf8"
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </Svg>
      </View>

      {active ? <DrawHint drawMode={drawMode} /> : null}
    </View>
  )
})

function PreviewVideo({ uri, width, height }) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = true
  })

  useEffect(() => {
    player.play()
    return () => {
      try {
        player.pause()
      } catch {}
    }
  }, [player])

  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      <VideoView
        player={player}
        style={{ width, height }}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        surfaceType="textureView"
      />
      <DrawHint drawMode={false} />
    </View>
  )
}

export default function MediaComposerModal({
  visible,
  assets,
  onClose,
  onChangeAssets,
  onSend,
  sending = false,
}) {
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const normalizedAssets = useMemo(() => normalizeAssets(assets), [assets])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [drawMode, setDrawMode] = useState(false)
  const [zoomedIn, setZoomedIn] = useState(false)
  const slideRefs = useRef({})
  const flatListRef = useRef(null)

  useEffect(() => {
    if (visible) {
      setCurrentIndex(0)
      setDrawMode(false)
      setZoomedIn(false)
    }
  }, [visible])

  const currentAsset = normalizedAssets[currentIndex] || null
  const canDraw = currentAsset?.type === 'image'

  function updateAssetAtIndex(index, nextPartial) {
    const nextAssets = normalizedAssets.map((asset, assetIndex) =>
      assetIndex === index ? { ...asset, ...nextPartial } : asset
    )
    onChangeAssets?.(nextAssets)
  }

  function removeAsset(index) {
    const nextAssets = normalizedAssets.filter((_asset, assetIndex) => assetIndex !== index)
    onChangeAssets?.(nextAssets)

    if (nextAssets.length === 0) {
      onClose?.()
      return
    }

    const nextIndex = Math.min(index, nextAssets.length - 1)
    setCurrentIndex(nextIndex)
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: false })
    })
  }

  async function applyCurrentDrawing() {
    if (!canDraw) return

    const activeRef = slideRefs.current[currentAsset.composerKey]

    if (!activeRef?.hasDrawing?.()) {
      setDrawMode(false)
      return
    }

    try {
      const nextUri = await activeRef.applyEdits()
      updateAssetAtIndex(currentIndex, {
        uri: nextUri,
        edited: true,
      })
      setDrawMode(false)
    } catch (error) {
      Alert.alert('Edit failed', error?.message || 'Could not apply the drawing right now.')
    }
  }

  function clearCurrentDrawing() {
    const activeRef = slideRefs.current[currentAsset?.composerKey]
    activeRef?.clearDrawing?.()
  }

  const renderPreviewItem = useCallback(
    ({ item, index }) => {
      const isActive = index === currentIndex

      return (
        <View style={{ width, height: height * 0.58, backgroundColor: '#000' }}>
          {item.type === 'video' ? (
            <PreviewVideo uri={item.uri} width={width} height={height * 0.58} />
          ) : (
            <EditableImageCanvas
              ref={(instance) => {
                if (instance) {
                  slideRefs.current[item.composerKey] = instance
                } else {
                  delete slideRefs.current[item.composerKey]
                }
              }}
              asset={item}
              width={width}
              height={height * 0.58}
              drawMode={drawMode && isActive}
              active={isActive}
              onZoomStateChange={(nextZoomed) => {
                if (isActive) {
                  setZoomedIn(nextZoomed)
                }
              }}
            />
          )}
        </View>
      )
    },
    [currentIndex, drawMode, height, width]
  )

  if (!visible) return null

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: '#08111f' }}>
        <View
          style={{
            paddingTop: insets.top + 4,
            paddingHorizontal: 14,
            paddingBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: 'rgba(255,255,255,0.1)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={23} color="#fff" />
          </TouchableOpacity>

          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16 }}>
            {normalizedAssets.length} {normalizedAssets.length > 1 ? 'items' : 'item'}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {canDraw ? (
              <TouchableOpacity
                onPress={drawMode ? applyCurrentDrawing : () => setDrawMode(true)}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: drawMode ? '#0ea5e9' : 'rgba(255,255,255,0.1)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 8,
                }}
              >
                <Ionicons name={drawMode ? 'checkmark' : 'pencil'} size={20} color="#fff" />
              </TouchableOpacity>
            ) : null}

            {drawMode ? (
              <TouchableOpacity
                onPress={clearCurrentDrawing}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 8,
                }}
              >
                <Ionicons name="trash-outline" size={19} color="#fff" />
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              onPress={onSend}
              disabled={sending || normalizedAssets.length === 0}
              style={{
                minWidth: 78,
                height: 38,
                borderRadius: 19,
                backgroundColor: '#1877F2',
                paddingHorizontal: 14,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: sending ? 0.6 : 1,
              }}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '900' }}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          ref={flatListRef}
          data={normalizedAssets}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomedIn && !drawMode}
          keyExtractor={(item) => item.composerKey}
          renderItem={renderPreviewItem}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => {
            const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width)
            setCurrentIndex(nextIndex)
            setZoomedIn(false)
            setDrawMode(false)
          }}
        />

        <View
          style={{
            paddingHorizontal: 14,
            paddingTop: 14,
            paddingBottom: Math.max(insets.bottom, 14),
          }}
        >
          <Text style={{ color: '#bfdbfe', fontSize: 12, fontWeight: '800', marginBottom: 8 }}>
            Preview
          </Text>

          <FlatList
            data={normalizedAssets}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => `${item.composerKey}-thumb`}
            renderItem={({ item, index }) => {
              const isActive = index === currentIndex

              return (
                <Pressable
                  onPress={() => {
                    setCurrentIndex(index)
                    setZoomedIn(false)
                    setDrawMode(false)
                    flatListRef.current?.scrollToIndex({ index, animated: true })
                  }}
                  style={{
                    marginRight: 10,
                    borderRadius: 14,
                    borderWidth: isActive ? 2 : 1,
                    borderColor: isActive ? '#38bdf8' : '#1e293b',
                    overflow: 'hidden',
                    backgroundColor: '#0f172a',
                  }}
                >
                  <Image
                    source={{ uri: item.uri }}
                    style={{ width: 72, height: 72, backgroundColor: '#111827' }}
                    resizeMode="cover"
                  />
                  {item.type === 'video' ? (
                    <View
                      style={{
                        position: 'absolute',
                        right: 6,
                        bottom: 6,
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: 'rgba(15,23,42,0.7)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="videocam" size={12} color="#fff" />
                    </View>
                  ) : null}

                  <TouchableOpacity
                    onPress={() => removeAsset(index)}
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: 'rgba(15,23,42,0.7)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </Pressable>
              )
            }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  )
}
