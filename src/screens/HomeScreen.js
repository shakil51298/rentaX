import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  ScrollView,
  TextInput,
  Share,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { VideoView, useVideoPlayer } from 'expo-video'
import { supabase } from '../lib/supabase'
import {
  createNotification,
  getUnreadNotificationCount,
} from '../lib/notifications'
import { playNotificationSound } from '../lib/sounds'

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
      result.catch(() => { })
    }
  } catch {
    // Expo releases video shared objects during close/unmount; ignore stale player calls.
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
    <View
      style={{
        width,
        height,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000',
      }}
    >
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

function MediaViewer({ visible, media, initialIndex, onClose }) {
  const { width, height } = useWindowDimensions()
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const imageCount = media?.length || 0
  const safeInitialIndex = Math.min(initialIndex, Math.max(imageCount - 1, 0))

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
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            paddingHorizontal: 14,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(0,0,0,0.35)',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            {imageCount ? `${currentIndex + 1} / ${imageCount}` : ''}
          </Text>

          <TouchableOpacity
            onPress={onClose}
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
          </TouchableOpacity>
        </View>

        {imageCount > 0 ? (
          <FlatList
            key={`${width}-${safeInitialIndex}`}
            data={media}
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

const PostCard = memo(function PostCard({
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
  const media = item.media || []
  const ownerProfile = item.owner_profile || {}
  const ownerDisplayName =
    ownerProfile.display_name ||
    item.owner_name ||
    item.owner_email ||
    'Property Owner'
  const ownerAvatarUrl = ownerProfile.avatar_url
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
          {ownerAvatarUrl ? (
            <Image
              source={{ uri: ownerAvatarUrl }}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: '#ddd',
              }}
            />
          ) : (
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: '#dbeafe',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#1d4ed8', fontWeight: '900' }}>
                {ownerDisplayName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

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
})

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)

  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function displayNameFromEmail(email) {
  if (!email) return 'User'

  return email.split('@')[0]
}

function getUserDisplayName(user) {
  return (
    user?.user_metadata?.name ||
    user?.user_metadata?.full_name ||
    displayNameFromEmail(user?.email)
  )
}

function getUserAvatarUrl(user) {
  return (
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    user?.user_metadata?.profile_picture ||
    null
  )
}

function getCommentAuthorName(comment) {
  return (
    comment.profile?.display_name ||
    comment.user_name ||
    comment.owner_name ||
    comment.full_name ||
    displayNameFromEmail(comment.user_email)
  )
}

function getCommentAvatarUrl(comment) {
  return (
    comment.profile?.avatar_url ||
    comment.avatar_url ||
    comment.user_avatar ||
    comment.profile_picture ||
    comment.photo_url ||
    null
  )
}

function getCommentParentId(comment) {
  return comment.parent_comment_id || comment.parent_id || comment.reply_to_comment_id || null
}

async function fetchCommentProfilesByUserId(userIds) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))]

  if (uniqueUserIds.length === 0) return {}

  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, email, display_name, avatar_url, is_verified')
    .in('user_id', uniqueUserIds)

  if (error) return {}

  return (data || []).reduce((profilesById, profile) => {
    profilesById[profile.user_id] = profile
    return profilesById
  }, {})
}

function enrichCommentsWithProfiles(comments, profilesByUserId) {
  return comments.map((comment) => {
    const profile = profilesByUserId[comment.user_id]

    return {
      ...comment,
      profile: profile || null,
      user_name: profile?.display_name || comment.user_name,
      avatar_url: profile?.avatar_url || comment.avatar_url,
      is_verified: profile?.is_verified ?? comment.is_verified,
    }
  })
}

function buildCommentThread(rawComments) {
  const commentsById = new Map()
  const rootComments = []

  rawComments.forEach((comment) => {
    commentsById.set(String(comment.id), {
      ...comment,
      replies: [],
    })
  })

  commentsById.forEach((comment) => {
    const parentId = getCommentParentId(comment)

    if (parentId && commentsById.has(String(parentId))) {
      commentsById.get(String(parentId)).replies.push(comment)
    } else {
      rootComments.push(comment)
    }
  })

  return rootComments
}

function updateCommentTree(comments, commentId, updater) {
  return comments.map((comment) => {
    if (String(comment.id) === String(commentId)) {
      return updater(comment)
    }

    return {
      ...comment,
      replies: updateCommentTree(comment.replies || [], commentId, updater),
    }
  })
}

function removeCommentFromTree(comments, commentId) {
  return comments
    .filter((comment) => String(comment.id) !== String(commentId))
    .map((comment) => ({
      ...comment,
      replies: removeCommentFromTree(comment.replies || [], commentId),
    }))
}

function appendCommentToTree(comments, newComment) {
  const commentWithReplies = {
    ...newComment,
    property_comment_likes: newComment.property_comment_likes || [],
    replies: newComment.replies || [],
  }
  const parentId = getCommentParentId(commentWithReplies)

  if (!parentId) {
    return [...comments, commentWithReplies]
  }

  function insertIntoBranch(branch) {
    let inserted = false

    const items = branch.map((comment) => {
      if (String(comment.id) === String(parentId)) {
        inserted = true

        return {
          ...comment,
          replies: [...(comment.replies || []), commentWithReplies],
        }
      }

      const childResult = insertIntoBranch(comment.replies || [])

      if (childResult.inserted) {
        inserted = true

        return {
          ...comment,
          replies: childResult.items,
        }
      }

      return comment
    })

    return { inserted, items }
  }

  const result = insertIntoBranch(comments)

  return result.inserted ? result.items : [...comments, commentWithReplies]
}

function collectCommentIds(comment) {
  return [
    String(comment.id),
    ...(comment.replies || []).flatMap((reply) => collectCommentIds(reply)),
  ]
}

function Avatar({ name, uri, size = 34 }) {
  const initial = name?.trim()?.charAt(0)?.toUpperCase() || 'U'

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#ddd',
        }}
      />
    )
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#dfe3ee',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#38445a', fontWeight: '700' }}>{initial}</Text>
    </View>
  )
}

