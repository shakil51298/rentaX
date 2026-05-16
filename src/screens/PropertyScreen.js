import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { VideoView, useVideoPlayer } from 'expo-video'
import { supabase } from '../lib/supabase'

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)

  if (!date || Number.isNaN(seconds)) return ''
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function isVideoUri(uri) {
  return /\.(mp4|mov|m4v|webm)$/i.test(uri || '')
}

function normalizeMediaItem(item) {
  if (typeof item === 'string') {
    return {
      uri: item,
      type: isVideoUri(item) ? 'video' : 'image',
    }
  }

  const uri = item?.uri || item?.url || item?.path

  if (!uri) return null

  return {
    ...item,
    uri,
    type: item?.type || item?.media_type || (isVideoUri(uri) ? 'video' : 'image'),
  }
}

function getPostMedia(post) {
  const media = Array.isArray(post?.media) ? post.media : []

  return media.map(normalizeMediaItem).filter(Boolean)
}

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
        resizeMode="contain"
        style={{
          width,
          height,
          transform: [{ scale }],
        }}
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
    // Expo can release video shared objects while closing the viewer.
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

function MediaViewer({ visible, media, initialIndex, onClose }) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const safeInitialIndex = Math.min(initialIndex, Math.max(media.length - 1, 0))

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
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>
            {media.length ? `${currentIndex + 1} / ${media.length}` : ''}
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

        {media.length > 0 ? (
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

function Avatar({ name, uri }) {
  const initial = name?.trim()?.charAt(0)?.toUpperCase() || 'O'

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#ddd' }}
      />
    )
  }

  return (
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
      <Text style={{ color: '#1d4ed8', fontWeight: '900' }}>{initial}</Text>
    </View>
  )
}

