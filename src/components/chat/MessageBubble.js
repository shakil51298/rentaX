import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  Image,
  Linking,
  PanResponder,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { VideoView, useVideoPlayer } from 'expo-video'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import {
  formatClock,
  formatDayLabel,
  formatDuration,
  formatDurationSeconds,
  getCallPresentation,
  isSameDay,
} from '../../lib/chatUtils'

function ChatVideo({ uri }) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = false
  })

  return (
    <View
      style={{
        width: 232,
        height: 154,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#000',
      }}
    >
      <VideoView
        player={player}
        style={{ width: '100%', height: '100%' }}
        nativeControls
        contentFit="cover"
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
        surfaceType="textureView"
      />
    </View>
  )
}

function isDocumentMessage(message) {
  if (!message?.media_url) return false

  const type = String(message.message_type || '')

  if (['image', 'video', 'voice', 'call'].includes(type)) return false

  return true
}

function VoiceMessage({ message, isMine }) {
  const player = useAudioPlayer(message.media_url, { updateInterval: 500 })
  const status = useAudioPlayerStatus(player)
  const isPlaying = Boolean(status?.playing)
  const positionMillis = Math.floor((status?.currentTime || 0) * 1000)
  const durationMillis =
    message.audio_duration_ms || Math.floor((status?.duration || 0) * 1000)
  const playbackRates = [0.5, 1, 2]
  const [playbackRateIndex, setPlaybackRateIndex] = useState(1)
  const playbackRate = playbackRates[playbackRateIndex]
  const waveformHeights = useMemo(
    () => [10, 16, 13, 22, 15, 26, 18, 24, 14, 21, 12, 25, 17, 20, 11, 19, 14, 16],
    []
  )
  const progressRatio =
    durationMillis > 0 ? Math.min(positionMillis / durationMillis, 1) : 0
  const hasFinishedPlayback = durationMillis > 0 && progressRatio >= 0.985 && !isPlaying

  useEffect(() => {
    try {
      player.playbackRate = playbackRate
    } catch {
      try {
        player.setPlaybackRate(playbackRate)
      } catch {
        // keep default playback speed if the platform rejects a rate change
      }
    }
  }, [playbackRate, player])

  async function seekToRatio(ratio) {
    if (!durationMillis) return

    try {
      const nextSeconds = Math.max(0, Math.min(ratio, 1)) * (durationMillis / 1000)
      await player.seekTo(nextSeconds)

      if (!isPlaying) {
        player.play()
      }
    } catch {
      Alert.alert('Seek unavailable', 'Could not move playback to that part of the voice message.')
    }
  }

  async function togglePlayback() {
    try {
      if (isPlaying) {
        player.pause()
      } else {
        if (hasFinishedPlayback) {
          await player.seekTo(0)
        }
        player.play()
      }
    } catch {
      Alert.alert('Audio unavailable', 'This voice message could not be played.')
    }
  }

  function cyclePlaybackRate() {
    setPlaybackRateIndex((current) => (current + 1) % playbackRates.length)
  }

  return (
    <View
      style={{
        width: 238,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
      }}
    >
      <TouchableOpacity
        onPress={togglePlayback}
        activeOpacity={0.82}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: isMine ? 'rgba(255,255,255,0.28)' : '#dbeafe',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name={isPlaying ? 'pause' : hasFinishedPlayback ? 'refresh' : 'play'}
          size={18}
          color={isMine ? '#fff' : '#1877F2'}
        />
      </TouchableOpacity>

      <View style={{ flex: 1, marginLeft: 10 }}>
        <View
          style={{
            height: 30,
            flexDirection: 'row',
            alignItems: 'flex-end',
          }}
        >
          {waveformHeights.map((barHeight, index) => {
            const threshold = (index + 1) / waveformHeights.length
            const active = progressRatio >= threshold

            return (
              <TouchableOpacity
                key={`${message.id}-bar-${index}`}
                onPress={() => seekToRatio(index / Math.max(waveformHeights.length - 1, 1))}
                activeOpacity={0.72}
                style={{
                  width: 6,
                  height: barHeight,
                  borderRadius: 999,
                  marginRight: index === waveformHeights.length - 1 ? 0 : 3,
                  backgroundColor: active
                    ? isMine
                      ? '#fff'
                      : '#1877F2'
                    : isMine
                      ? 'rgba(255,255,255,0.28)'
                      : '#cbd5e1',
                  opacity: isPlaying && !active ? 0.82 : 1,
                }}
              />
            )
          })}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
          <Text
            style={{
              color: isMine ? 'rgba(255,255,255,0.86)' : '#64748b',
              fontSize: 11,
              fontWeight: '700',
            }}
          >
            {formatDuration(positionMillis)} / {formatDuration(durationMillis || positionMillis)}
          </Text>

          <TouchableOpacity
            onPress={cyclePlaybackRate}
            style={{
              marginLeft: 'auto',
              minWidth: 34,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: isMine ? 'rgba(255,255,255,0.16)' : '#e0ecff',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: isMine ? '#fff' : '#1d4ed8',
                fontSize: 10,
                fontWeight: '900',
              }}
            >
              {playbackRate}x
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

function getReplySnippet(message) {
  if (!message) return ''
  if (message.deleted_for_everyone_at) return 'This message was deleted'
  if (message.message_type === 'image') return 'Photo'
  if (message.message_type === 'video') return 'Video'
  if (message.message_type === 'voice') return 'Voice message'
  if (message.message_type === 'call') {
    return getCallPresentation(message).title
  }
  if (isDocumentMessage(message)) return message.media_name || message.body || 'Document'
  return message.body || 'Message'
}

function ReplyPreviewMedia({ message, isMine }) {
  if (!message || message.deleted_for_everyone_at) return null

  if (message.message_type === 'image' && message.media_url) {
    return (
      <Image
        source={{ uri: message.media_url }}
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          marginRight: 10,
          flexShrink: 0,
          backgroundColor: isMine ? 'rgba(255,255,255,0.22)' : '#dbeafe',
        }}
        resizeMode="cover"
      />
    )
  }

  if (message.message_type === 'video') {
    return (
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          marginRight: 10,
          flexShrink: 0,
          backgroundColor: isMine ? 'rgba(255,255,255,0.22)' : '#dbeafe',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name="videocam"
          size={18}
          color={isMine ? '#fff' : '#1877F2'}
        />
      </View>
    )
  }

  if (message.message_type === 'voice') {
    return (
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          marginRight: 10,
          flexShrink: 0,
          backgroundColor: isMine ? 'rgba(255,255,255,0.22)' : '#dbeafe',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name="mic"
          size={18}
          color={isMine ? '#fff' : '#1877F2'}
        />
      </View>
    )
  }

  if (message.message_type === 'call') {
    const { previewIconName } = getCallPresentation(message)

    return (
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          marginRight: 10,
          flexShrink: 0,
          backgroundColor: isMine ? 'rgba(255,255,255,0.22)' : '#dbeafe',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name={previewIconName}
          size={17}
          color={isMine ? '#fff' : '#1877F2'}
        />
      </View>
    )
  }

  if (isDocumentMessage(message)) {
    return (
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          marginRight: 10,
          flexShrink: 0,
          backgroundColor: isMine ? 'rgba(255,255,255,0.22)' : '#dbeafe',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name="document-text-outline"
          size={18}
          color={isMine ? '#fff' : '#1877F2'}
        />
      </View>
    )
  }

  return null
}

