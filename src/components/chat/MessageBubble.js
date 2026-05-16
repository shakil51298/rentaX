import { Alert, Image, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { VideoView, useVideoPlayer } from 'expo-video'
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import {
  formatClock,
  formatDayLabel,
  formatDuration,
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

function renderMessageContent(item, isMine, onOpenMedia) {
  if (item.message_type === 'image' && item.media_url) {
    return (
      <TouchableOpacity onPress={() => onOpenMedia([{ uri: item.media_url, type: 'image' }], 0)}>
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
      </TouchableOpacity>
    )
  }

  if (item.message_type === 'video' && item.media_url) {
    return <ChatVideo uri={item.media_url} />
  }

  if (item.message_type === 'voice' && item.media_url) {
    return <VoiceMessage message={item} isMine={isMine} />
  }

  return (
    <Text
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
  onOpenMedia,
}) {
  const shouldShowDay = !isSameDay(item.created_at, previousMessage?.created_at)
  const isMine = item.sender_id === currentUserId

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
        <View
          style={{
            maxWidth: '82%',
            backgroundColor: isMine ? '#1877F2' : '#fff',
            borderRadius: 18,
            borderBottomRightRadius: isMine ? 5 : 18,
            borderBottomLeftRadius: isMine ? 18 : 5,
            padding: item.message_type === 'text' ? 11 : 5,
            borderWidth: isMine ? 0 : 1,
            borderColor: '#e5e7eb',
            shadowColor: '#0f172a',
            shadowOpacity: 0.05,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
            elevation: 1,
          }}
        >
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
        </View>
      </View>
    </>
  )
}