export default function PropertyScreen({ route, navigation }) {
  const initialProperty = route.params?.property || {}
  const [post, setPost] = useState(initialProperty)
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mediaViewer, setMediaViewer] = useState({
    visible: false,
    media: [],
    index: 0,
  })

  useEffect(() => {
    loadPost()
  }, [initialProperty?.id])

  async function loadPost() {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    setCurrentUser(user)

    if (!initialProperty?.id) {
      setPost(initialProperty)
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('properties')
      .select(`
        *,
        property_reactions(id, reaction, user_id),
        property_comments(id),
        property_favorites(id, user_id)
      `)
      .eq('id', initialProperty.id)
      .maybeSingle()

    const nextPost = data || initialProperty
    let ownerProfile = null

    if (nextPost.owner_id) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('user_id, email, display_name, avatar_url, is_verified, user_type')
        .eq('user_id', nextPost.owner_id)
        .maybeSingle()

      ownerProfile = profile || null
    }

    setPost({
      ...nextPost,
      owner_profile: ownerProfile,
    })
    setLoading(false)
  }

  async function toggleLike() {
    if (!currentUser || !post?.id) return

    const myReaction = post.property_reactions?.find(
      (item) => item.user_id === currentUser.id
    )

    if (myReaction) {
      const { error } = await supabase
        .from('property_reactions')
        .delete()
        .eq('property_id', post.id)
        .eq('user_id', currentUser.id)

      if (error) {
        Alert.alert('Error', error.message)
        return
      }

      setPost((oldPost) => ({
        ...oldPost,
        property_reactions: (oldPost.property_reactions || []).filter(
          (item) => item.user_id !== currentUser.id
        ),
      }))
      return
    }

    const { error } = await supabase.from('property_reactions').insert({
      property_id: post.id,
      user_id: currentUser.id,
      reaction: '👍',
    })

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    setPost((oldPost) => ({
      ...oldPost,
      property_reactions: [
        ...(oldPost.property_reactions || []),
        {
          id: `${post.id}-${currentUser.id}`,
          user_id: currentUser.id,
          reaction: '👍',
        },
      ],
    }))
  }

  async function toggleFavorite() {
    if (!currentUser || !post?.id) return

    const isFavorite = post.property_favorites?.some(
      (item) => item.user_id === currentUser.id
    )

    if (isFavorite) {
      const { error } = await supabase
        .from('property_favorites')
        .delete()
        .eq('property_id', post.id)
        .eq('user_id', currentUser.id)

      if (error) {
        Alert.alert('Error', error.message)
        return
      }

      setPost((oldPost) => ({
        ...oldPost,
        property_favorites: (oldPost.property_favorites || []).filter(
          (item) => item.user_id !== currentUser.id
        ),
      }))
      return
    }

    const { error } = await supabase.from('property_favorites').insert({
      property_id: post.id,
      user_id: currentUser.id,
    })

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    setPost((oldPost) => ({
      ...oldPost,
      property_favorites: [
        ...(oldPost.property_favorites || []),
        {
          id: `${post.id}-${currentUser.id}`,
          user_id: currentUser.id,
        },
      ],
    }))
  }

  async function sharePost() {
    await Share.share({
      message: `${post.title}\nRent: ৳ ${post.price}\nLocation: ${post.location || ''}`,
    })
  }

  function openMediaViewer(media, index) {
    setMediaViewer({
      visible: true,
      media,
      index,
    })
  }

  function closeMediaViewer() {
    setMediaViewer((current) => ({
      ...current,
      visible: false,
    }))
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f0f2f5', justifyContent: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    )
  }

  const media = getPostMedia(post)
  const ownerProfile = post.owner_profile || {}
  const ownerDisplayName =
    ownerProfile.display_name ||
    post.owner_name ||
    post.owner_email ||
    'Property Owner'
  const myReaction = post.property_reactions?.find(
    (item) => item.user_id === currentUser?.id
  )
  const isFavorite = post.property_favorites?.some(
    (item) => item.user_id === currentUser?.id
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View style={{ backgroundColor: '#fff', paddingTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }}>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('OwnerProfile', {
                  owner: {
                    id: post.owner_id,
                    email: ownerProfile.email || post.owner_email,
                    name: ownerDisplayName,
                  },
                })
              }
              activeOpacity={0.82}
              style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
            >
              <Avatar name={ownerDisplayName} uri={ownerProfile.avatar_url} />

              <View style={{ marginLeft: 10, flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>
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

                <Text style={{ color: '#777', fontSize: 12 }}>
                  {timeAgo(post.created_at)}
                </Text>
              </View>
            </TouchableOpacity>

            <Ionicons name="ellipsis-horizontal" size={22} color="#555" />
          </View>

          <Text style={{ paddingHorizontal: 14, marginTop: 10, fontSize: 15, lineHeight: 21 }}>
            {post.title}
            {'\n'}
            {post.description || 'No description added'}
            {'\n\n'}Rent: ৳ {post.price}
            {'\n'}Location: {post.location || 'Location not added'}
          </Text>

          {media.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, paddingHorizontal: 8 }}>
              {media.slice(0, 4).map((mediaItem, index) => (
                <TouchableOpacity
                  key={`${mediaItem.uri}-${index}`}
                  onPress={() => openMediaViewer(media, index)}
                  activeOpacity={0.9}
                  style={{ width: '50%', padding: 3 }}
                >
                  {mediaItem.type === 'video' ? (
                    <View
                      style={{
                        height: 150,
                        backgroundColor: '#111',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="play-circle" size={42} color="#fff" />
                    </View>
                  ) : (
                    <Image
                      source={{ uri: mediaItem.uri }}
                      style={{ width: '100%', height: 150, backgroundColor: '#eee' }}
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
                      <Text style={{ color: '#fff', fontSize: 24, fontWeight: '900' }}>
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
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: '#666' }}>
              {post.property_reactions?.length ? `👍 ${post.property_reactions.length}` : ''}
            </Text>

            <Text style={{ color: '#666' }}>
              👁 {post.view_count || 0} · 💬 {post.property_comments?.length || 0} · ❤️ {post.property_favorites?.length || 0}
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
              onPress={toggleLike}
              style={{ flex: 1, paddingVertical: 13, alignItems: 'center' }}
            >
              <Ionicons
                name={myReaction ? 'thumbs-up' : 'thumbs-up-outline'}
                size={22}
                color={myReaction ? '#1877F2' : '#555'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                navigation.navigate('Home', {
                  openCommentsForPostId: String(post.id),
                  openCommentsForPost: post,
                  openCommentsRequestId: `property-${post.id}-${Date.now()}`,
                })
              }
              style={{ flex: 1, paddingVertical: 13, alignItems: 'center' }}
            >
              <Ionicons name="chatbubble-outline" size={22} color="#555" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={toggleFavorite}
              style={{ flex: 1, paddingVertical: 13, alignItems: 'center' }}
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={23}
                color={isFavorite ? 'red' : '#555'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={sharePost}
              style={{ flex: 1, paddingVertical: 13, alignItems: 'center' }}
            >
              <Ionicons name="share-social-outline" size={22} color="#555" />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => navigation.navigate('Chat', { property: post })}
          style={{
            margin: 14,
            backgroundColor: '#111827',
            borderRadius: 12,
            paddingVertical: 13,
            alignItems: 'center',
            flexDirection: 'row',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={19} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '900', marginLeft: 8 }}>
            Message Owner
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <MediaViewer
        visible={mediaViewer.visible}
        media={mediaViewer.media}
        initialIndex={mediaViewer.index}
        onClose={closeMediaViewer}
      />
    </SafeAreaView>
  )
}