function CallMessage({ message, isMine }) {
  const { isCompleted, iconName, iconColor, title } = getCallPresentation(message)
  const detail = isCompleted
    ? `Duration ${formatDurationSeconds(message.call_duration_seconds || 0)}`
    : isMine
      ? 'You ended this call before it connected'
      : 'Call ended before connection'

  return (
    <View
      style={{
        width: 220,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 4,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: isMine ? 'rgba(255,255,255,0.18)' : '#eff6ff',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}
      >
        <Ionicons name={iconName} size={18} color={isMine && isCompleted ? '#fff' : iconColor} />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: isMine ? '#fff' : '#0f172a',
            fontSize: 14,
            fontWeight: '800',
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: isMine ? 'rgba(255,255,255,0.8)' : '#64748b',
            fontSize: 12,
            marginTop: 2,
          }}
        >
          {detail}
        </Text>
      </View>
    </View>
  )
}

function DocumentMessage({ message, isMine }) {
  async function openDocument() {
    if (!message?.media_url) return

    try {
      await Linking.openURL(message.media_url)
    } catch {
      Alert.alert('Document unavailable', 'This file could not be opened right now.')
    }
  }

  return (
    <TouchableOpacity
      onPress={openDocument}
      activeOpacity={0.82}
      style={{
        width: 228,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 4,
      }}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: isMine ? 'rgba(255,255,255,0.18)' : '#eff6ff',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}
      >
        <Ionicons
          name="document-text-outline"
          size={18}
          color={isMine ? '#fff' : '#4f46e5'}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: isMine ? '#fff' : '#0f172a',
            fontSize: 14,
            fontWeight: '800',
          }}
          numberOfLines={1}
        >
          {message.media_name || message.body || 'Document'}
        </Text>
        <Text
          style={{
            color: isMine ? 'rgba(255,255,255,0.8)' : '#64748b',
            fontSize: 12,
            marginTop: 2,
          }}
          numberOfLines={1}
        >
          {message.media_mime_type || 'Shared file'}
        </Text>
      </View>

      <Ionicons
        name="download-outline"
        size={18}
        color={isMine ? 'rgba(255,255,255,0.82)' : '#64748b'}
      />
    </TouchableOpacity>
  )
}

