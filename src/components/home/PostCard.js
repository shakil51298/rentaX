import { Image, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Avatar from '../common/Avatar'
import { normalizeMediaList } from '../../lib/media'
import { timeAgo } from '../../lib/time'
import { getProfileName } from '../../lib/userDisplay'

export default function PostCard({
  item,
  currentUser,
  onToggleLike,
  onOpenComments,
  onToggleFavorite,
  onShare,
  onOpenMedia,
  onOpenOwnerProfile,
}) {
  const totalReacts = item.property_reactions?.length || 0
  const totalComments = item.property_comments?.length || 0
  const totalFavorites = item.property_favorites?.length || 0
  const media = normalizeMediaList(item.media)
  const ownerProfile = item.owner_profile || {}
  const ownerDisplayName = getProfileName(
    {
      ...ownerProfile,
      display_name: ownerProfile.display_name || item.owner_name,
      email: ownerProfile.email || item.owner_email,
    },
    'Property Owner'
  )
  const myReaction = item.property_reactions?.find(
    (react) => react.user_id === currentUser?.id
  )
  const isFavorite = item.property_favorites?.some(
    (fav) => fav.user_id === currentUser?.id
  )

  return (
    <View style={{ backgroundColor: '#fff', marginBottom: 10, paddingTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }}>
        <TouchableOpacity
          onPress={() => onOpenOwnerProfile(item)}
          activeOpacity={0.82}
          style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
        >
          <Avatar
            profile={ownerProfile}
            name={ownerDisplayName}
            size={42}
            backgroundColor="#dbeafe"
            textColor="#1d4ed8"
          />

          <View style={{ marginLeft: 10, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '700' }}>
                {ownerDisplayName}
              </Text>

              {ownerProfile.is_verified ? (
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color="#1877F2"
                  style={{ marginLeft: 4 }}
                />
              ) : null}
            </View>

            <Text style={{ fontSize: 12, color: '#777' }}>
              {timeAgo(item.created_at)}
            </Text>
          </View>
        </TouchableOpacity>

        <Ionicons name="ellipsis-horizontal" size={22} color="#555" />
      </View>

      <Text style={{ paddingHorizontal: 14, marginTop: 10, fontSize: 15, lineHeight: 21 }}>
        {item.title}
        {'\n'}
        {item.description}
        {'\n\n'}Rent: ৳ {item.price}
        {'\n'}Location: {item.location || 'Location not added'}
      </Text>

      {media.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, paddingHorizontal: 8 }}>
          {media.slice(0, 4).map((mediaItem, index) => (
            <TouchableOpacity
              key={`${mediaItem.uri}-${index}`}
              onPress={() => onOpenMedia(media, index)}
              activeOpacity={0.9}
              style={{ width: '50%', padding: 3 }}
            >
              {mediaItem.type === 'video' ? (
                <View
                  style={{
                    height: 130,
                    backgroundColor: '#111',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="play-circle" size={40} color="#fff" />
                </View>
              ) : (
                <Image
                  source={{ uri: mediaItem.uri }}
                  style={{ width: '100%', height: 130, backgroundColor: '#eee' }}
                  resizeMode="cover"
                  resizeMethod="resize"
                  fadeDuration={120}
                />
              )}

              {index === 3 && media.length > 4 ? (
                <View
                  style={{
                    position: 'absolute',
                    left: 3,
                    right: 3,
                    top: 3,
                    bottom: 3,
                    backgroundColor: 'rgba(0,0,0,0.45)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>
                    +{media.length - 4}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingVertical: 9,
        }}
      >
        <Text style={{ color: '#666' }}>
          {totalReacts > 0 ? `👍 ${totalReacts}` : ''}
        </Text>

        <Text style={{ color: '#666' }}>
          👁 {item.view_count || 0} · 💬 {totalComments} · ❤️ {totalFavorites}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: '#eee',
        }}
      >
        <TouchableOpacity
          onPress={() => onToggleLike(item.id)}
          style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }}
        >
          <Ionicons
            name={myReaction ? 'thumbs-up' : 'thumbs-up-outline'}
            size={22}
            color={myReaction ? '#1877F2' : '#555'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onOpenComments(item)}
          style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }}
        >
          <Ionicons name="chatbubble-outline" size={22} color="#555" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onToggleFavorite(item)}
          style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }}
        >
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={23}
            color={isFavorite ? 'red' : '#555'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onShare(item)}
          style={{ flex: 1, paddingVertical: 12, alignItems: 'center' }}
        >
          <Ionicons name="share-social-outline" size={22} color="#555" />
        </TouchableOpacity>
      </View>
    </View>
  )
}
