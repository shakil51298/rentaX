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
import { getCachedAuthUser } from '../lib/authSession'
import { fetchPropertyViewCount, recordPropertyView } from '../lib/propertyViews'
import { getOwnerVerificationStatus, getPropertyVerificationStatus } from '../lib/verification'
import { blockUser } from '../lib/social'
import ActionSheetModal from '../components/common/ActionSheetModal'
import { saveMediaToLibrary } from '../lib/mediaSave'
import { createNotification } from '../lib/notifications'
import { applyLessLikeThis, hideOwnerFromFeed, hidePropertyFromFeed } from '../lib/feedControls'
import {
  fetchOwnerResponseQuality,
  getEmptyOwnerResponseQuality,
} from '../lib/ownerResponseQuality'
import { getAvailabilityFreshnessMeta, isUrgentProperty } from '../lib/propertyLifecycle'
import {
  addComparedProperty,
  loadComparedProperties,
  rememberRecentlyViewedProperty,
  removeComparedProperty,
} from '../lib/propertyBrowse'
import {
  buildVisitTimestamp,
  cancelVisitRequest,
  fetchVisitRequestForProperty,
  formatVisitDateTime,
  getVisitStatusMeta,
  saveVisitRequest,
  splitVisitTimestamp,
} from '../lib/visitScheduling'
import { useAppSettings } from '../lib/appSettings'
import { PAYMENT_SAFETY_WARNING, getListingSafetySummary } from '../lib/scamProtection'

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)

  if (!date || Number.isNaN(seconds)) return ''
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

const VISIT_CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const VISIT_CALENDAR_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function formatDateValue(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseDateValue(value) {
  if (!value) return null

  const parts = String(value).split('-').map((part) => Number(part))

  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null

  const [year, month, day] = parts
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null
  }

  return date
}

function buildCalendarDays(monthDate) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1)
  const firstWeekday = firstDay.getDay()
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate()
  const cells = []

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(null)
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day))
  }

  while (cells.length % 7 !== 0) {
    cells.push(null)
  }

  return cells
}

function VisitCalendarPicker({ value, onSelect, theme }) {
  const initialDate = parseDateValue(value) || new Date()
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
  )
  const selectedDate = parseDateValue(value)
  const calendarDays = buildCalendarDays(visibleMonth)
  const todayKey = formatDateValue(new Date())

  useEffect(() => {
    const nextDate = parseDateValue(value) || new Date()
    setVisibleMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1))
  }, [value])

  function moveMonth(offset) {
    setVisibleMonth((currentMonth) => (
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1)
    ))
  }

  return (
    <View
      style={{
        backgroundColor: theme.surfaceMuted,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 16,
        padding: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <TouchableOpacity
          onPress={() => moveMonth(-1)}
          activeOpacity={0.86}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="chevron-back" size={18} color={theme.accent} />
        </TouchableOpacity>

        <Text style={{ color: theme.text, fontSize: 14, fontWeight: '900' }}>
          {VISIT_CALENDAR_MONTHS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
        </Text>

        <TouchableOpacity
          onPress={() => moveMonth(1)}
          activeOpacity={0.86}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: theme.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="chevron-forward" size={18} color={theme.accent} />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', marginTop: 14 }}>
        {VISIT_CALENDAR_WEEKDAYS.map((day) => (
          <View key={day} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: theme.mutedText, fontSize: 10, fontWeight: '900' }}>
              {day}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ marginTop: 9, gap: 7 }}>
        {Array.from({ length: calendarDays.length / 7 }).map((_, rowIndex) => (
          <View key={`visit-calendar-row-${rowIndex}`} style={{ flexDirection: 'row' }}>
            {calendarDays.slice(rowIndex * 7, rowIndex * 7 + 7).map((date, columnIndex) => {
              const dateKey = date ? formatDateValue(date) : `blank-${rowIndex}-${columnIndex}`
              const isSelected = date && selectedDate && dateKey === formatDateValue(selectedDate)
              const isToday = dateKey === todayKey

              return (
                <View key={dateKey} style={{ flex: 1, alignItems: 'center' }}>
                  {date ? (
                    <TouchableOpacity
                      onPress={() => onSelect(dateKey)}
                      activeOpacity={0.88}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected ? theme.accent : isToday ? theme.accentSoft : 'transparent',
                        borderWidth: isToday && !isSelected ? 1 : 0,
                        borderColor: isToday ? theme.accent : 'transparent',
                      }}
                    >
                      <Text
                        style={{
                          color: isSelected ? '#fff' : theme.text,
                          fontSize: 12,
                          fontWeight: isSelected ? '900' : '700',
                        }}
                      >
                        {date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ width: 34, height: 34 }} />
                  )}
                </View>
              )
            })}
          </View>
        ))}
      </View>
    </View>
  )
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

  if (Number(post?.size_sqft || 0) > 0) {
    chips.push(`${post.size_sqft} sq ft`)
  }

  if (post?.tenant_type === 'family') {
    chips.push('Family')
  } else if (post?.tenant_type === 'bachelor') {
    chips.push('Bachelor')
  } else if (post?.tenant_type === 'any') {
    chips.push('Family / Bachelor')
  }

  if (post?.has_balcony) {
    chips.push('Balcony')
  }

  return chips
}