function renderMessageContent(item, isMine, onOpenMedia) {
  if (item.deleted_for_everyone_at) {
    return (
      <Text
        style={{
          color: isMine ? 'rgba(255,255,255,0.9)' : '#64748b',
          fontSize: 14,
          fontStyle: 'italic',
        }}
      >
        This message was deleted
      </Text>
    )
  }

  if (item.message_type === 'image' && item.media_url) {
    return (
      <Image
        source={{ uri: item.media_url }}
        style={{
          width: 232,
          height: 188,
          borderRadius: 14,
          backgroundColor: isMine ? '#0f5fbf' : '#e5e7eb',
        }}
        resizeMode="cover"
      />
    )
  }

  if (item.message_type === 'video' && item.media_url) {
    return <ChatVideo uri={item.media_url} />
  }

  if (item.message_type === 'voice' && item.media_url) {
    return <VoiceMessage message={item} isMine={isMine} />
  }

  if (item.message_type === 'call') {
    return <CallMessage message={item} isMine={isMine} />
  }

  if (isDocumentMessage(item)) {
    return <DocumentMessage message={item} isMine={isMine} />
  }

  return (
    <Text
      selectable
      selectionColor={isMine ? 'rgba(255,255,255,0.45)' : '#93c5fd'}
      style={{
        color: isMine ? '#fff' : '#111827',
        fontSize: 15,
        lineHeight: 21,
      }}
    >
      {item.body}
    </Text>
  )
}

