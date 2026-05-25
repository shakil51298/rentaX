import { Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Avatar from '../common/Avatar'
import { formatClock } from '../../lib/chatUtils'
import { getProfileName } from '../../lib/userDisplay'
import { useAppSettings } from '../../lib/appSettings'

export default function ConversationRow({
  item,
  currentUserId,
  presenceByUserId,
  onPress,
  onLongPress,
  selected = false,
  selectionMode = false,
}) {
  const { theme } = useAppSettings()
  const profile = item.other_profile
  const name = getProfileName(profile)
  const isLastMine = item.last_sender_id === currentUserId
  const isOnline = item.presence?.is_online || presenceByUserId[item.other_user_id]?.is_online
  const isLastCall = item.last_message_type === 'call'
  const lastMessageText = String(item.last_message || '')
  const isVideoCall = isLastCall && /video call/i.test(lastMessageText)
  const isLastLocation = item.last_message_type === 'file' && /shared location/i.test(lastMessageText)
  const isLastRedPacket = item.last_message_type === 'file' && /red packet/i.test(lastMessageText)
  const isLastContactCard = item.last_message_type === 'file' && /contact card/i.test(lastMessageText)
  const isVerified = Boolean(profile?.is_verified)

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={220}
      activeOpacity={0.82}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 13,
        backgroundColor: selected ? theme.accentSoft : theme.surface,
        borderBottomWidth: 1,
        borderBottomColor: selected ? theme.border : theme.surfaceMuted,
      }}
    >
      <View>
        <Avatar profile={profile} name={name} size={52} />

        {isOnline ? (
          <View
            style={{
              position: 'absolute',
              right: 1,
              bottom: 1,
              width: 15,
              height: 15,
              borderRadius: 8,
              backgroundColor: '#22c55e',
              borderWidth: 2,
              borderColor: theme.surface,
            }}
          />
        ) : null}
      </View>

      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
            <Text
              style={{ color: theme.text, fontSize: 16, fontWeight: '900', flexShrink: 1 }}
              numberOfLines={1}
            >
              {name}
            </Text>

            {isVerified ? (
              <Ionicons
                name="checkmark-circle"
                size={14}
                color="#1877F2"
                style={{ marginLeft: 5, flexShrink: 0 }}
              />
            ) : null}
          </View>

          <Text style={{ color: theme.mutedText, fontSize: 12, marginLeft: 8 }}>
            {formatClock(item.last_message_at || item.created_at)}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
          {isLastMine ? (
            <Ionicons
              name="checkmark-done"
              size={15}
              color={theme.mutedText}
              style={{ marginRight: 4 }}
            />
          ) : null}

          {isLastCall ? (
            <Ionicons
              name={isVideoCall ? 'videocam-outline' : 'call-outline'}
              size={14}
              color={theme.mutedText}
              style={{ marginRight: 4 }}
            />
          ) : null}

          {isLastLocation ? (
            <Ionicons
              name="location-outline"
              size={14}
              color={theme.mutedText}
              style={{ marginRight: 4 }}
            />
          ) : null}

          {isLastRedPacket ? (
            <Ionicons
              name="gift-outline"
              size={14}
              color={theme.mutedText}
              style={{ marginRight: 4 }}
            />
          ) : null}

          {isLastContactCard ? (
            <Ionicons
              name="id-card-outline"
              size={14}
              color={theme.mutedText}
              style={{ marginRight: 4 }}
            />
          ) : null}

          <Text
            style={{
              flex: 1,
              color: item.unread_count ? theme.text : theme.mutedText,
              fontWeight: item.unread_count ? '800' : '500',
            }}
            numberOfLines={1}
          >
            {item.last_message || 'Start the conversation'}
          </Text>
        </View>
      </View>

      {item.unread_count ? (
        <View
          style={{
            minWidth: 22,
            height: 22,
            borderRadius: 11,
            paddingHorizontal: 6,
            backgroundColor: theme.accent,
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 8,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '900' }}>
            {item.unread_count}
          </Text>
        </View>
      ) : null}

      {selectionMode ? (
        <View
          style={{
            width: 24,
            alignItems: 'flex-end',
            marginLeft: 10,
          }}
        >
          <Ionicons
            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
            size={22}
            color={selected ? theme.accent : theme.mutedText}
          />
        </View>
      ) : null}
    </TouchableOpacity>
  )
}
