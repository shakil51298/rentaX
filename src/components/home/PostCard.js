import { useMemo, useState } from 'react'
import { Image, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Avatar from '../common/Avatar'
import { normalizeMediaList } from '../../lib/media'
import { timeAgo } from '../../lib/time'
import { getProfileName } from '../../lib/userDisplay'
import { getOwnerVerificationStatus, getPropertyVerificationStatus } from '../../lib/verification'

function getStatusMeta(status) {
  if (status === 'rented') {
    return {
      label: 'Rented out',
      backgroundColor: '#fef2f2',
      textColor: '#dc2626',
    }
  }

  return {
    label: 'Open for rent',
    backgroundColor: '#ecfdf5',
    textColor: '#059669',
  }
}

function getShortLocationLabel(location) {
  if (!location) return ''

  return String(location)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)[0]
}

function getPropertyMetaChips(item) {
  const chips = []

  if (Number(item?.beds || 0) > 0) {
    chips.push(`${item.beds} bed`)
  }

  if (Number(item?.baths || 0) > 0) {
    chips.push(`${item.baths} bath`)
  }

  if (item?.furnishing_status === 'furnished') {
    chips.push('Furnished')
  } else if (item?.furnishing_status === 'unfurnished') {
    chips.push('Unfurnished')
  }

  if (item?.pet_friendly) {
    chips.push('Pet friendly')
  }

  return chips
}

export default function PostCard({
  item,
  currentUser,
  onToggleLike,
  onOpenComments,
  onToggleFavorite,
  onShare,
  onOpenMedia,
  onOpenOwnerProfile,
  onPressMore,
  onOpenPost,
}) {
  const [expanded, setExpanded] = useState(false)
  const totalReacts = item.property_reactions?.length || 0
  const totalComments = item.property_comments?.length || 0
  const totalFavorites = item.property_favorites?.length || 0
  const media = normalizeMediaList(item.media)
  const ownerProfile = item.owner_profile || {}
  const isVerifiedOwner = getOwnerVerificationStatus(ownerProfile) === 'verified'
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
  const statusMeta = getStatusMeta(item.status)
  const isVerifiedProperty = getPropertyVerificationStatus(item) === 'verified'
  const locationLabel = getShortLocationLabel(item.location)
  const rentLabel = item.price ? `৳ ${item.price}` : ''
  const isAdminBanned = Boolean(item.admin_is_banned)
  const metaChips = getPropertyMetaChips(item)
  const contentText = useMemo(
    () =>
      `${item.title || ''}\n${item.description || 'No description added'}`,
    [item.description, item.title]
  )
  const showMoreToggle = contentText.length > 170
  const handleOpenPost = () => onOpenPost?.(item)

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

              {isVerifiedOwner ? (
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color="#1877F2"
                  style={{ marginLeft: 4 }}
                />
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 12, color: '#777', marginRight: 8 }}>
                {timeAgo(item.created_at)}
              </Text>

              <View
                style={{
                  backgroundColor: statusMeta.backgroundColor,
                  borderRadius: 999,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: statusMeta.textColor }}>
                    {statusMeta.label}
                  </Text>
                </View>

              {isVerifiedProperty ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#eff6ff',
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    marginLeft: 6,
                  }}
                >
                  <Ionicons
                    name="checkmark-circle"
                    size={11}
                    color="#2563eb"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#2563eb' }}>
                    Verified
                  </Text>
                </View>
              ) : null}

              {isAdminBanned ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#fef2f2',
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    marginLeft: 6,
                  }}
                >
                  <Ionicons
                    name="ban-outline"
                    size={11}
                    color="#dc2626"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#dc2626' }}>
                    Hidden by admin
                  </Text>
                </View>
              ) : null}

              {locationLabel ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#f8fafc',
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    marginLeft: 6,
                    maxWidth: 132,
                  }}
                >
                  <Ionicons
                    name="location-outline"
                    size={11}
                    color="#64748b"
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={{ fontSize: 11, fontWeight: '700', color: '#475569', flexShrink: 1 }}
                  >
                    {locationLabel}
                  </Text>
                </View>
              ) : null}

              {rentLabel ? (
                <View
                  style={{
                    backgroundColor: '#fff7ed',
                    borderRadius: 999,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    marginLeft: 6,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#ea580c' }}>
                    {rentLabel}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>

        {onPressMore ? (
          <TouchableOpacity
            onPress={() => onPressMore(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ paddingLeft: 10, paddingVertical: 6 }}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color="#555" />
          </TouchableOpacity>
        ) : (
          <Ionicons name="ellipsis-horizontal" size={22} color="#555" />
        )}
      </View>

      <TouchableOpacity
        activeOpacity={onOpenPost ? 0.88 : 1}
        onPress={handleOpenPost}
        disabled={!onOpenPost}
      >
        <Text
          style={{ paddingHorizontal: 14, marginTop: 10, fontSize: 15, lineHeight: 21 }}
          numberOfLines={expanded ? undefined : 6}
        >
          {contentText}
        </Text>
      </TouchableOpacity>

      {metaChips.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, marginTop: 10 }}>
          {metaChips.map((chip) => (
            <View
              key={chip}
              style={{
                backgroundColor: '#f8fafc',
                borderRadius: 999,
                paddingHorizontal: 9,
                paddingVertical: 5,
                borderWidth: 1,
                borderColor: '#e2e8f0',
              }}
            >
              <Text style={{ color: '#475569', fontSize: 11, fontWeight: '800' }}>{chip}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {showMoreToggle ? (
        <TouchableOpacity
          onPress={() => setExpanded((current) => !current)}
          style={{ paddingHorizontal: 14, marginTop: 6 }}
        >
          <Text style={{ color: '#1877F2', fontWeight: '800' }}>
            {expanded ? 'less' : 'more...'}
          </Text>
        </TouchableOpacity>
      ) : null}

      {media.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, paddingHorizontal: 8 }}>
          {media.slice(0, 4).map((mediaItem, index) => (
            <TouchableOpacity
              key={`${mediaItem.uri}-${index}`}
              onPress={() => (onOpenPost ? handleOpenPost() : onOpenMedia(media, index))}
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
