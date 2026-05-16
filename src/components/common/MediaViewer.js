import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { VideoView, useVideoPlayer } from 'expo-video'
import { normalizeMediaList } from '../../lib/media'

function distanceBetweenTouches(touches) {
  if (touches.length < 2) return 0

  const [firstTouch, secondTouch] = touches
  const xDistance = firstTouch.pageX - secondTouch.pageX
  const yDistance = firstTouch.pageY - secondTouch.pageY

  return Math.sqrt(xDistance * xDistance + yDistance * yDistance)
}

function ZoomableImage({ uri, width, height }) {
  const [scale, setScale] = useState(1)
  const baseScale = useRef(1)
  const startDistance = useRef(0)

  function onTouchStart(event) {
    const { touches } = event.nativeEvent

    if (touches.length === 2) {
      startDistance.current = distanceBetweenTouches(touches)
      baseScale.current = scale
    }
  }

  function onTouchMove(event) {
    const { touches } = event.nativeEvent

    if (touches.length !== 2 || !startDistance.current) return

    const nextDistance = distanceBetweenTouches(touches)
    const nextScale = Math.min(
      Math.max(baseScale.current * (nextDistance / startDistance.current), 1),
      4
    )

    setScale(nextScale)
  }

  function onTouchEnd(event) {
    if (event.nativeEvent.touches.length < 2) {
      startDistance.current = 0
      baseScale.current = scale
    }
  }

  return (
    <View
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      style={{
        width,
        height,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Image
        source={{ uri }}
        style={{
          width,
          height,
          transform: [{ scale }],
        }}
        resizeMode="contain"
      />
    </View>
  )
}

function safelyRunPlayerCommand(command) {
  try {
    const result = command()

    if (result && typeof result.catch === 'function') {
      result.catch(() => {})
    }
  } catch {
    // Ignore stale player commands while the viewer unmounts.
  }
}

function PlayableVideo({ uri, width, height, isActive }) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = false
  })

  useEffect(() => {
    if (isActive) {
      safelyRunPlayerCommand(() => player.play())
    } else {
      safelyRunPlayerCommand(() => player.pause())
    }
  }, [isActive, player])

  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      <VideoView
        player={player}
        style={{ width, height }}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
        surfaceType="textureView"
      />
    </View>
  )
}

export default function MediaViewer({ visible, media, initialIndex, onClose }) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const items = normalizeMediaList(media)
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const safeInitialIndex = Math.min(initialIndex, Math.max(items.length - 1, 0))

  useEffect(() => {
    if (visible) {
      setCurrentIndex(safeInitialIndex)
    }
  }, [safeInitialIndex, visible])

  const onGalleryScroll = useCallback((event) => {
    setCurrentIndex(Math.round(event.nativeEvent.contentOffset.x / width))
  }, [width])

  const renderMediaItem = useCallback(({ item, index }) => (
    <View style={{ width, height, backgroundColor: '#000' }}>
      {item.type === 'video' ? (
        <PlayableVideo
          uri={item.uri}
          width={width}
          height={height}
          isActive={visible && index === currentIndex}
        />
      ) : (
        <ZoomableImage uri={item.uri} width={width} height={height} />
      )}
    </View>
  ), [currentIndex, height, visible, width])

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            elevation: 20,
            paddingHorizontal: 14,
            paddingTop: insets.top + 6,
            paddingBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(0,0,0,0.35)',
            pointerEvents: 'box-none',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>
            {items.length ? `${currentIndex + 1} / ${items.length}` : ''}
          </Text>

          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: 'rgba(255,255,255,0.16)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>

        {items.length > 0 ? (
          <FlatList
            key={`${width}-${safeInitialIndex}`}
            data={items}
            horizontal
            pagingEnabled
            initialScrollIndex={safeInitialIndex}
            getItemLayout={(_, index) => ({
              length: width,
              offset: width * index,
              index,
            })}
            keyExtractor={(item, index) => `${item.uri}-${index}`}
            renderItem={renderMediaItem}
            onMomentumScrollEnd={onGalleryScroll}
            showsHorizontalScrollIndicator={false}
            windowSize={3}
            maxToRenderPerBatch={2}
            initialNumToRender={1}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  )
}