export default function MessageBubble({
  item,
  previousMessage,
  currentUserId,
  repliedMessage,
  onOpenMedia,
  onReply,
  onJumpToMessage,
  onPressCallHistory,
  onToggleReaction,
  onLongPressMessage,
  outgoingBubbleColor = '#1877F2',
  highlighted = false,
}) {
  const shouldShowDay = !isSameDay(item.created_at, previousMessage?.created_at)
  const isMine = item.sender_id === currentUserId
  const translateX = useRef(new Animated.Value(0)).current
  const tapTimeoutRef = useRef(null)
  const lastTapTimeRef = useRef(0)
  const reactionCount = [item.sender_reaction, item.receiver_reaction].filter(Boolean).length
  const isCallMessage = item.message_type === 'call'
  const pendingLocal = Boolean(item.pending_local)
  const hasReplyBlock = Boolean(repliedMessage)
  const bubbleMaxWidth = hasReplyBlock
    ? '94%'
    : item.message_type === 'text'
      ? '89%'
      : '82%'
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dx) > 10 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
        onPanResponderMove: (_event, gestureState) => {
          translateX.setValue(Math.max(Math.min(gestureState.dx, 72), -72))
        },
        onPanResponderRelease: (_event, gestureState) => {
          const shouldReply = Math.abs(gestureState.dx) > 54

          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 120,
            friction: 12,
          }).start()

          if (shouldReply) {
            onReply?.(item)
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 120,
            friction: 12,
          }).start()
        },
      }),
    [item, onReply, translateX]
  )

  function handleTap() {
    if (item.message_type === 'call') {
      onPressCallHistory?.(item)
      return
    }

    const now = Date.now()

    if (lastTapTimeRef.current && now - lastTapTimeRef.current < 260) {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current)
      }

      lastTapTimeRef.current = 0
      onToggleReaction?.(item)
      return
    }

    lastTapTimeRef.current = now
    tapTimeoutRef.current = setTimeout(() => {
      if (item.message_type === 'image' && item.media_url) {
        onOpenMedia([{ uri: item.media_url, type: 'image' }], 0)
      }
    }, 250)
  }

  return (
    <>
      {shouldShowDay ? (
        <View style={{ alignItems: 'center', marginVertical: 10 }}>
          <View
            style={{
              backgroundColor: '#e2e8f0',
              borderRadius: 12,
              paddingHorizontal: 10,
              paddingVertical: 5,
            }}
          >
            <Text style={{ color: '#475569', fontSize: 12, fontWeight: '800' }}>
              {formatDayLabel(item.created_at)}
            </Text>
          </View>
        </View>
      ) : null}

      <View
        style={{
          alignItems: isMine ? 'flex-end' : 'flex-start',
          paddingHorizontal: 12,
          marginBottom: 8,
        }}
      >
        <Animated.View
          {...panResponder.panHandlers}
          style={{
            transform: [{ translateX }],
            maxWidth: bubbleMaxWidth,
          }}
        >
          <View
            style={{
              position: 'absolute',
              top: '45%',
              [isMine ? 'left' : 'right']: -30,
              opacity: 0.6,
            }}
          >
            <Ionicons name="return-down-forward-outline" size={18} color="#64748b" />
          </View>

          <Pressable
            onPress={handleTap}
            onLongPress={() => onLongPressMessage?.(item)}
            delayLongPress={220}
            style={{
              backgroundColor: isMine ? outgoingBubbleColor : '#fff',
              borderRadius: 18,
              borderBottomRightRadius: isMine ? 5 : 18,
              borderBottomLeftRadius: isMine ? 18 : 5,
              padding: item.message_type === 'text' ? 11 : 5,
              borderWidth: highlighted ? 2 : (isMine ? 0 : 1),
              borderColor: highlighted ? '#f59e0b' : '#e5e7eb',
              shadowColor: '#0f172a',
              shadowOpacity: 0.05,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
              elevation: 1,
            }}
          >
            {repliedMessage ? (
              <Pressable
                onPress={() => onJumpToMessage?.(repliedMessage.id)}
                style={{
                  marginBottom: 8,
                  borderRadius: 12,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  backgroundColor: isMine ? 'rgba(255,255,255,0.18)' : '#eff6ff',
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  overflow: 'hidden',
                }}
              >
                <ReplyPreviewMedia message={repliedMessage} isMine={isMine} />

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      color: isMine ? '#fff' : '#1877F2',
                      fontWeight: '900',
                      fontSize: 12,
                    }}
                    numberOfLines={1}
                  >
                    {repliedMessage.sender_id === currentUserId ? 'You' : 'Reply'}
                  </Text>
                  <Text
                    style={{
                      color: isMine ? 'rgba(255,255,255,0.9)' : '#334155',
                      marginTop: 3,
                      fontSize: 12,
                      lineHeight: 17,
                    }}
                    numberOfLines={2}
                  >
                    {getReplySnippet(repliedMessage)}
                  </Text>
                </View>
              </Pressable>
            ) : null}

            {renderMessageContent(item, isMine, onOpenMedia)}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'flex-end',
                marginTop: item.message_type === 'text' ? 4 : 6,
                paddingHorizontal: item.message_type === 'text' ? 0 : 5,
              }}
            >
              <Text
                style={{
                  color: isMine ? 'rgba(255,255,255,0.78)' : '#64748b',
                  fontSize: 10,
                  fontWeight: '700',
                }}
              >
                {formatClock(item.created_at)}
              </Text>

              {isMine ? (
                pendingLocal ? (
                  <Ionicons
                    name="time-outline"
                    size={12}
                    color="rgba(255,255,255,0.78)"
                    style={{ marginLeft: 4 }}
                  />
                ) : (
                  <Text
                    style={{
                      color: item.seen_at ? '#9be7ff' : 'rgba(255,255,255,0.78)',
                      marginLeft: 4,
                      fontSize: 12,
                      fontWeight: '900',
                    }}
                  >
                    {item.seen_at ? '✓✓' : '✓'}
                  </Text>
                )
              ) : null}
            </View>
          </Pressable>

          {reactionCount > 0 && !isCallMessage ? (
            <View
              style={{
                alignSelf: isMine ? 'flex-end' : 'flex-start',
                marginTop: 4,
                backgroundColor: '#fff',
                borderRadius: 12,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 12 }}>❤️</Text>
              {reactionCount > 1 ? (
                <Text style={{ color: '#475569', marginLeft: 4, fontSize: 12, fontWeight: '800' }}>
                  {reactionCount}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </>
  )
}