function getBooleanLabel(value) {
  return value ? 'Yes' : 'No'
}

function formatTenantType(value) {
  if (value === 'family') return 'Family'
  if (value === 'bachelor') return 'Bachelor'
  if (value === 'any') return 'Family / Bachelor'
  return 'Not specified'
}

function getPropertyDetailRows(post, availabilityLabel) {
  return [
    { label: 'Monthly rent', value: post?.price ? `৳ ${post.price}` : 'Not added' },
    { label: 'Location', value: post?.location || 'Not added' },
    { label: 'Bedrooms', value: post?.beds ? String(post.beds) : 'Not added' },
    { label: 'Bathrooms', value: post?.baths ? String(post.baths) : 'Not added' },
    { label: 'Size', value: post?.size_sqft ? `${post.size_sqft} sq ft` : 'Not added' },
    { label: 'Furnishing', value: post?.furnishing_status === 'furnished' ? 'Furnished' : post?.furnishing_status === 'unfurnished' ? 'Unfurnished' : 'Not specified' },
    { label: 'Preferred tenant', value: formatTenantType(post?.tenant_type) },
    { label: 'Parking', value: getBooleanLabel(post?.parking) },
    { label: 'Lift', value: getBooleanLabel(post?.lift_available) },
    { label: 'Generator', value: getBooleanLabel(post?.generator_backup) },
    { label: 'Gas', value: getBooleanLabel(post?.gas_available) },
    { label: 'Pet friendly', value: getBooleanLabel(post?.pet_friendly) },
    { label: 'Available from', value: post?.available_from || 'Not added' },
    { label: 'Availability verified', value: availabilityLabel || 'Needs owner confirmation' },
    { label: 'Floor', value: post?.floor_no ? String(post.floor_no) : 'Not added' },
    { label: 'Facing', value: post?.facing_direction || 'Not added' },
    { label: 'Balcony', value: getBooleanLabel(post?.has_balcony) },
    { label: 'Service charge', value: post?.service_charge_included ? 'Included' : 'Separate / not included' },
  ]
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

export default function PropertyScreen({ route, navigation, guestMode = false }) {
  const { theme } = useAppSettings()
  const initialProperty = route.params?.property || {}
  const [post, setPost] = useState(initialProperty)
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(!initialProperty?.id)
  const [visitRequest, setVisitRequest] = useState(null)
  const [visitModalVisible, setVisitModalVisible] = useState(false)
  const [visitDate, setVisitDate] = useState('')
  const [visitTime, setVisitTime] = useState('')
  const [visitNote, setVisitNote] = useState('')
  const [visitSaving, setVisitSaving] = useState(false)
  const [ownerResponseQuality, setOwnerResponseQuality] = useState(getEmptyOwnerResponseQuality())
  const [ownerActiveListingsCount, setOwnerActiveListingsCount] = useState(0)
  const [mediaViewer, setMediaViewer] = useState({
    visible: false,
    media: [],
    index: 0,
  })
  const [actionSheetVisible, setActionSheetVisible] = useState(false)
  const [comparedProperties, setComparedProperties] = useState([])

  function promptGuestLogin(feature = 'this feature') {
    Alert.alert(
      'Login required',
      `Please login or register to use ${feature}.`,
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Login',
          onPress: () => navigation.navigate('Login'),
        },
      ]
    )
  }

  useEffect(() => {
    loadPost()
  }, [initialProperty?.id])

  useEffect(() => {
    let isMounted = true

    async function hydrateCompareState() {
      const user = await getCachedAuthUser()
      const storageUserId = user?.id || user?.email || 'guest'
      const nextItems = await loadComparedProperties(storageUserId)

      if (isMounted) {
        setComparedProperties(nextItems)
      }
    }

    hydrateCompareState()

    return () => {
      isMounted = false
    }
  }, [])

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
    if (!initialProperty?.id) {
      setLoading(true)
    }

    const user = await getCachedAuthUser()

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
    const shouldRecordView =
      nextPost.id
      && user?.id
      && String(nextPost.owner_id) !== String(user.id)
    const [
      ownerProfileResponse,
      activeListingsResponse,
      nextOwnerResponseQuality,
      viewResult,
      nextVisitRequest,
    ] = await Promise.all([
      nextPost.owner_id
        ? supabase
            .from('user_profiles')
            .select('user_id, email, display_name, avatar_url, is_verified, owner_verification_status, user_type')
            .eq('user_id', nextPost.owner_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      nextPost.owner_id
        ? supabase
            .from('properties')
            .select('id', { count: 'exact', head: true })
            .eq('owner_id', nextPost.owner_id)
            .eq('status', 'open')
            .or('admin_is_banned.is.null,admin_is_banned.eq.false')
        : Promise.resolve({ count: 0 }),
      nextPost.owner_id
        ? fetchOwnerResponseQuality(nextPost.owner_id).catch(() =>
            getEmptyOwnerResponseQuality()
          )
        : Promise.resolve(getEmptyOwnerResponseQuality()),
      shouldRecordView
        ? recordPropertyView({
            propertyId: nextPost.id,
            userId: user.id,
            ownerId: nextPost.owner_id,
          })
        : Promise.resolve({ viewCount: nextPost.view_count || 0 }),
      shouldRecordView
        ? fetchVisitRequestForProperty({
            propertyId: nextPost.id,
            requesterId: user.id,
          }).catch(() => null)
        : Promise.resolve(null),
    ])
    const ownerProfile = ownerProfileResponse.data || null
    const activeListingsCount = activeListingsResponse.count || 0
    const viewCount = viewResult?.viewCount ?? nextPost.view_count ?? 0

    setPost({
      ...nextPost,
      view_count: viewCount,
      owner_profile: ownerProfile,
    })
    setOwnerResponseQuality(nextOwnerResponseQuality)
    setOwnerActiveListingsCount(activeListingsCount || 0)
    rememberRecentlyViewedProperty(user?.id || user?.email || 'guest', {
      ...nextPost,
      owner_profile: ownerProfile,
    }).catch(() => null)
    setVisitRequest(nextVisitRequest)
    setLoading(false)
  }

  async function toggleLike() {
    if (guestMode || !currentUser || !post?.id) {
      promptGuestLogin('likes')
      return
    }

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
    if (guestMode || !currentUser || !post?.id) {
      promptGuestLogin('favorites')
      return
    }

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
    if (guestMode) {
      promptGuestLogin('sharing')
      return
    }

    await Share.share({
      message: `${post.title}\nRent: ৳ ${post.price}\nLocation: ${post.location || ''}`,
    })
  }

  async function blockOwner() {
    if (guestMode || !currentUser?.id || !post?.owner_id) {
      promptGuestLogin('blocking users')
      return
    }

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

  async function hideCurrentPost(reason, successTitle, successBody) {
    if (guestMode || !currentUser?.id || !post?.id) {
      promptGuestLogin('feed controls')
      return
    }

    try {
      await hidePropertyFromFeed({
        userId: currentUser.id,
        propertyId: post.id,
        reason,
      })

      Alert.alert(successTitle, successBody, [{ text: 'OK', onPress: () => navigation.goBack() }])
    } catch (error) {
      Alert.alert('Could not update feed', error?.message || 'Please try again.')
    }
  }

  async function hideCurrentOwner() {
    if (guestMode || !currentUser?.id || !post?.owner_id) {
      promptGuestLogin('feed controls')
      return
    }

    try {
      await hideOwnerFromFeed({
        userId: currentUser.id,
        ownerId: post.owner_id,
        reason: 'hide_owner',
      })

      Alert.alert(
        'Owner hidden',
        'You will not see posts from this owner in your feed anymore.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      )
    } catch (error) {
      Alert.alert('Could not update feed', error?.message || 'Please try again.')
    }
  }

  async function showLessLikeCurrentPost() {
    if (guestMode || !currentUser?.id || !post?.id) {
      promptGuestLogin('feed controls')
      return
    }

    try {
      await hidePropertyFromFeed({
        userId: currentUser.id,
        propertyId: post.id,
        reason: 'less_like_this',
      })
      await applyLessLikeThis({
        userId: currentUser.id,
        post,
      })

      Alert.alert(
        'Feed updated',
        'We will show fewer posts like this from now on.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      )
    } catch (error) {
      Alert.alert('Could not update feed', error?.message || 'Please try again.')
    }
  }

  async function toggleCompareCurrentPost() {
    if (guestMode) {
      promptGuestLogin('compare')
      return
    }

    const storageUserId = currentUser?.id || currentUser?.email || 'guest'
    const exists = comparedProperties.some((item) => String(item.id) === String(post?.id))

    if (exists) {
      const nextItems = await removeComparedProperty(storageUserId, post.id)
      setComparedProperties(nextItems)
      Alert.alert('Removed', 'This property was removed from compare.')
      return
    }

    const result = await addComparedProperty(storageUserId, post)

    if (result.reason === 'limit') {
      Alert.alert('Compare is full', 'You can compare up to 5 properties at a time.')
      return
    }

    setComparedProperties(result.items)
    Alert.alert('Added to compare', 'Open Compare to see this rental side by side.')
  }

  function openMoreActions() {
    if (guestMode) {
      promptGuestLogin('post actions')
      return
    }

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
    if (guestMode) {
      promptGuestLogin('visit scheduling')
      return
    }

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
    if (guestMode || !currentUser?.id || !post?.id || !post?.owner_id) {
      promptGuestLogin('visit scheduling')
      return
    }

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
    if (guestMode || !visitRequest?.id || !currentUser?.id) {
      promptGuestLogin('visit scheduling')
      return
    }

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
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} />
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
  const isCompared = comparedProperties.some((item) => String(item.id) === String(post?.id))
  const visitStatusMeta = visitRequest ? getVisitStatusMeta(visitRequest.status) : null
  const propertyMetaChips = getPropertyMetaChips(post)
  const freshnessMeta = getAvailabilityFreshnessMeta(post)
  const propertyDetailRows = getPropertyDetailRows(post, freshnessMeta?.label)
  const safetySummary = getListingSafetySummary(post, ownerProfile)
  const ownerResponseRateLabel =
    ownerResponseQuality.responseRate == null
      ? 'New owner'
      : `${ownerResponseQuality.responseRate}% response`

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View style={{ backgroundColor: theme.surface, paddingTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }}>
            <TouchableOpacity
              onPress={() => {
                if (guestMode) {
                  promptGuestLogin('public profiles')
                  return
                }

                navigation.navigate('OwnerProfile', {
                  owner: {
                    id: post.owner_id,
                    email: ownerProfile.email || post.owner_email,
                    name: ownerDisplayName,
                  },
                })
              }}
              activeOpacity={0.82}
              style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
            >
              <Avatar name={ownerDisplayName} uri={ownerProfile.avatar_url} />

              <View style={{ marginLeft: 10, flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text }}>
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
                  <Text style={{ color: theme.mutedText, fontSize: 12 }}>
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

                  {isUrgentProperty(post) ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#fff7ed',
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        marginLeft: 8,
                      }}
                    >
                      <Ionicons name="flash" size={12} color="#ea580c" />
                      <Text style={{ color: '#ea580c', fontSize: 11, fontWeight: '800', marginLeft: 4 }}>
                        Urgent
                      </Text>
                    </View>
                  ) : null}

                  {freshnessMeta ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: freshnessMeta.backgroundColor,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: freshnessMeta.borderColor,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        marginLeft: 8,
                      }}
                    >
                      <Ionicons name={freshnessMeta.icon} size={12} color={freshnessMeta.color} />
                      <Text style={{ color: freshnessMeta.color, fontSize: 11, fontWeight: '800', marginLeft: 4 }}>
                        {freshnessMeta.compactLabel}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  <View
                    style={{
                      backgroundColor: theme.surfaceMuted,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: theme.border,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ color: theme.text, fontSize: 10, fontWeight: '900' }}>
                      {ownerResponseRateLabel}
                    </Text>
                  </View>

                  <View
                    style={{
                      backgroundColor: theme.surfaceMuted,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: theme.border,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ color: theme.text, fontSize: 10, fontWeight: '900' }}>
                      {ownerResponseQuality.usuallyRepliesLabel}
                    </Text>
                  </View>

                  <View
                    style={{
                      backgroundColor: theme.surfaceMuted,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: theme.border,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                    }}
                  >
                    <Text style={{ color: theme.text, fontSize: 10, fontWeight: '900' }}>
                      {ownerActiveListingsCount} active listing{ownerActiveListingsCount === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={openMoreActions} hitSlop={10}>
              <Ionicons name="ellipsis-horizontal" size={22} color={theme.mutedText} />
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 14, marginTop: 10 }}>
            <Text style={{ fontSize: 20, fontWeight: '900', color: theme.text, lineHeight: 26 }}>
              {post.title}
            </Text>
            <Text style={{ marginTop: 10, fontSize: 15, lineHeight: 23, color: theme.text }}>
              {post.description || 'No description added'}
            </Text>
          </View>

          {propertyMetaChips.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, marginTop: 12 }}>
              {propertyMetaChips.map((chip) => (
                <View
                  key={chip}
                  style={{
                    backgroundColor: theme.surfaceMuted,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.border,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                  }}
                >
                  <Text style={{ color: theme.text, fontSize: 11, fontWeight: '800' }}>{chip}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View
            style={{
              marginTop: 14,
              marginHorizontal: 14,
              backgroundColor: theme.surfaceMuted,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 14,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900', marginBottom: 10 }}>
              Property details
            </Text>

            {propertyDetailRows.map((row, index) => (
              <View key={row.label}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 14,
                    paddingVertical: 9,
                  }}
                >
                  <Text style={{ color: theme.mutedText, fontSize: 13, fontWeight: '700', flex: 1 }}>
                    {row.label}
                  </Text>
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 13,
                      fontWeight: '800',
                      flex: 1.35,
                      textAlign: 'right',
                    }}
                  >
                    {row.value}
                  </Text>
                </View>
                {index < propertyDetailRows.length - 1 ? (
                  <View style={{ height: 1, backgroundColor: theme.border }} />
                ) : null}
              </View>
            ))}
          </View>

          <View
            style={{
              marginTop: 12,
              marginHorizontal: 14,
              backgroundColor: theme.surfaceMuted,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: safetySummary.levelMeta.border,
              padding: 14,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: safetySummary.levelMeta.background,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: safetySummary.levelMeta.border,
                }}
              >
                <Ionicons name={safetySummary.levelMeta.icon} size={19} color={safetySummary.levelMeta.tint} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900' }}>
                  Safety check
                </Text>
                <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 3, lineHeight: 17 }}>
                  Risk score {safetySummary.score}/100 · {safetySummary.levelMeta.label}
                </Text>
              </View>
            </View>

            <Text style={{ color: theme.text, fontSize: 12, lineHeight: 18, marginTop: 11, fontWeight: '800' }}>
              {PAYMENT_SAFETY_WARNING}
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 }}>
              {safetySummary.visibleFlags.slice(0, 7).map((flag) => (
                <View
                  key={flag.label}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: flag.border,
                    backgroundColor: flag.background,
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                  }}
                >
                  <Ionicons name={flag.icon} size={12} color={flag.tint} />
                  <Text style={{ color: flag.tint, fontSize: 11, fontWeight: '900', marginLeft: 5 }}>
                    {flag.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

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
            <Text style={{ color: theme.mutedText }}>
              {post.property_reactions?.length ? `👍 ${post.property_reactions.length}` : ''}
            </Text>

            <Text style={{ color: theme.mutedText }}>
              👁 {post.view_count || 0} · 💬 {post.property_comments?.length || 0} · ❤️ {post.property_favorites?.length || 0}
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              borderTopWidth: 1,
              borderTopColor: theme.border,
            }}
          >
            <TouchableOpacity
              onPress={toggleLike}
              style={{ flex: 1, paddingVertical: 13, alignItems: 'center' }}
            >
              <Ionicons
                name={myReaction ? 'thumbs-up' : 'thumbs-up-outline'}
                size={22}
                color={myReaction ? theme.accent : theme.mutedText}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (guestMode) {
                  promptGuestLogin('comments')
                  return
                }

                navigation.navigate('MainTabs', {
                  screen: 'Home',
                  params: {
                    openCommentsForPostId: String(post.id),
                    openCommentsForPost: post,
                    openCommentsRequestId: `property-${post.id}-${Date.now()}`,
                  },
                })
              }}
              style={{ flex: 1, paddingVertical: 13, alignItems: 'center' }}
            >
              <Ionicons name="chatbubble-outline" size={22} color={theme.mutedText} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={toggleFavorite}
              style={{ flex: 1, paddingVertical: 13, alignItems: 'center' }}
            >
              <Ionicons
                name={isFavorite ? 'heart' : 'heart-outline'}
                size={23}
                color={isFavorite ? 'red' : theme.mutedText}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={sharePost}
              style={{ flex: 1, paddingVertical: 13, alignItems: 'center' }}
            >
              <Ionicons name="share-social-outline" size={22} color={theme.mutedText} />
            </TouchableOpacity>
          </View>
        </View>

        {!isOwnProperty ? (
          <View style={{ margin: 14 }}>
            {visitRequest ? (
              <View
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: theme.border,
                  padding: 14,
                  marginBottom: 12,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.text, fontWeight: '900', fontSize: 15 }}>
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

                <Text style={{ color: theme.text, marginTop: 10, lineHeight: 20 }}>
                  Preferred time: {formatVisitDateTime(visitRequest.requested_for)}
                </Text>

                {visitRequest.owner_proposed_for ? (
                  <Text style={{ color: theme.text, marginTop: 6, lineHeight: 20 }}>
                    Owner time: {formatVisitDateTime(visitRequest.owner_proposed_for)}
                  </Text>
                ) : null}

                {visitRequest.owner_response_note ? (
                  <Text style={{ color: theme.mutedText, marginTop: 6, lineHeight: 20 }}>
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
              onPress={() => {
                if (guestMode) {
                  promptGuestLogin('messaging owners')
                  return
                }

                navigation.navigate('MainTabs', {
                  screen: 'Chat',
                  params: { property: post },
                })
              }}
              style={{
                marginTop: 10,
                backgroundColor: theme.accent,
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

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity
                onPress={toggleCompareCurrentPost}
                style={{
                  flex: 1,
                  minHeight: 42,
                  borderRadius: 12,
                  backgroundColor: isCompared ? theme.accentSoft : theme.surfaceMuted,
                  borderWidth: 1,
                  borderColor: isCompared ? theme.accent : theme.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'row',
                }}
              >
                <Ionicons
                  name={isCompared ? 'git-compare' : 'git-compare-outline'}
                  size={16}
                  color={isCompared ? theme.accent : theme.mutedText}
                />
                <Text style={{ color: isCompared ? theme.accent : theme.mutedText, fontSize: 12, fontWeight: '900', marginLeft: 6 }}>
                  {isCompared ? 'In compare' : 'Add to compare'}
                </Text>
              </TouchableOpacity>

              {comparedProperties.length >= 2 ? (
                <TouchableOpacity
                  onPress={() => navigation.navigate('CompareProperties')}
                  style={{
                    flex: 1,
                    minHeight: 42,
                    borderRadius: 12,
                    backgroundColor: theme.surfaceMuted,
                    borderWidth: 1,
                    borderColor: theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                  }}
                >
                  <Ionicons name="open-outline" size={16} color={theme.mutedText} />
                  <Text style={{ color: theme.mutedText, fontSize: 12, fontWeight: '900', marginLeft: 6 }}>
                    Open compare
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

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
                  icon: isCompared ? 'remove-circle-outline' : 'git-compare-outline',
                  title: isCompared ? 'Remove from compare' : 'Add to compare',
                  subtitle: isCompared
                    ? 'Take this property out of your compare shortlist.'
                    : 'Compare this property with other rentals side by side.',
                  onPress: () => {
                    setActionSheetVisible(false)
                    toggleCompareCurrentPost()
                  },
                },
                {
                  icon: 'thumbs-down-outline',
                  title: 'Not interested',
                  subtitle: 'Hide just this post from your feed.',
                  onPress: () => {
                    setActionSheetVisible(false)
                    hideCurrentPost(
                      'not_interested',
                      'Hidden from feed',
                      'We will remove this post from your feed.'
                    )
                  },
                },
                {
                  icon: 'person-remove-outline',
                  title: 'Hide this owner',
                  subtitle: 'Stop showing posts from this owner.',
                  onPress: () => {
                    setActionSheetVisible(false)
                    hideCurrentOwner()
                  },
                },
                {
                  icon: 'options-outline',
                  title: 'Show less like this',
                  subtitle: 'Push similar posts lower in your feed.',
                  onPress: () => {
                    setActionSheetVisible(false)
                    showLessLikeCurrentPost()
                  },
                },
                {
                  icon: 'checkmark-done-outline',
                  title: 'Already rented / irrelevant',
                  subtitle: 'Hide this post because it is no longer useful.',
                  onPress: () => {
                    setActionSheetVisible(false)
                    hideCurrentPost(
                      'already_rented_irrelevant',
                      'Thanks',
                      'We will hide this post from your feed.'
                    )
                  },
                },
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
              backgroundColor: theme.surface,
              borderRadius: 20,
              padding: 18,
              borderWidth: 1,
              borderColor: theme.border,
              maxHeight: '88%',
            }}
          >
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={{ color: theme.text, fontWeight: '900', fontSize: 18 }}>
                Schedule a visit
              </Text>
              <Text style={{ color: theme.mutedText, marginTop: 4, lineHeight: 19 }}>
                Ask the owner for a visit time. They can accept it, reject it, or propose a better time.
              </Text>

              <View style={{ marginTop: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                  <Text style={{ color: theme.mutedText, fontWeight: '800', fontSize: 12 }}>
                    Preferred date
                  </Text>
                  <Text style={{ color: visitDate ? theme.accent : theme.mutedText, fontWeight: '900', fontSize: 11 }}>
                    {visitDate || 'Pick a date'}
                  </Text>
                </View>
                <VisitCalendarPicker
                  value={visitDate}
                  onSelect={setVisitDate}
                  theme={theme}
                />
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: theme.mutedText, fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
                  Preferred time
                </Text>
                <TextInput
                  value={visitTime}
                  onChangeText={setVisitTime}
                  placeholder="HH:MM"
                  placeholderTextColor="#94a3b8"
                  style={{
                    backgroundColor: theme.surfaceMuted,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 14,
                    paddingHorizontal: 13,
                    paddingVertical: 12,
                    color: theme.text,
                  }}
                />
              </View>

              <View style={{ marginTop: 12 }}>
                <Text style={{ color: theme.mutedText, fontWeight: '800', fontSize: 12, marginBottom: 6 }}>
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
                    backgroundColor: theme.surfaceMuted,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 14,
                    paddingHorizontal: 13,
                    paddingVertical: 12,
                    color: theme.text,
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
                    backgroundColor: theme.surfaceMuted,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: theme.text, fontWeight: '900' }}>Cancel</Text>
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
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
