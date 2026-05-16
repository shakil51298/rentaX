import { Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Avatar from '../common/Avatar'
import { formatClock } from '../../lib/chatUtils'
import { getProfileName } from '../../lib/userDisplay'

export default function ConversationRow({
  item,
  currentUserId,
  presenceByUserId,
  onPress,
}) {
  const profile = item.other_profile
  const name = getProfileName(profile)
  const isLastMine = item.last_sender_id === currentUserId
  const isOnline = item.presence?.is_online || presenceByUserId[item.other_user_id]?.is_online

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 13,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eef2f7',
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
              borderColor: '#fff',
            }}
          />
        ) : null}
      </View>

      <View style={{ flex: 1, marginLeft: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={{ flex: 1, color: '#111827', fontSize: 16, fontWeight: '900' }}
            numberOfLines={1}
          >
            {name}
          </Text>

          <Text style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>
            {formatClock(item.last_message_at || item.created_at)}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5 }}>
          {isLastMine ? (
            <Ionicons
              name="checkmark-done"
              size={15}
              color="#64748b"
              style={{ marginRight: 4 }}
            />
          ) : null}

          <Text
            style={{
              flex: 1,
              color: item.unread_count ? '#111827' : '#64748b',
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
            backgroundColor: '#1877F2',
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
    </TouchableOpacity>
  )
}