const CommentItem = memo(function CommentItem({
  comment,
  currentUser,
  onLike,
  onReply,
  onDelete,
  onOpenProfile,
  depth = 0,
}) {
  const authorName = getCommentAuthorName(comment)
  const avatarUrl = getCommentAvatarUrl(comment)
  const likes = comment.property_comment_likes || []
  const isLiked = likes.some((like) => like.user_id === currentUser?.id)
  const isOwner = currentUser?.id && String(comment.user_id) === currentUser.id
  const canOpenProfile = Boolean(comment.user_id)
  const replyIndent = depth > 0 ? 34 : 0

  return (
    <View style={{ marginLeft: replyIndent, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <TouchableOpacity
          activeOpacity={0.82}
          disabled={!canOpenProfile}
          onPress={() => onOpenProfile(comment)}
        >
          <Avatar name={authorName} uri={avatarUrl} size={depth > 0 ? 30 : 36} />
        </TouchableOpacity>

        <View style={{ marginLeft: 8, flex: 1 }}>
          <TouchableOpacity
            activeOpacity={0.82}
            onLongPress={() => {
              if (isOwner) {
                onDelete(comment)
              }
            }}
            style={{
              backgroundColor: '#f0f2f5',
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <TouchableOpacity
              activeOpacity={0.82}
              disabled={!canOpenProfile}
              onPress={() => onOpenProfile(comment)}
              style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' }}
            >
              <Text style={{ fontWeight: '700', fontSize: 13 }}>
                {authorName}
              </Text>

              {comment.is_verified ? (
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color="#1877F2"
                  style={{ marginLeft: 4 }}
                />
              ) : null}
            </TouchableOpacity>

            <Text style={{ marginTop: 3, fontSize: 14, lineHeight: 19 }}>
              {comment.comment}
            </Text>
          </TouchableOpacity>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              marginTop: 5,
              paddingLeft: 8,
            }}
          >
            <Text style={{ color: '#777', fontSize: 12 }}>
              {timeAgo(comment.created_at)}
            </Text>

            <TouchableOpacity onPress={() => onLike(comment)}>
              <Text
                style={{
                  color: isLiked ? '#1877F2' : '#666',
                  fontWeight: '700',
                  fontSize: 12,
                }}
              >
                {isLiked ? 'Unlike' : 'Like'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => onReply(comment)}>
              <Text style={{ color: '#666', fontWeight: '700', fontSize: 12 }}>
                Reply
              </Text>
            </TouchableOpacity>

            {likes.length > 0 ? (
              <Text style={{ color: '#777', fontSize: 12 }}>
                👍 {likes.length}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {comment.replies?.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          currentUser={currentUser}
          onLike={onLike}
          onReply={onReply}
          onDelete={onDelete}
          onOpenProfile={onOpenProfile}
          depth={depth + 1}
        />
      ))}
    </View>
  )
})

export default function HomeScreen({ navigation, route }) {
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)
  const [commentModal, setCommentModal] = useState(false)
  const [selectedPost, setSelectedPost] = useState(null)
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [replyTarget, setReplyTarget] = useState(null)
  const [commentLoading, setCommentLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0)
  const [messageUnreadCount, setMessageUnreadCount] = useState(0)
  const [mediaViewer, setMediaViewer] = useState({
    visible: false,
    media: [],
    index: 0,
  })
  const reopenCommentsOnFocus = useRef(false)
  const handledCommentRouteRequest = useRef(null)
  const commentReturnRoute = useRef(null)

  useEffect(() => {
    loadUser()
    loadProperties()
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!reopenCommentsOnFocus.current || !selectedPost?.id) return

      reopenCommentsOnFocus.current = false
      setCommentModal(true)
      loadComments(selectedPost.id)
    }, [selectedPost])
  )

  useFocusEffect(
    useCallback(() => {
      const params = route?.params || {}
      const postId = params.openCommentsForPostId || params.openCommentsForPost?.id

      if (!postId) return undefined

      const requestId = params.openCommentsRequestId || `${postId}-${params.openCommentsTargetCommentId || ''}`

      if (handledCommentRouteRequest.current === requestId) return undefined

      handledCommentRouteRequest.current = requestId
      let isActive = true

      async function openRouteCommentSheet() {
        let post =
          params.openCommentsForPost ||
          properties.find((item) => String(item.id) === String(postId)) ||
          null

        if (!post) {
          const { data } = await supabase
            .from('properties')
            .select('*')
            .eq('id', postId)
            .maybeSingle()

          post = data || { id: postId }
        }

        if (!isActive) return

        commentReturnRoute.current = params.openCommentsReturnTo || null
        setSelectedPost(post)
        setReplyTarget(null)
        setCommentText('')
        setCommentModal(true)
        loadComments(post.id)

        navigation.setParams({
          openCommentsForPostId: undefined,
          openCommentsForPost: undefined,
          openCommentsTargetCommentId: undefined,
          openCommentsRequestId: undefined,
          openCommentsReturnTo: undefined,
        })
      }

      openRouteCommentSheet()

      return () => {
        isActive = false
      }
    }, [navigation, properties, route?.params])
  )

  async function refreshMessageBadge(userId) {
    if (!userId) {
      setMessageUnreadCount(0)
      return
    }

    const { count, error } = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', userId)
      .is('seen_at', null)

    if (!error) {
      setMessageUnreadCount(count || 0)
    }
  }

  useEffect(() => {
    if (!currentUser?.id) {
      setMessageUnreadCount(0)
      return undefined
    }

    refreshMessageBadge(currentUser.id)

    const channel = supabase
      .channel(`home-message-badge-${currentUser.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `receiver_id=eq.${currentUser.id}`,
        },
        (payload) => {
          if (payload.new?.sender_id !== currentUser.id) {
            playNotificationSound()
          }

          refreshMessageBadge(currentUser.id)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUser?.id])

  useEffect(() => {
    if (!currentUser?.id) {
      setNotificationUnreadCount(0)
      return undefined
    }

    refreshNotificationBadge(currentUser.id)

    const channelName = `home-notifications-${currentUser.id}-${Date.now()}-${Math.random()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${currentUser.id}`,
        },
        () => {
          playNotificationSound()
          refreshNotificationBadge(currentUser.id)
        }
      )
      .subscribe()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [currentUser?.id])

  useEffect(() => {
    if (!commentModal || !selectedPost?.id) return undefined

    let refreshTimer = null
    const postId = selectedPost.id
    const refreshCommentsSilently = () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer)
      }

      refreshTimer = setTimeout(() => {
        loadComments(postId, false)
      }, 250)
    }

    const channelName = `property-comments-${postId}-${Date.now()}-${Math.random()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'property_comments',
          filter: `property_id=eq.${postId}`,
        },
        refreshCommentsSilently
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'property_comments',
          filter: `property_id=eq.${postId}`,
        },
        refreshCommentsSilently
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'property_comments',
        },
        refreshCommentsSilently
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'property_comment_likes',
        },
        refreshCommentsSilently
      )
      .subscribe()

    return () => {
      if (refreshTimer) {
        clearTimeout(refreshTimer)
      }

      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [commentModal, selectedPost?.id])

  async function loadUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    setCurrentUser(user)
  }

  async function refreshNotificationBadge(userId = currentUser?.id) {
    setNotificationUnreadCount(await getUnreadNotificationCount(userId))
  }

  async function loadProperties() {
    setLoading(true)

    const { data } = await supabase
      .from('properties')
      .select(`
        *,
        property_reactions(id, reaction, user_id),
        property_comments(id),
        property_favorites(id, user_id)
      `)
      .order('created_at', { ascending: false })

    const posts = data || []
    const ownerIds = [...new Set(posts.map((post) => post.owner_id).filter(Boolean))]
    let profilesByUserId = {}

    if (ownerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, email, display_name, avatar_url, is_verified, user_type')
        .in('user_id', ownerIds)

      profilesByUserId = (profiles || []).reduce((profilesById, profile) => ({
        ...profilesById,
        [profile.user_id]: profile,
      }), {})
    }

    setProperties(
      posts.map((post) => ({
        ...post,
        owner_profile: profilesByUserId[post.owner_id] || null,
      }))
    )
    setLoading(false)
  }

  async function selectReaction(propertyId, reaction) {
    if (!currentUser) return

    const { error } = await supabase
      .from('property_reactions')
      .upsert(
        {
          property_id: propertyId,
          user_id: currentUser.id,
          reaction,
        },
        {
          onConflict: 'property_id,user_id',
        }
      )

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    updateLocalReaction(propertyId, reaction)
  }

  function updateLocalReaction(propertyId, reaction) {
    setProperties((oldPosts) =>
      oldPosts.map((post) => {
        if (post.id !== propertyId) return post

        const oldReactions = post.property_reactions || []

        const withoutMine = oldReactions.filter(
          (item) => item.user_id !== currentUser.id
        )

        if (!reaction) {
          return {
            ...post,
            property_reactions: withoutMine,
          }
        }

        return {
          ...post,
          property_reactions: [
            ...withoutMine,
            {
              id: `${propertyId}-${currentUser.id}`,
              property_id: propertyId,
              user_id: currentUser.id,
              reaction,
            },
          ],
        }
      })
    )
  }

  async function toggleLike(propertyId) {
    if (!currentUser) return

    const post = properties.find((item) => item.id === propertyId)

    const myReaction = post?.property_reactions?.find(
      (item) => item.user_id === currentUser.id
    )

    // If already reacted with anything, clicking like button removes reaction
    if (myReaction) {
      const { error } = await supabase
        .from('property_reactions')
        .delete()
        .eq('property_id', propertyId)
        .eq('user_id', currentUser.id)

      if (error) {
        Alert.alert('Error', error.message)
        return
      }

      updateLocalReaction(propertyId, null)
      return
    }

    // If no reaction, default like
    const { error } = await supabase.from('property_reactions').insert({
      property_id: propertyId,
      user_id: currentUser.id,
      reaction: '👍',
    })

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    updateLocalReaction(propertyId, '👍')
    await createNotification({
      recipientId: post?.owner_id,
      actorId: currentUser.id,
      type: 'property_like',
      propertyId,
      title: 'New like',
      body: 'liked your post',
      eventKey: `property_like:${propertyId}:${currentUser.id}`,
    })
  }

  async function reactToPost(propertyId, reaction) {
    if (!currentUser) return

    const post = properties.find((item) => item.id === propertyId)

    const myReaction = post?.property_reactions?.find(
      (item) => item.user_id === currentUser.id
    )

    // if already same reaction, remove reaction
    if (myReaction?.reaction === reaction) {
      const { error } = await supabase
        .from('property_reactions')
        .delete()
        .eq('property_id', propertyId)
        .eq('user_id', currentUser.id)

      if (error) {
        Alert.alert('Error', error.message)
        return
      }

      updateLocalReaction(propertyId, null)
      return
    }

    // if different reaction, update/insert reaction
    const { error } = await supabase
      .from('property_reactions')
      .upsert(
        {
          property_id: propertyId,
          user_id: currentUser.id,
          reaction,
        },
        {
          onConflict: 'property_id,user_id',
        }
      )

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    updateLocalReaction(propertyId, reaction)
    await createNotification({
      recipientId: post?.owner_id,
      actorId: currentUser.id,
      type: 'property_like',
      propertyId,
      title: 'New reaction',
      body: 'reacted to your post',
      eventKey: `property_reaction:${propertyId}:${currentUser.id}`,
    })

  }

  async function loadComments(propertyId, showLoader = true) {
    if (!propertyId) return

    if (showLoader) {
      setCommentLoading(true)
    }

    const { data, error } = await supabase
      .from('property_comments')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: true })

    if (error) {
      if (showLoader) {
        setCommentLoading(false)
        Alert.alert('Error', error.message)
      }

      return
    }

    const commentIds = (data || []).map((comment) => String(comment.id))
    const profilesByUserId = await fetchCommentProfilesByUserId(
      (data || []).map((comment) => comment.user_id)
    )
    let likes = []

    if (commentIds.length > 0) {
      const { data: likesData, error: likesError } = await supabase
        .from('property_comment_likes')
        .select('*')
        .in('comment_id', commentIds)

      if (!likesError) {
        likes = likesData || []
      }
    }

    const enrichedComments = enrichCommentsWithProfiles(data || [], profilesByUserId)
    const likesByCommentId = likes.reduce((groupedLikes, like) => {
      const commentId = String(like.comment_id)

      return {
        ...groupedLikes,
        [commentId]: [...(groupedLikes[commentId] || []), like],
      }
    }, {})

    const commentsWithLikes = enrichedComments.map((comment) => ({
      ...comment,
      property_comment_likes: likesByCommentId[String(comment.id)] || [],
    }))

    setComments(buildCommentThread(commentsWithLikes))

    if (showLoader) {
      setCommentLoading(false)
    }
  }

  async function openComments(post) {
    commentReturnRoute.current = null
    setSelectedPost(post)
    setReplyTarget(null)
    setCommentModal(true)
    loadComments(post.id)
  }

  async function addComment() {
    if (!commentText.trim() || !selectedPost) return

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return

    const profilesByUserId = await fetchCommentProfilesByUserId([user.id])
    const profile = profilesByUserId[user.id]
    const basePayload = {
      property_id: selectedPost.id,
      user_id: user.id,
      user_email: user.email,
      comment: commentText,
    }

    const enhancedPayload = {
      ...basePayload,
      user_name: profile?.display_name || getUserDisplayName(user),
      avatar_url: profile?.avatar_url || getUserAvatarUrl(user),
      parent_comment_id: replyTarget ? String(replyTarget.id) : null,
    }

    const { data: insertedComment, error } = await supabase
      .from('property_comments')
      .insert(enhancedPayload)
      .select('*')
      .single()

    if (error) {
      if (!replyTarget) {
        const { data: fallbackComment, error: fallbackError } = await supabase
          .from('property_comments')
          .insert(basePayload)
          .select('*')
          .single()

        if (!fallbackError) {
          setCommentText('')
          setReplyTarget(null)
          setComments((oldComments) =>
            appendCommentToTree(
              oldComments,
              enrichCommentsWithProfiles([
                {
                  ...fallbackComment,
                  property_comment_likes: [],
                },
              ], profilesByUserId)[0]
            )
          )
          adjustPostCommentCount(selectedPost.id, 1)
          await createNotification({
            recipientId: replyTarget?.user_id || selectedPost.owner_id,
            actorId: user.id,
            type: replyTarget ? 'comment_reply' : 'property_comment',
            propertyId: selectedPost.id,
            commentId: fallbackComment.id,
            title: replyTarget ? 'New reply' : 'New comment',
            body: replyTarget ? 'replied to your comment' : 'commented on your post',
            eventKey: `comment:${fallbackComment.id}`,
          })
          return
        }
      }

      Alert.alert('Error', error.message)
      return
    }

    setCommentText('')
    setReplyTarget(null)
    setComments((oldComments) =>
      appendCommentToTree(
        oldComments,
        enrichCommentsWithProfiles([
          {
            ...insertedComment,
            property_comment_likes: [],
          },
        ], profilesByUserId)[0]
      )
    )
    adjustPostCommentCount(selectedPost.id, 1)
    await createNotification({
      recipientId: replyTarget?.user_id || selectedPost.owner_id,
      actorId: user.id,
      type: replyTarget ? 'comment_reply' : 'property_comment',
      propertyId: selectedPost.id,
      commentId: insertedComment.id,
      title: replyTarget ? 'New reply' : 'New comment',
      body: replyTarget ? 'replied to your comment' : 'commented on your post',
      eventKey: `comment:${insertedComment.id}`,
    })
  }

  async function toggleCommentLike(comment) {
    if (!currentUser) return

    const likes = comment.property_comment_likes || []
    const isLiked = likes.some((like) => like.user_id === currentUser.id)
    const commentId = String(comment.id)

    if (isLiked) {
      const { error } = await supabase
        .from('property_comment_likes')
        .delete()
        .eq('comment_id', commentId)
        .eq('user_id', currentUser.id)

      if (error) {
        Alert.alert('Database update needed', error.message)
        return
      }

      setComments((oldComments) =>
        updateCommentTree(oldComments, commentId, (currentComment) => ({
          ...currentComment,
          property_comment_likes: (
            currentComment.property_comment_likes || []
          ).filter((like) => like.user_id !== currentUser.id),
        }))
      )
    } else {
      const { error } = await supabase
        .from('property_comment_likes')
        .insert({
          comment_id: commentId,
          user_id: currentUser.id,
        })

      if (error) {
        Alert.alert('Database update needed', error.message)
        return
      }

      setComments((oldComments) =>
        updateCommentTree(oldComments, commentId, (currentComment) => ({
          ...currentComment,
          property_comment_likes: [
            ...(currentComment.property_comment_likes || []),
            {
              id: `${commentId}-${currentUser.id}`,
              comment_id: commentId,
              user_id: currentUser.id,
            },
          ],
        }))
      )
      await createNotification({
        recipientId: comment.user_id,
        actorId: currentUser.id,
        type: 'comment_like',
        propertyId: selectedPost?.id,
        commentId,
        title: 'New comment like',
        body: 'liked your comment',
        eventKey: `comment_like:${commentId}:${currentUser.id}`,
      })
    }
  }

  function adjustPostCommentCount(propertyId, amount) {
    setProperties((oldPosts) =>
      oldPosts.map((post) => {
        if (post.id !== propertyId) return post

        const oldComments = post.property_comments || []

        if (amount > 0) {
          return {
            ...post,
            property_comments: [
              ...oldComments,
              { id: `local-comment-${Date.now()}` },
            ],
          }
        }

        return {
          ...post,
          property_comments: oldComments.slice(0, Math.max(oldComments.length - 1, 0)),
        }
      })
    )
  }

  function deleteComment(comment) {
    if (!currentUser || String(comment.user_id) !== currentUser.id) return

    Alert.alert(
      'Delete comment?',
      'This will remove your comment from this post.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => confirmDeleteComment(comment),
        },
      ]
    )
  }

  async function confirmDeleteComment(comment) {
    const commentId = String(comment.id)
    const commentIds = collectCommentIds(comment)

    await supabase
      .from('property_comment_likes')
      .delete()
      .in('comment_id', commentIds)

    const { data: deletedComments, error } = await supabase
      .from('property_comments')
      .delete()
      .in('id', commentIds)
      .select('id')

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    if (!deletedComments?.length) {
      Alert.alert(
        'Delete not saved',
        'Supabase did not delete the comment. Check the delete policy for property_comments.'
      )
      return
    }

    setComments((oldComments) => removeCommentFromTree(oldComments, commentId))

    if (replyTarget && commentIds.includes(String(replyTarget.id))) {
      setReplyTarget(null)
      setCommentText('')
    }

    if (selectedPost) {
      adjustPostCommentCount(selectedPost.id, -deletedComments.length)
    }
  }

  async function toggleFavorite(post) {
    if (!currentUser) return

    const isFavorite = post.property_favorites?.some(
      (item) => item.user_id === currentUser.id
    )

    if (isFavorite) {
      await supabase
        .from('property_favorites')
        .delete()
        .eq('property_id', post.id)
        .eq('user_id', currentUser.id)

      setProperties((oldPosts) =>
        oldPosts.map((item) => {
          if (item.id !== post.id) return item

          return {
            ...item,
            property_favorites: item.property_favorites.filter(
              (fav) => fav.user_id !== currentUser.id
            ),
          }
        })
      )
    } else {
      await supabase.from('property_favorites').insert({
        property_id: post.id,
        user_id: currentUser.id,
      })

      setProperties((oldPosts) =>
        oldPosts.map((item) => {
          if (item.id !== post.id) return item

          return {
            ...item,
            property_favorites: [
              ...(item.property_favorites || []),
              {
                id: Date.now().toString(),
                user_id: currentUser.id,
              },
            ],
          }
        })
      )
      await createNotification({
        recipientId: post.owner_id,
        actorId: currentUser.id,
        type: 'property_favorite',
        propertyId: post.id,
        title: 'New favorite',
        body: 'saved your post',
        eventKey: `property_favorite:${post.id}:${currentUser.id}`,
      })
    }
  }

  async function sharePost(post) {
    await Share.share({
      message: `${post.title}\nRent: ৳ ${post.price}\nLocation: ${post.location || ''}`,
    })
  }

  const openMediaViewer = useCallback((media, index) => {
    setMediaViewer({
      visible: true,
      media,
      index,
    })
  }, [])

  const closeMediaViewer = useCallback(() => {
    setMediaViewer((current) => ({
      ...current,
      visible: false,
    }))
  }, [])

  const openOwnerProfile = useCallback((post) => {
    const ownerProfile = post.owner_profile || {}

    navigation.navigate('OwnerProfile', {
      owner: {
        id: post.owner_id,
        email: ownerProfile.email || post.owner_email,
        name: ownerProfile.display_name || post.owner_name,
      },
    })
  }, [navigation])

  const openCommentProfile = useCallback((comment) => {
    if (!comment?.user_id) return

    reopenCommentsOnFocus.current = true
    closeCommentModal({ skipReturn: true })

    navigation.navigate('OwnerProfile', {
      owner: {
        id: comment.user_id,
        email: comment.profile?.email || comment.user_email,
        name: getCommentAuthorName(comment),
      },
    })
  }, [navigation])

  function closeCommentModal(options = {}) {
    setCommentModal(false)
    setReplyTarget(null)
    setCommentText('')

    if (!options.skipReturn && commentReturnRoute.current) {
      const returnRoute = commentReturnRoute.current
      commentReturnRoute.current = null
      navigation.navigate(returnRoute)
    }
  }

  const commentSheetPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 14 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 70 || gestureState.vy > 0.75) {
          closeCommentModal()
        }
      },
    })
  ).current

  const renderPost = useCallback(({ item }) => (
    <PostCard
      item={item}
      currentUser={currentUser}
      onToggleLike={toggleLike}
      onOpenComments={openComments}
      onToggleFavorite={toggleFavorite}
      onShare={sharePost}
      onOpenMedia={openMediaViewer}
      onOpenOwnerProfile={openOwnerProfile}
    />
  ), [currentUser, openMediaViewer, openOwnerProfile, properties])

  const showInitialLoader = loading && properties.length === 0

  function CreatePostBox() {
    return (
      <View style={{ backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: '#ddd',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="person" size={22} color="#666" />
          </View>

          <TouchableOpacity
            onPress={() => navigation.navigate('CreatePost')}
            style={{
              flex: 1,
              marginLeft: 10,
              borderWidth: 1,
              borderColor: '#ddd',
              borderRadius: 25,
              paddingVertical: 11,
              paddingHorizontal: 16,
            }}
          >
            <Text style={{ color: '#555' }}>What's on your mind?</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('CreatePost')} style={{ marginLeft: 10 }}>
            <Ionicons name="images" size={28} color="green" />
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <View
        style={{
          backgroundColor: '#fff',
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: '#eee',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <TouchableOpacity
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: '#f1f1f1',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="search" size={22} color="#111" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={properties}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        ListHeaderComponent={<CreatePostBox />}
        ListEmptyComponent={
          showInitialLoader ? <ActivityIndicator style={{ marginTop: 30 }} /> : null
        }
        contentContainerStyle={{ paddingBottom: 80 }}
        contentInsetAdjustmentBehavior="automatic"
        refreshing={loading && properties.length > 0}
        onRefresh={loadProperties}
        removeClippedSubviews
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={60}
        windowSize={7}
      />

      <Modal
        visible={commentModal}
        animationType="slide"
        onRequestClose={closeCommentModal}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
          <View
            {...commentSheetPanResponder.panHandlers}
            style={{
              paddingHorizontal: 14,
              paddingTop: 8,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: '#eee',
            }}
          >
            <View
              style={{
                width: 42,
                height: 5,
                borderRadius: 3,
                backgroundColor: '#d0d0d0',
                alignSelf: 'center',
                marginBottom: 10,
              }}
            />

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: '700' }}>Comments</Text>

              <TouchableOpacity onPress={closeCommentModal}>
                <Ionicons name="close" size={28} color="#111" />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
          >
            {commentLoading ? (
              <ActivityIndicator style={{ marginTop: 30 }} />
            ) : comments.length > 0 ? (
              comments.map((item) => (
                <CommentItem
                  key={item.id}
                  comment={item}
                  currentUser={currentUser}
                  onLike={toggleCommentLike}
                  onReply={setReplyTarget}
                  onDelete={deleteComment}
                  onOpenProfile={openCommentProfile}
                />
              ))
            ) : (
              <Text style={{ color: '#666', textAlign: 'center', marginTop: 30 }}>
                No comments yet
              </Text>
            )}
          </ScrollView>

          {replyTarget ? (
            <View
              style={{
                backgroundColor: '#f7f7f7',
                borderTopWidth: 1,
                borderTopColor: '#eee',
                paddingHorizontal: 12,
                paddingVertical: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Text style={{ color: '#555', flex: 1 }}>
                Replying to {getCommentAuthorName(replyTarget)}
              </Text>

              <TouchableOpacity onPress={() => setReplyTarget(null)}>
                <Ionicons name="close-circle" size={21} color="#777" />
              </TouchableOpacity>
            </View>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              padding: 12,
              borderTopWidth: 1,
              borderTopColor: '#eee',
            }}
          >
            <TextInput
              value={commentText}
              onChangeText={setCommentText}
              placeholder={replyTarget ? 'Write a reply...' : 'Write a comment...'}
              multiline
              style={{
                flex: 1,
                backgroundColor: '#f1f1f1',
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: 9,
                maxHeight: 100,
              }}
            />

            <TouchableOpacity onPress={addComment} style={{ padding: 10 }}>
              <Ionicons name="send" size={24} color="#1877F2" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <MediaViewer
        visible={mediaViewer.visible}
        media={mediaViewer.media}
        initialIndex={mediaViewer.index}
        onClose={closeMediaViewer}
      />

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-around',
          paddingVertical: 10,
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#eee',
        }}
      >
        <TouchableOpacity onPress={() => navigation.navigate('Home')}>
          <Ionicons name="home" size={25} color="#1877F2" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Chat')}>
          <View>
            <Ionicons name="chatbubble-outline" size={25} color="#111" />

            {messageUnreadCount > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: -7,
                  right: -10,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: '#ef4444',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 4,
                  borderWidth: 1,
                  borderColor: '#fff',
                }}
              >
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: '900',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {messageUnreadCount > 99 ? '99+' : messageUnreadCount}
                </Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Favorite')}>
          <Ionicons name="heart-outline" size={25} color="#111" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Notifications')}>
          <View>
            <Ionicons name="notifications-outline" size={25} color="#111" />

            {notificationUnreadCount > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: -7,
                  right: -10,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: '#ef4444',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 4,
                  borderWidth: 1,
                  borderColor: '#fff',
                }}
              >
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: '900',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {notificationUnreadCount > 99 ? '99+' : notificationUnreadCount}
                </Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Ionicons name="person-outline" size={25} color="#111" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}
