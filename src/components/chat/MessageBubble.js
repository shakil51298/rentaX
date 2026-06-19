import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
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
import Avatar from '../common/Avatar'
import {
  formatCurrencyAmount,
  formatClock,
  formatDayLabel,
  formatDuration,
  formatDurationSeconds,
  getCallPresentation,
  isContactCardMessage,
  isLocationMessage,
  isRedPacketMessage,
  isSameDay,
  parseContactCardPayload,
} from '../../lib/chatUtils'
import { getProfileName } from '../../lib/userDisplay'

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🙏']
const WHATSAPP_OUTGOING_BUBBLE = '#d9fdd3'
const WHATSAPP_INCOMING_BUBBLE = '#ffffff'
const WHATSAPP_INCOMING_BORDER = '#e9edef'
const WHATSAPP_TEXT = '#111b21'
const WHATSAPP_META = '#667781'
const WHATSAPP_CHECK = '#0b8fff'
const WHATSAPP_ACCENT = '#128c7e'
const WHATSAPP_SOFT_ACCENT = 'rgba(18,140,126,0.12)'
const DEFAULT_MESSAGE_STYLE = {
  textColor: WHATSAPP_TEXT,
  metaColor: WHATSAPP_META,
  accentColor: WHATSAPP_ACCENT,
  softAccentColor: WHATSAPP_SOFT_ACCENT,
}

