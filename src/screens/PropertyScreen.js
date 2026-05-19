import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  TextInput,
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
import { fetchPropertyViewCount, recordPropertyView } from '../lib/propertyViews'
import { getOwnerVerificationStatus, getPropertyVerificationStatus } from '../lib/verification'
import { blockUser } from '../lib/social'
import ActionSheetModal from '../components/common/ActionSheetModal'
import { saveMediaToLibrary } from '../lib/mediaSave'
import { createNotification } from '../lib/notifications'
import {
  buildVisitTimestamp,
  cancelVisitRequest,
  fetchVisitRequestForProperty,
  formatVisitDateTime,
  getVisitStatusMeta,
  saveVisitRequest,
  splitVisitTimestamp,
} from '../lib/visitScheduling'

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

function getPropertyMetaChips(post) {
  const chips = []

  if (Number(post?.beds || 0) > 0) {
    chips.push(`${post.beds} bedroom${Number(post.beds) === 1 ? '' : 's'}`)
  }

  if (Number(post?.baths || 0) > 0) {
    chips.push(`${post.baths} bathroom${Number(post.baths) === 1 ? '' : 's'}`)
  }

  if (post?.furnishing_status === 'furnished') {
    chips.push('Furnished')
  } else if (post?.furnishing_status === 'unfurnished') {
    chips.push('Unfurnished')
  }

  if (post?.pet_friendly) {
    chips.push('Pet friendly')
  }

  return chips
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
  const [saving, setSaving] = useState(false)
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

  async function saveCurrentMedia() {
    const currentItem = media[currentIndex]

    if (!currentItem?.uri || saving) return

    try {
      setSaving(true)
      await saveMediaToLibrary({
        uri: currentItem.uri,
        type: currentItem.type || 'image',
      })
      Alert.alert('Saved', `${currentItem.type === 'video' ? 'Video' : 'Photo'} saved to your device.`)
    } catch (error) {
      Alert.alert('Save failed', error?.message || 'Could not save this media right now.')
    } finally {
      setSaving(false)
    }
  }

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

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Pressable
              onPress={saveCurrentMedia}
              disabled={!media.length || saving}
              hitSlop={12}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: 'rgba(255,255,255,0.16)',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 8,
                opacity: !media.length || saving ? 0.5 : 1,
              }}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="download-outline" size={22} color="#fff" />
              )}
            </Pressable>

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
  const [visitRequest, setVisitRequest] = useState(null)
  const [visitModalVisible, setVisitModalVisible] = useState(false)
  const [visitDate, setVisitDate] = useState('')
  const [visitTime, setVisitTime] = useState('')
  const [visitNote, setVisitNote] = useState('')
  const [visitSaving, setVisitSaving] = useState(false)
  const [mediaViewer, setMediaViewer] = useState({
    visible: false,
    media: [],
    index: 0,
  })
  const [actionSheetVisible, setActionSheetVisible] = useState(false)

  useEffect(() => {
    loadPost()
  }, [initialProperty?.id])

  useEffect(() => {
    if (!initialProperty?.id) return undefined

    const channel = supabase
      .channel(`property-views-${initialProperty.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'property_views',
          filter: `property_id=eq.${String(initialProperty.id)}`,
        },
        async () => {
          const latestViewCount = await fetchPropertyViewCount(initialProperty.id)
          setPost((currentPost) => ({
            ...currentPost,
            view_count: latestViewCount,
          }))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [initialProperty?.id])

  useEffect(() => {
    if (!post?.id || !currentUser?.id || String(post.owner_id) === String(currentUser.id)) {
      return undefined
    }

    const channel = supabase
      .channel(`property-visit-request-${post.id}-${currentUser.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'property_visit_requests',
          filter: `property_id=eq.${String(post.id)}`,
        },
        async () => {
          try {
            const nextRequest = await fetchVisitRequestForProperty({
              propertyId: post.id,
              requesterId: currentUser.id,
            })
            setVisitRequest(nextRequest)
          } catch {
            // keep current state quiet if the table is not ready yet
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUser?.id, post?.id, post?.owner_id])

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
        .select('user_id, email, display_name, avatar_url, is_verified, owner_verification_status, user_type')
        .eq('user_id', nextPost.owner_id)
        .maybeSingle()

      ownerProfile = profile || null
    }

    let viewCount = nextPost.view_count || 0
    let nextVisitRequest = null

    if (nextPost.id) {
      const viewResult = await recordPropertyView({
        propertyId: nextPost.id,
        userId: user?.id,
        ownerId: nextPost.owner_id,
      })

      if (viewResult.viewCount) {
        viewCount = viewResult.viewCount
      } else {
        viewCount = await fetchPropertyViewCount(nextPost.id)
      }
    }

    if (user?.id && nextPost.id && String(nextPost.owner_id) !== String(user.id)) {
      try {
        nextVisitRequest = await fetchVisitRequestForProperty({
          propertyId: nextPost.id,
          requesterId: user.id,
        })
      } catch {
        nextVisitRequest = null
      }
    }

    setPost({
      ...nextPost,
      view_count: viewCount,
      owner_profile: ownerProfile,
    })
    setVisitRequest(nextVisitRequest)
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

  async function blockOwner() {
    if (!currentUser?.id || !post?.owner_id) return

    const { error } = await blockUser(currentUser.id, post.owner_id)

    if (error) {
      Alert.alert('Block failed', error.message)
      return
    }

    Alert.alert(
      'Blocked',
      'This user was blocked and their posts will be hidden from your feed.',
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    )
  }

  function openMoreActions() {
    setActionSheetVisible(true)
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

  function openVisitModal() {
    const { dateText, timeText } = splitVisitTimestamp(
      visitRequest?.status === 'rescheduled'
        ? visitRequest?.owner_proposed_for
        : visitRequest?.requested_for
    )

    setVisitDate(dateText)
    setVisitTime(timeText)
    setVisitNote(visitRequest?.request_message || '')
    setVisitModalVisible(true)
  }

  function closeVisitModal() {
    setVisitModalVisible(false)
  }

  async function submitVisitRequest() {
    if (!currentUser?.id || !post?.id || !post?.owner_id) return

    let requestedFor = null

    try {
      requestedFor = buildVisitTimestamp(visitDate, visitTime)
    } catch (error) {
      Alert.alert('Invalid visit time', error.message)
      return
    }

    try {
      setVisitSaving(true)
      const savedRequest = await saveVisitRequest({
        property: post,
        requesterId: currentUser.id,
        requestedFor,
        requestMessage: visitNote,
      })

      setVisitRequest(savedRequest)
      setVisitModalVisible(false)

      const requesterName =
        currentUser?.user_metadata?.name
        || currentUser?.user_metadata?.full_name
        || currentUser?.email?.split('@')?.[0]
        || 'A renter'

      await createNotification({
        recipientId: post.owner_id,
        actorId: currentUser.id,
        type: 'visit_request_created',
        propertyId: post.id,
        title: 'New visit request',
        body: `${requesterName} requested a visit for ${formatVisitDateTime(requestedFor)}.`,
        eventKey: `visit_request_created:${post.id}:${currentUser.id}:${savedRequest.updated_at}`,
        pushTitle: 'New visit request',
        pushBody: `${requesterName} requested a visit for ${post.title || 'your property'}.`,
        pushData: {
          propertyTitle: post.title || '',
          visitRequestId: savedRequest.id,
        },
      })

      Alert.alert('Visit requested', 'Your request was sent to the property owner.')
    } catch (error) {
      Alert.alert(
        'Visit scheduling setup needed',
        error?.message || 'Run supabase-visit-scheduling-features.sql in Supabase, then try again.'
      )
    } finally {
      setVisitSaving(false)
    }
  }

  async function cancelCurrentVisitRequest() {
    if (!visitRequest?.id || !currentUser?.id) return

    try {
      setVisitSaving(true)
      const cancelledRequest = await cancelVisitRequest(visitRequest.id)
      setVisitRequest(cancelledRequest)

      await createNotification({
        recipientId: post.owner_id,
        actorId: currentUser.id,
        type: 'visit_request_cancelled',
        propertyId: post.id,
        title: 'Visit request cancelled',
        body: `A renter cancelled a visit request for ${post.title || 'your property'}.`,
        eventKey: `visit_request_cancelled:${cancelledRequest.id}:${cancelledRequest.updated_at}`,
        pushTitle: 'Visit request cancelled',
        pushBody: `A renter cancelled a visit request for ${post.title || 'your property'}.`,
        pushData: {
          propertyTitle: post.title || '',
          visitRequestId: cancelledRequest.id,
        },
      })
    } catch (error) {
      Alert.alert('Cancel failed', error?.message || 'Could not cancel this visit request.')
    } finally {
      setVisitSaving(false)
    }
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
  const isVerifiedOwner = getOwnerVerificationStatus(ownerProfile) === 'verified'
  const isVerifiedProperty = getPropertyVerificationStatus(post) === 'verified'
  const isOwnProperty = String(post.owner_id) === String(currentUser?.id)
  const visitStatusMeta = visitRequest ? getVisitStatusMeta(visitRequest.status) : null
  const propertyMetaChips = getPropertyMetaChips(post)

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

                  {isVerifiedOwner ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="#1877F2"
                      style={{ marginLeft: 4 }}
                    />
                  ) : null}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 3 }}>
                  <Text style={{ color: '#777', fontSize: 12 }}>
                    {timeAgo(post.created_at)}
                  </Text>

                  {isVerifiedProperty ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#eff6ff',
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        marginLeft: 8,
                      }}
                    >
                      <Ionicons name="checkmark-circle" size={12} color="#2563eb" />
                      <Text style={{ color: '#2563eb', fontSize: 11, fontWeight: '800', marginLeft: 4 }}>
                        Verified property
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={openMoreActions} hitSlop={10}>
              <Ionicons name="ellipsis-horizontal" size={22} color="#555" />
            </TouchableOpacity>
          </View>

          <Text style={{ paddingHorizontal: 14, marginTop: 10, fontSize: 15, lineHeight: 21 }}>
            {post.title}
            {'\n'}
            {post.description || 'No description added'}
            {'\n\n'}Rent: ৳ {post.price}
            {'\n'}Location: {post.location || 'Location not added'}
          </Text>

          {propertyMetaChips.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, marginTop: 12 }}>
              {propertyMetaChips.map((chip) => (
                <View
                  key={chip}
                  style={{
                    backgroundColor: '#f8fafc',
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: '#475569', fontSize: 11, fontWeight: '800' }}>{chip}</Text>
                </View>
              ))}
            </View>
          ) : null}

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
                navigation.navigate('MainTabs', {
                  screen: 'Home',
                  params: {
                    openCommentsForPostId: String(post.id),
                    openCommentsForPost: post,
                    openCommentsRequestId: `property-${post.id}-${Date.now()}`,
                  },
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

        {!isOwnProperty ? (
          <View style={{ margin: 14 }}>
            {visitRequest ? (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  padding: 14,
                  marginBottom: 12,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 15 }}>
                    Visit request
                  </Text>

                  <View
                    style={{
                      backgroundColor: visitStatusMeta.backgroundColor,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 999,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <Ionicons name={visitStatusMeta.icon} size={12} color={visitStatusMeta.color} />
                    <Text style={{ color: visitStatusMeta.color, fontWeight: '900', fontSize: 11, marginLeft: 5 }}>
                      {visitStatusMeta.label}
                    </Text>
                  </View>
                </View>

                <Text style={{ color: '#334155', marginTop: 10, lineHeight: 20 }}>
                  Preferred time: {formatVisitDateTime(visitRequest.requested_for)}
                </Text>

                {visitRequest.owner_proposed_for ? (
                  <Text style={{ color: '#334155', marginTop: 6, lineHeight: 20 }}>
                    Owner time: {formatVisitDateTime(visitRequest.owner_proposed_for)}
                  </Text>
                ) : null}

                {visitRequest.owner_response_note ? (
                  <Text style={{ color: '#475569', marginTop: 6, lineHeight: 20 }}>
                    Response: {visitRequest.owner_response_note}
                  </Text>
                ) : null}
              </View>
            ) : null}

            <TouchableOpacity
              onPress={openVisitModal}
              disabled={visitSaving}
              style={{
                backgroundColor: '#1877F2',
                borderRadius: 12,
                paddingVertical: 13,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                opacity: visitSaving ? 0.6 : 1,
              }}
            >
              <Ionicons name="calendar-outline" size={19} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '900', marginLeft: 8 }}>
                {visitRequest && !['cancelled', 'rejected'].includes(visitRequest.status)
                  ? 'Update Visit Request'
                  : 'Schedule Visit'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                navigation.navigate('MainTabs', {
                  screen: 'Chat',
                  params: { property: post },
                })
              }
              style={{
                marginTop: 10,
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

            {visitRequest && ['pending', 'accepted', 'rescheduled'].includes(visitRequest.status) ? (
              <TouchableOpacity
                onPress={cancelCurrentVisitRequest}
                disabled={visitSaving}
                style={{
                  marginTop: 10,
                  alignSelf: 'center',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                }}
              >
                <Text style={{ color: '#b91c1c', fontWeight: '800' }}>
                  Cancel visit request
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <MediaViewer
        visible={mediaViewer.visible}
        media={mediaViewer.media}
        initialIndex={mediaViewer.index}
        onClose={closeMediaViewer}
      />

      <ActionSheetModal
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        title="Post actions"
        subtitle="Choose what you want to do here."
        actions={[
          {
            icon: 'share-social-outline',
            title: 'Share post',
            subtitle: 'Send this listing to someone else.',
            onPress: () => {
              setActionSheetVisible(false)
              sharePost()
            },
          },
          ...(String(post.owner_id) === String(currentUser?.id)
            ? []
            : [
                {
                  icon: 'flag-outline',
                  title: 'Report post',
                  subtitle: 'Report scam, spam, or fake listing details.',
                  onPress: () => {
                    setActionSheetVisible(false)
                    navigation.navigate('ReportIssue', {
                      kind: 'property',
                      property: post,
                      owner: {
                        id: post.owner_id,
                        name: ownerDisplayName,
                      },
                    })
                  },
                },
                {
                  icon: 'person-outline',
                  title: 'Report user',
                  subtitle: 'Report this owner account to admin review.',
                  onPress: () => {
                    setActionSheetVisible(false)
                    navigation.navigate('ReportIssue', {
                      kind: 'user',
                      owner: {
                        id: post.owner_id,
                        name: ownerDisplayName,
                      },
                    })
                  },
                },
                {
                  icon: 'ban-outline',
                  title: 'Block user',
                  subtitle: 'Hide this user and remove their posts from your feed.',
                  danger: true,
                  onPress: () => {
                    setActionSheetVisible(false)
                    blockOwner()
                  },
                },
              ])
        ]}
      />

      <Modal
        visible={visitModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeVisitModal}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15,23,42,0.46)',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <TouchableOpacity style={{ position: 'absolute', inset: 0 }} activeOpacity={1} onPress={closeVisitModal} />

          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 20,
              padding: 18,
              borderWidth: 1,
              borderColor: '#e2e8f0',
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '900', fontSize: 18 }}>
              Schedule a visit
            </Text>
            <Text style={{ color: '#64748b', marginTop: 4, lineHeight: 19 }}>
              Ask the owner for a visit time. They can accept it, reject it, or propose a better time.
            </Text>

            <View style={{ marginTop: 14 }}>
              <Text style={{ color: '#475569', fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
                Preferred date
              </Text>
              <TextInput
                value={visitDate}
                onChangeText={setVisitDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94a3b8"
                style={{
                  backgroundColor: '#f8fafc',
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 14,
                  paddingHorizontal: 13,
                  paddingVertical: 12,
                  color: '#0f172a',
                }}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: '#475569', fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
                Preferred time
              </Text>
              <TextInput
                value={visitTime}
                onChangeText={setVisitTime}
                placeholder="HH:MM"
                placeholderTextColor="#94a3b8"
                style={{
                  backgroundColor: '#f8fafc',
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 14,
                  paddingHorizontal: 13,
                  paddingVertical: 12,
                  color: '#0f172a',
                }}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={{ color: '#475569', fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
                Note for the owner
              </Text>
              <TextInput
                value={visitNote}
                onChangeText={setVisitNote}
                placeholder="Anything the owner should know before the visit?"
                placeholderTextColor="#94a3b8"
                multiline
                style={{
                  minHeight: 90,
                  backgroundColor: '#f8fafc',
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 14,
                  paddingHorizontal: 13,
                  paddingVertical: 12,
                  color: '#0f172a',
                  textAlignVertical: 'top',
                }}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity
                onPress={closeVisitModal}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 14,
                  backgroundColor: '#e2e8f0',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#334155', fontWeight: '900' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={submitVisitRequest}
                disabled={visitSaving}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 14,
                  backgroundColor: '#1877F2',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: visitSaving ? 0.6 : 1,
                }}
              >
                {visitSaving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '900' }}>Send Request</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
