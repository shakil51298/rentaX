import { useMemo, useRef } from 'react'
import {
  Alert,
  Animated,
  Image,
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

function VoiceMessage({ message, isMine }) {
  const player = useAudioPlayer(message.media_url, { updateInterval: 500 })
  const status = useAudioPlayerStatus(player)
  const isPlaying = Boolean(status?.playing)
  const positionMillis = Math.floor((status?.currentTime || 0) * 1000)
  const durationMillis =
    message.audio_duration_ms || Math.floor((status?.duration || 0) * 1000)

  function togglePlayback() {
    try {
      if (isPlaying) {
        player.pause()
      } else {
        player.play()
      }
    } catch {
      Alert.alert('Audio unavailable', 'This voice message could not be played.')
    }
  }

  return (
    <TouchableOpacity
      onPress={togglePlayback}
      activeOpacity={0.82}
      style={{
        width: 220,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
      }}
    >
      <View
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
          name={isPlaying ? 'pause' : 'play'}
          size={18}
          color={isMine ? '#fff' : '#1877F2'}
        />
      </View>

      <View style={{ flex: 1, marginLeft: 10 }}>
        <View
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: isMine ? 'rgba(255,255,255,0.28)' : '#cbd5e1',
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: durationMillis
                ? `${Math.min((positionMillis / durationMillis) * 100, 100)}%`
                : '0%',
              height: '100%',
              backgroundColor: isMine ? '#fff' : '#1877F2',
            }}
          />
        </View>

        <Text
          style={{
            color: isMine ? 'rgba(255,255,255,0.86)' : '#64748b',
            fontSize: 11,
            fontWeight: '700',
            marginTop: 5,
          }}
        >
          {formatDuration(durationMillis || positionMillis)}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

function getReplySnippet(message) {
  if (!message) return ''
  if (message.deleted_for_everyone_at) return 'This message was deleted'
  if (message.message_type === 'image') return 'Photo'
  if (message.message_type === 'video') return 'Video'
  if (message.message_type === 'voice') return 'Voice message'
  if (message.message_type === 'call') return message.body || 'Call'
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
          name="call"
          size={17}
          color={isMine ? '#fff' : '#1877F2'}
        />
      </View>
    )
  }

  return null
}

function CallMessage({ message, isMine }) {
  const isCompleted = message.call_status === 'completed'
  const iconName = isCompleted ? 'call-outline' : 'close-circle-outline'
  const iconColor = isCompleted ? '#16a34a' : '#dc2626'
  const title = message.body || (isCompleted ? 'Audio call' : 'Call cancelled')
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