function normalizeHexColor(value, fallback) {
  if (typeof value !== 'string') return fallback

  const trimmedValue = value.trim()
  const shortMatch = trimmedValue.match(/^#([a-f0-9]{3})$/i)

  if (shortMatch) {
    return `#${shortMatch[1]
      .split('')
      .map((part) => `${part}${part}`)
      .join('')}`
  }

  if (/^#[a-f0-9]{6}$/i.test(trimmedValue)) {
    return trimmedValue
  }

  return fallback
}

function hexToRgb(value) {
  const color = normalizeHexColor(value, '#000000').slice(1)
  const numericValue = Number.parseInt(color, 16)

  return {
    r: (numericValue >> 16) & 255,
    g: (numericValue >> 8) & 255,
    b: numericValue & 255,
  }
}

function hexToRgba(value, opacity) {
  const { r, g, b } = hexToRgb(value)
  return `rgba(${r},${g},${b},${opacity})`
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => Math.round(value).toString(16).padStart(2, '0'))
    .join('')}`
}

function mixHex(baseColor, targetColor, amount) {
  const base = hexToRgb(baseColor)
  const target = hexToRgb(targetColor)

  return rgbToHex({
    r: base.r + (target.r - base.r) * amount,
    g: base.g + (target.g - base.g) * amount,
    b: base.b + (target.b - base.b) * amount,
  })
}

function getRelativeLuminance(value) {
  const { r, g, b } = hexToRgb(value)
  const [red, green, blue] = [r, g, b].map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })

  return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
}

function getBubbleBorderColor(value) {
  return getRelativeLuminance(value) < 0.5
    ? mixHex(value, '#ffffff', 0.28)
    : mixHex(value, '#000000', 0.08)
}

function displayReaction(reaction) {
  if (!reaction) return null
  if (reaction === 'love') return '❤️'
  return reaction
}

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
  if (isLocationMessage(message)) return false
  if (isRedPacketMessage(message)) return false
  if (isContactCardMessage(message)) return false

  const type = String(message.message_type || '')

  if (['image', 'video', 'voice', 'call'].includes(type)) return false

  return true
}

function VoiceMessage({ message, isMine, messageStyle = DEFAULT_MESSAGE_STYLE }) {
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
          backgroundColor: isMine ? messageStyle.softAccentColor : '#dbeafe',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name={isPlaying ? 'pause' : hasFinishedPlayback ? 'refresh' : 'play'}
          size={18}
          color={isMine ? messageStyle.accentColor : '#1877F2'}
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
                      ? messageStyle.accentColor
                      : '#1877F2'
                    : isMine
                      ? hexToRgba(messageStyle.accentColor, 0.25)
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
              color: messageStyle.metaColor,
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
              backgroundColor: isMine ? messageStyle.softAccentColor : '#e0ecff',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: isMine ? messageStyle.accentColor : '#1d4ed8',
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
  if (isLocationMessage(message)) return 'Shared location'
  if (isRedPacketMessage(message)) return 'Red packet'
  if (isContactCardMessage(message)) {
    const contact = parseContactCardPayload(message)
    return contact.displayName ? `Contact: ${contact.displayName}` : 'Contact card'
  }
  if (message.message_type === 'image') return 'Photo'
  if (message.message_type === 'video') return 'Video'
  if (message.message_type === 'voice') return 'Voice message'
  if (message.message_type === 'call') {
    return getCallPresentation(message).title
  }
  if (isDocumentMessage(message)) return message.media_name || message.body || 'Document'
  return message.body || 'Message'
}

function ReplyPreviewMedia({ message, isMine, messageStyle = DEFAULT_MESSAGE_STYLE }) {
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
          backgroundColor: isMine ? messageStyle.softAccentColor : '#dbeafe',
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
          backgroundColor: isMine ? messageStyle.softAccentColor : '#dbeafe',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name="videocam"
          size={18}
          color={isMine ? messageStyle.accentColor : '#1877F2'}
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
          backgroundColor: isMine ? messageStyle.softAccentColor : '#dbeafe',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name="mic"
          size={18}
          color={isMine ? messageStyle.accentColor : '#1877F2'}
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
          backgroundColor: isMine ? messageStyle.softAccentColor : '#dbeafe',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name={previewIconName}
          size={17}
          color={isMine ? messageStyle.accentColor : '#1877F2'}
        />
      </View>
    )
  }

  if (isLocationMessage(message)) {
    return (
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          marginRight: 10,
          flexShrink: 0,
          backgroundColor: isMine ? messageStyle.softAccentColor : '#dcfce7',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name="location"
          size={18}
          color={isMine ? messageStyle.accentColor : '#16a34a'}
        />
      </View>
    )
  }

  if (isRedPacketMessage(message)) {
    return (
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          marginRight: 10,
          flexShrink: 0,
          backgroundColor: isMine ? 'rgba(220,38,38,0.1)' : '#fee2e2',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name="gift"
          size={18}
          color="#dc2626"
        />
      </View>
    )
  }

  if (isContactCardMessage(message)) {
    return (
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          marginRight: 10,
          flexShrink: 0,
          backgroundColor: isMine ? messageStyle.softAccentColor : '#f0fdf4',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name="id-card"
          size={18}
          color={isMine ? messageStyle.accentColor : '#16a34a'}
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
          backgroundColor: isMine ? messageStyle.softAccentColor : '#dbeafe',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name="document-text-outline"
          size={18}
          color={isMine ? messageStyle.accentColor : '#1877F2'}
        />
      </View>
    )
  }

  return null
}

function CallMessage({ message, isMine, messageStyle = DEFAULT_MESSAGE_STYLE }) {
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
          backgroundColor: isMine ? messageStyle.softAccentColor : '#eff6ff',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}
      >
        <Ionicons name={iconName} size={18} color={iconColor} />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: messageStyle.textColor,
            fontSize: 14,
            fontWeight: '800',
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: messageStyle.metaColor,
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

function LocationMessage({ message, isMine, messageStyle = DEFAULT_MESSAGE_STYLE }) {
  const label = message.media_name || 'Shared location'
  const url = message.media_url

  async function openLocation() {
    if (!url) return

    try {
      await Linking.openURL(url)
    } catch {
      Alert.alert('Location unavailable', 'This location could not be opened right now.')
    }
  }

  return (
    <TouchableOpacity
      onPress={openLocation}
      activeOpacity={0.86}
      style={{
        width: 238,
        paddingHorizontal: 5,
        paddingVertical: 4,
      }}
    >
      <View
        style={{
          height: 92,
          borderRadius: 14,
          backgroundColor: isMine ? hexToRgba(messageStyle.accentColor, 0.1) : '#dcfce7',
          overflow: 'hidden',
          marginBottom: 8,
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: -20,
            top: 18,
            width: 280,
            height: 1,
            backgroundColor: isMine ? hexToRgba(messageStyle.accentColor, 0.22) : 'rgba(22, 163, 74, 0.2)',
            transform: [{ rotate: '-12deg' }],
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: -18,
            bottom: 22,
            width: 280,
            height: 1,
            backgroundColor: isMine ? hexToRgba(messageStyle.accentColor, 0.18) : 'rgba(22, 163, 74, 0.18)',
            transform: [{ rotate: '14deg' }],
          }}
        />
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: '#fff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="location" size={24} color={isMine ? messageStyle.accentColor : '#16a34a'} />
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: messageStyle.textColor,
              fontSize: 14,
              fontWeight: '900',
            }}
            numberOfLines={1}
          >
            Shared location
          </Text>
          <Text
            style={{
              color: messageStyle.metaColor,
              fontSize: 12,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
        <Ionicons
          name="open-outline"
          size={18}
          color={isMine ? messageStyle.accentColor : '#16a34a'}
        />
      </View>
    </TouchableOpacity>
  )
}

function RedPacketMessage({
  message,
  isMine,
  redPacket,
  onOpenRedPacket,
  onShowRedPacketDetails,
  opening,
}) {
  const hasPacket = Boolean(redPacket?.id)
  const opened = Boolean(redPacket?.opened)
  const hasRecipientRows = Boolean(redPacket?.recipients?.length)
  const canOpen = hasPacket && !opened && Boolean(redPacket?.myRecipient || (!hasRecipientRows && !isMine))
  const wish = redPacket?.wish || message.body || 'Best wishes'
  const photoUrl = redPacket?.photo_url || message.media_url
  const claimAmount = redPacket?.claimAmount || redPacket?.amount
  const recipientCount = redPacket?.recipientCount || (hasRecipientRows ? redPacket.recipients.length : 1)
  const openedCount = redPacket?.openedCount || 0
  const canShowDetails = Boolean(redPacket?.openedRecipients?.length)
  const statusText = opened
    ? 'Opened and added to account'
    : isMine
      ? `${openedCount}/${recipientCount} opened`
      : canOpen
        ? 'Tap open to receive your amount'
        : hasPacket && hasRecipientRows
          ? 'This packet was not sent to you'
          : 'Waiting to be opened'

  const detailsPressEnabled = canShowDetails && !canOpen
  const Container = detailsPressEnabled ? TouchableOpacity : View

  return (
    <Container
      onPress={detailsPressEnabled ? () => onShowRedPacketDetails?.(redPacket) : undefined}
      activeOpacity={0.86}
      style={{
        width: 238,
        borderRadius: 18,
        overflow: 'hidden',
        backgroundColor: '#b91c1c',
      }}
    >
      <View
        style={{
          paddingHorizontal: 14,
          paddingTop: 14,
          paddingBottom: 12,
          backgroundColor: '#dc2626',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: '#facc15',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 10,
            }}
          >
            <Ionicons name="gift" size={21} color="#7f1d1d" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: '#fff7ed', fontSize: 15, fontWeight: '900' }}>
              Red packet
            </Text>
            <Text
              style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, marginTop: 2 }}
              numberOfLines={1}
            >
              {wish}
            </Text>
          </View>
        </View>

        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={{
              width: '100%',
              height: 86,
              borderRadius: 14,
              marginTop: 12,
              backgroundColor: 'rgba(255,255,255,0.18)',
            }}
            resizeMode="cover"
          />
        ) : null}
      </View>

      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 12,
          backgroundColor: '#991b1b',
          alignItems: 'center',
        }}
      >
        {opened || isMine ? (
          <>
            <Text style={{ color: '#fde68a', fontSize: 19, fontWeight: '900' }}>
              {hasPacket ? formatCurrencyAmount(isMine ? redPacket.amount : claimAmount, redPacket.currency) : 'Gift'}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.76)', fontSize: 11, marginTop: 3 }}>
              {statusText}
            </Text>
          </>
        ) : (
          <TouchableOpacity
            onPress={() => onOpenRedPacket?.(redPacket)}
            disabled={!canOpen || opening}
            activeOpacity={0.86}
            style={{
              width: 86,
              height: 86,
              borderRadius: 43,
              backgroundColor: '#facc15',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: canOpen && !opening ? 1 : 0.65,
            }}
          >
            {opening ? (
              <ActivityIndicator color="#7f1d1d" />
            ) : (
              <Text style={{ color: '#7f1d1d', fontSize: 16, fontWeight: '900' }}>
                Open
              </Text>
            )}
          </TouchableOpacity>
        )}

        {!hasPacket ? (
          <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, marginTop: 8, textAlign: 'center' }}>
            Run the red packet SQL to enable opening.
          </Text>
        ) : null}

        {hasPacket && !opened && !isMine && !canOpen ? (
          <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, marginTop: 8, textAlign: 'center' }}>
            {statusText}
          </Text>
        ) : null}

        {detailsPressEnabled ? (
          <Text style={{ color: 'rgba(255,255,255,0.66)', fontSize: 10, marginTop: 8, textAlign: 'center' }}>
            Tap packet to see details
          </Text>
        ) : null}
      </View>
    </Container>
  )
}

function ContactCardMessage({
  message,
  isMine,
  onOpenContactCard,
  messageStyle = DEFAULT_MESSAGE_STYLE,
}) {
  const contact = parseContactCardPayload(message)
  const initial = String(contact.displayName || 'R').charAt(0).toUpperCase()

  return (
    <View
      style={{
        width: 238,
        paddingHorizontal: 8,
        paddingVertical: 7,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {contact.avatarUrl ? (
          <Image
            source={{ uri: contact.avatarUrl }}
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: isMine ? messageStyle.softAccentColor : '#e2e8f0',
            }}
          />
        ) : (
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: isMine ? messageStyle.softAccentColor : '#dcfce7',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: isMine ? messageStyle.accentColor : '#15803d', fontSize: 17, fontWeight: '900' }}>
              {initial}
            </Text>
          </View>
        )}

        <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text
              numberOfLines={1}
              style={{
                color: messageStyle.textColor,
                fontSize: 14,
                fontWeight: '900',
                flexShrink: 1,
              }}
            >
              {contact.displayName}
            </Text>
            {contact.isVerified ? (
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={isMine ? messageStyle.accentColor : '#1877F2'}
                style={{ marginLeft: 4 }}
              />
            ) : null}
          </View>
          <Text
            numberOfLines={1}
            style={{
              color: messageStyle.metaColor,
              fontSize: 11,
              marginTop: 3,
              fontWeight: '800',
            }}
          >
            {contact.rentalXId ? `ID ${contact.rentalXId}` : 'Rental X contact'}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={() => onOpenContactCard?.(contact)}
        disabled={!contact.userId}
        activeOpacity={0.84}
        style={{
          marginTop: 10,
          minHeight: 36,
          borderRadius: 13,
          backgroundColor: isMine ? messageStyle.softAccentColor : '#eff6ff',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: contact.userId ? 1 : 0.6,
        }}
      >
        <Text
          style={{
            color: isMine ? messageStyle.accentColor : '#1877F2',
            fontSize: 12,
            fontWeight: '900',
          }}
        >
          Message
        </Text>
      </TouchableOpacity>
    </View>
  )
}

function DocumentMessage({ message, isMine, messageStyle = DEFAULT_MESSAGE_STYLE }) {
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
          backgroundColor: isMine ? messageStyle.softAccentColor : '#eff6ff',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}
      >
        <Ionicons
          name="document-text-outline"
          size={18}
          color={isMine ? messageStyle.accentColor : '#4f46e5'}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: messageStyle.textColor,
            fontSize: 14,
            fontWeight: '800',
          }}
          numberOfLines={1}
        >
          {message.media_name || message.body || 'Document'}
        </Text>
        <Text
          style={{
            color: messageStyle.metaColor,
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
        color={messageStyle.metaColor}
      />
    </TouchableOpacity>
  )
}

function LinkPreviewCard({ preview, isMine, messageStyle = DEFAULT_MESSAGE_STYLE }) {
  if (!preview?.url) return null

  async function openLink() {
    try {
      await Linking.openURL(preview.url)
    } catch {
      Alert.alert('Link unavailable', 'This link could not be opened right now.')
    }
  }

  return (
    <TouchableOpacity
      onPress={openLink}
      activeOpacity={0.84}
      style={{
        marginTop: 9,
        width: 232,
        maxWidth: '100%',
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: isMine ? 'rgba(255,255,255,0.52)' : '#f1f5f9',
        borderWidth: 1,
        borderColor: isMine ? hexToRgba(messageStyle.accentColor, 0.14) : '#e2e8f0',
      }}
    >
      {preview.image ? (
        <Image
          source={{ uri: preview.image }}
          style={{
            width: '100%',
            height: 108,
            backgroundColor: isMine ? hexToRgba(messageStyle.accentColor, 0.08) : '#e2e8f0',
          }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            height: 58,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isMine ? messageStyle.softAccentColor : '#dbeafe',
          }}
        >
          <Ionicons name="link" size={24} color={isMine ? messageStyle.accentColor : '#1877F2'} />
        </View>
      )}

      <View style={{ paddingHorizontal: 10, paddingVertical: 9 }}>
        <Text
          numberOfLines={2}
          style={{
            color: messageStyle.textColor,
            fontSize: 13,
            lineHeight: 18,
            fontWeight: '900',
          }}
        >
          {preview.loading ? 'Loading preview...' : preview.title || preview.siteName || 'Link'}
        </Text>
        {preview.description ? (
          <Text
            numberOfLines={2}
            style={{
              color: messageStyle.metaColor,
              fontSize: 11,
              lineHeight: 15,
              marginTop: 4,
              fontWeight: '700',
            }}
          >
            {preview.description}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
          <Ionicons
            name="open-outline"
            size={13}
            color={isMine ? messageStyle.accentColor : '#1877F2'}
          />
          <Text
            numberOfLines={1}
            style={{
              color: isMine ? messageStyle.accentColor : '#1877F2',
              fontSize: 10,
              fontWeight: '900',
              marginLeft: 4,
              textTransform: 'uppercase',
            }}
          >
            {preview.siteName || preview.url}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

function renderMessageContent(
  item,
  isMine,
  onOpenMedia,
  redPacket,
  onOpenRedPacket,
  onShowRedPacketDetails,
  openingRedPacketId,
  onOpenContactCard,
  linkPreview,
  messageStyle = DEFAULT_MESSAGE_STYLE
) {
  if (item.deleted_for_everyone_at) {
    return (
      <Text
        style={{
          color: messageStyle.metaColor,
          fontSize: 14,
          fontStyle: 'italic',
          lineHeight: 20,
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
    return <VoiceMessage message={item} isMine={isMine} messageStyle={messageStyle} />
  }

  if (item.message_type === 'call') {
    return <CallMessage message={item} isMine={isMine} messageStyle={messageStyle} />
  }

  if (isLocationMessage(item)) {
    return <LocationMessage message={item} isMine={isMine} messageStyle={messageStyle} />
  }

  if (isRedPacketMessage(item)) {
    return (
      <RedPacketMessage
        message={item}
        isMine={isMine}
        redPacket={redPacket}
        onOpenRedPacket={onOpenRedPacket}
        onShowRedPacketDetails={onShowRedPacketDetails}
        opening={Boolean(redPacket?.id && openingRedPacketId === redPacket.id)}
      />
    )
  }

  if (isContactCardMessage(item)) {
    return (
      <ContactCardMessage
        message={item}
        isMine={isMine}
        onOpenContactCard={onOpenContactCard}
        messageStyle={messageStyle}
      />
    )
  }

  if (isDocumentMessage(item)) {
    return <DocumentMessage message={item} isMine={isMine} messageStyle={messageStyle} />
  }

  return (
    <View>
      <Text
        selectable
        selectionColor={isMine ? hexToRgba(messageStyle.accentColor, 0.25) : '#93c5fd'}
        style={{
          color: messageStyle.textColor,
          fontSize: 15,
          lineHeight: 21,
        }}
      >
        {item.body}
      </Text>
      {linkPreview ? (
        <LinkPreviewCard preview={linkPreview} isMine={isMine} messageStyle={messageStyle} />
      ) : null}
    </View>
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
  onSetReaction,
  reactionPickerOpen = false,
  onRequestReactionPicker,
  onDismissReactionPicker,
  onReactionInteraction,
  onLongPressMessage,
  redPacket,
  onOpenRedPacket,
  onShowRedPacketDetails,
  openingRedPacketId,
  onOpenContactCard,
  linkPreview,
  senderProfile,
  showSenderIdentity = false,
  outgoingBubbleColor = WHATSAPP_OUTGOING_BUBBLE,
  outgoingAccentColor = WHATSAPP_ACCENT,
  highlighted = false,
}) {
  const shouldShowDay = !isSameDay(item.created_at, previousMessage?.created_at)
  const isMine = item.sender_id === currentUserId
  const translateX = useRef(new Animated.Value(0)).current
  const reactionPickerAnim = useRef(new Animated.Value(0)).current
  const reactionDanceAnim = useRef(new Animated.Value(0)).current
  const tapTimeoutRef = useRef(null)
  const lastTapTimeRef = useRef(0)
  const reactions = [item.sender_reaction, item.receiver_reaction]
    .map(displayReaction)
    .filter(Boolean)
  const uniqueReactions = [...new Set(reactions)]
  const reactionCount = reactions.length
  const isCallMessage = item.message_type === 'call'
  const pendingLocal = Boolean(item.pending_local)
  const canReact = !isCallMessage && !item.deleted_for_everyone_at && !pendingLocal
  const [reactionPickerMounted, setReactionPickerMounted] = useState(false)
  const senderName = isMine ? 'You' : getProfileName(senderProfile, 'Member')
  const resolvedSenderProfile = senderProfile || {
    id: item.sender_id,
    user_id: item.sender_id,
    display_name: senderName,
  }
  const hasReplyBlock = Boolean(repliedMessage)
  const bubbleMaxWidth = hasReplyBlock
    ? '94%'
    : item.message_type === 'text'
      ? '89%'
      : '82%'
  const resolvedOutgoingBubbleColor = normalizeHexColor(outgoingBubbleColor, WHATSAPP_OUTGOING_BUBBLE)
  const resolvedOutgoingAccentColor = normalizeHexColor(outgoingAccentColor, WHATSAPP_ACCENT)
  const outgoingBubbleIsDark = getRelativeLuminance(resolvedOutgoingBubbleColor) < 0.45
  const outgoingMessageStyle = {
    textColor: outgoingBubbleIsDark ? '#ffffff' : WHATSAPP_TEXT,
    metaColor: outgoingBubbleIsDark ? 'rgba(255,255,255,0.78)' : WHATSAPP_META,
    accentColor: outgoingBubbleIsDark ? '#ffffff' : resolvedOutgoingAccentColor,
    softAccentColor: outgoingBubbleIsDark
      ? 'rgba(255,255,255,0.18)'
      : hexToRgba(resolvedOutgoingAccentColor, 0.12),
  }
  const messageStyle = isMine ? outgoingMessageStyle : DEFAULT_MESSAGE_STYLE
  const sentCheckColor = outgoingBubbleIsDark ? '#bfdbfe' : WHATSAPP_CHECK
  const bubbleSurfaceColor = isMine ? resolvedOutgoingBubbleColor : WHATSAPP_INCOMING_BUBBLE
  const bubbleTailColor = bubbleSurfaceColor
  const bubbleBorderColor = highlighted
    ? '#f59e0b'
    : isMine
      ? getBubbleBorderColor(resolvedOutgoingBubbleColor)
      : WHATSAPP_INCOMING_BORDER
  const bubbleRadius = 10
  const bubbleTailRadius = 3
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

  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current)
      }
      reactionPickerAnim.stopAnimation()
      reactionDanceAnim.stopAnimation()
    }
  }, [reactionDanceAnim, reactionPickerAnim])

  function animateReactionPickerOpen() {
    setReactionPickerMounted(true)
    reactionPickerAnim.setValue(0)
    reactionDanceAnim.setValue(0)

    Animated.parallel([
      Animated.spring(reactionPickerAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 180,
        friction: 10,
      }),
      Animated.sequence([
        Animated.delay(80),
        Animated.loop(
          Animated.sequence([
            Animated.timing(reactionDanceAnim, {
              toValue: 1,
              duration: 460,
              useNativeDriver: true,
            }),
            Animated.timing(reactionDanceAnim, {
              toValue: 0,
              duration: 460,
              useNativeDriver: true,
            }),
          ]),
          { iterations: 3 }
        ),
      ]),
    ]).start()
  }

  function animateReactionPickerClosed() {
    reactionDanceAnim.stopAnimation()

    Animated.timing(reactionPickerAnim, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setReactionPickerMounted(false)
      }
    })
  }

  useEffect(() => {
    if (reactionPickerOpen && canReact) {
      animateReactionPickerOpen()
      return
    }

    if (!reactionPickerOpen && reactionPickerMounted) {
      animateReactionPickerClosed()
    }
  }, [canReact, reactionPickerOpen])

  function showReactionPicker() {
    if (!canReact) return

    onRequestReactionPicker?.(item.id)
  }

  function hideReactionPicker() {
    onDismissReactionPicker?.()
  }

  function selectReaction(reaction) {
    onSetReaction?.(item, reaction)
    hideReactionPicker()
  }

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
      hideReactionPicker()
      return
    }

    lastTapTimeRef.current = now
    tapTimeoutRef.current = setTimeout(() => {
      showReactionPicker()
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
        {showSenderIdentity ? (
          <View
            style={{
              maxWidth: '82%',
              alignSelf: isMine ? 'flex-end' : 'flex-start',
              flexDirection: isMine ? 'row-reverse' : 'row',
              alignItems: 'center',
              gap: 6,
              marginBottom: 4,
              paddingHorizontal: 2,
            }}
          >
            <Avatar
              profile={resolvedSenderProfile}
              name={senderName}
              size={22}
              borderWidth={1}
              borderColor="#fff"
            />
            <Text
              numberOfLines={1}
              style={{
                color: '#64748b',
                fontSize: 11,
                fontWeight: '900',
                maxWidth: 180,
              }}
            >
              {senderName}
            </Text>
          </View>
        ) : null}

        <Animated.View
          {...panResponder.panHandlers}
          style={{
            transform: [{ translateX }],
            maxWidth: bubbleMaxWidth,
            overflow: 'visible',
          }}
        >
          {reactionPickerMounted ? (
            <Animated.View
              style={{
                position: 'absolute',
                top: -50,
                [isMine ? 'right' : 'left']: 0,
                zIndex: 30,
                elevation: 12,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 8,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                shadowColor: '#0f172a',
                shadowOpacity: 0.14,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 8 },
                opacity: reactionPickerAnim,
                transform: [
                  {
                    translateY: reactionPickerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0],
                    }),
                  },
                  {
                    scale: reactionPickerAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.86, 1],
                    }),
                  },
                ],
              }}
            >
              {QUICK_REACTIONS.map((reaction, index) => (
                <Pressable
                  key={reaction}
                  onPressIn={onReactionInteraction}
                  onPress={() => selectReaction(reaction)}
                  hitSlop={8}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: index === 0 ? 0 : 3,
                    backgroundColor: 'rgba(241,245,249,0.9)',
                  }}
                >
                  <Animated.Text
                    style={{
                      fontSize: 19,
                      transform: [
                        {
                          translateY: reactionDanceAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, index % 2 === 0 ? -4 : 3],
                          }),
                        },
                        {
                          rotate: reactionDanceAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', index % 2 === 0 ? '-5deg' : '5deg'],
                          }),
                        },
                      ],
                    }}
                  >
                    {reaction}
                  </Animated.Text>
                </Pressable>
              ))}
            </Animated.View>
          ) : null}

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

          {!item.deleted_for_everyone_at ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 0,
                [isMine ? 'right' : 'left']: -7,
                width: 0,
                height: 0,
                borderTopWidth: 12,
                borderTopColor: bubbleTailColor,
                ...(isMine
                  ? {
                    borderRightWidth: 10,
                    borderRightColor: 'transparent',
                  }
                  : {
                    borderLeftWidth: 10,
                    borderLeftColor: 'transparent',
                  }),
              }}
            />
          ) : null}

          <Pressable
            onPressIn={onReactionInteraction}
            onPress={handleTap}
            onLongPress={() => {
              hideReactionPicker()
              onLongPressMessage?.(item)
            }}
            delayLongPress={220}
            style={{
              backgroundColor: bubbleSurfaceColor,
              borderRadius: bubbleRadius,
              borderTopRightRadius: isMine ? bubbleTailRadius : bubbleRadius,
              borderTopLeftRadius: isMine ? bubbleRadius : bubbleTailRadius,
              paddingHorizontal: item.message_type === 'text' ? 12 : 5,
              paddingVertical: item.message_type === 'text' ? 7 : 5,
              borderWidth: highlighted ? 2 : (isMine ? 0 : 1),
              borderColor: bubbleBorderColor,
              overflow: 'hidden',
              shadowColor: '#0f172a',
              shadowOpacity: 0.05,
              shadowRadius: 2,
              shadowOffset: { width: 0, height: 1 },
              elevation: 1,
            }}
          >
            {repliedMessage ? (
              <Pressable
                onPress={() => onJumpToMessage?.(repliedMessage.id)}
                style={{
                  marginBottom: 8,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  backgroundColor: isMine ? 'rgba(255,255,255,0.38)' : '#f5f6f6',
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  overflow: 'hidden',
                }}
              >
                <ReplyPreviewMedia message={repliedMessage} isMine={isMine} messageStyle={messageStyle} />

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      color: isMine ? messageStyle.accentColor : '#1877F2',
                      fontWeight: '900',
                      fontSize: 12,
                    }}
                    numberOfLines={1}
                  >
                    {repliedMessage.sender_id === currentUserId ? 'You' : 'Reply'}
                  </Text>
                  <Text
                    style={{
                      color: isMine ? messageStyle.textColor : '#334155',
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

            {renderMessageContent(
              item,
              isMine,
              onOpenMedia,
              redPacket,
              onOpenRedPacket,
              onShowRedPacketDetails,
              openingRedPacketId,
              onOpenContactCard,
              linkPreview,
              messageStyle
            )}

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
                  color: messageStyle.metaColor,
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
                    color={messageStyle.metaColor}
                    style={{ marginLeft: 4 }}
                  />
                ) : (
                  <Text
                    style={{
                      color: item.seen_at ? sentCheckColor : messageStyle.metaColor,
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
              {uniqueReactions.map((reaction, index) => (
                <Text
                  key={`${item.id}-reaction-${reaction}`}
                  style={{
                    fontSize: 12,
                    marginLeft: index === 0 ? 0 : -2,
                  }}
                >
                  {reaction}
                </Text>
              ))}
              {reactionCount > uniqueReactions.length ? (
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
