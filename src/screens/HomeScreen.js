import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  PanResponder,
  ScrollView,
  TextInput,
  Modal,
  Share,
  Pressable,
  Image,
  Keyboard,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import Slider from '@react-native-community/slider'
import * as Location from 'expo-location'
import { supabase } from '../lib/supabase'
import {
  createNotification,
  getUnreadNotificationCount,
} from '../lib/notifications'
import { playNotificationSound } from '../lib/sounds'
import MediaViewer from '../components/common/MediaViewer'
import PostCard from '../components/home/PostCard'
import CommentItem from '../components/home/CommentItem'
import Avatar from '../components/common/Avatar'
import BottomNavBar from '../components/navigation/BottomNavBar'
import SwipeTabView from '../components/navigation/SwipeTabView'
import {
  appendCommentToTree,
  buildCommentThread,
  collectCommentIds,
  enrichCommentsWithProfiles,
  fetchCommentProfilesByUserId,
  getCommentAuthorName,
  removeCommentFromTree,
  updateCommentTree,
} from '../lib/commentUtils'
import {
  getHomeLocationArea,
  loadSeenHomePostIds,
  mergeSeenHomePostIds,
  rankHomePosts,
  saveSeenHomePostIds,
} from '../lib/homeFeed'
import { normalizeMediaList } from '../lib/media'
import { getLocationSelectionFromCoords } from '../lib/location'
import { ensureUserProfileRecord } from '../lib/profileSync'
import { getProfileName, getUserAvatarUrl, getUserDisplayName } from '../lib/userDisplay'
import { fetchPropertiesWithProfiles } from '../lib/properties'
import { getOwnerVerificationStatus } from '../lib/verification'

function formatCurrency(value) {
  return `৳ ${Number(value || 0).toLocaleString()}`
}

const BANGLA_TO_ENGLISH_DIGITS = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
}

const ENGLISH_TO_BANGLA_DIGITS = {
  '0': '০',
  '1': '১',
  '2': '২',
  '3': '৩',
  '4': '৪',
  '5': '৫',
  '6': '৬',
  '7': '৭',
  '8': '৮',
  '9': '৯',
}

const BANGLA_TO_LATIN_MAP = {
  'অ': 'o',
  'আ': 'a',
  'ই': 'i',
  'ঈ': 'i',
  'উ': 'u',
  'ঊ': 'u',
  'ঋ': 'ri',
  'এ': 'e',
  'ঐ': 'oi',
  'ও': 'o',
  'ঔ': 'ou',
  'ং': 'n',
  'ঃ': 'h',
  'ঁ': 'n',
  'ক': 'k',
  'খ': 'kh',
  'গ': 'g',
  'ঘ': 'gh',
  'ঙ': 'ng',
  'চ': 'ch',
  'ছ': 'ch',
  'জ': 'j',
  'ঝ': 'jh',
  'ঞ': 'n',
  'ট': 't',
  'ঠ': 'th',
  'ড': 'd',
  'ঢ': 'dh',
  'ণ': 'n',
  'ত': 't',
  'থ': 'th',
  'দ': 'd',
  'ধ': 'dh',
  'ন': 'n',
  'প': 'p',
  'ফ': 'f',
  'ব': 'b',
  'ভ': 'bh',
  'ম': 'm',
  'য': 'y',
  'য়': 'y',
  'র': 'r',
  'ল': 'l',
  'শ': 'sh',
  'ষ': 'sh',
  'স': 's',
  'হ': 'h',
  'া': 'a',
  'ি': 'i',
  'ী': 'i',
  'ু': 'u',
  'ূ': 'u',
  'ৃ': 'ri',
  'ে': 'e',
  'ৈ': 'oi',
  'ো': 'o',
  'ৌ': 'ou',
  '্': '',
}

function toEnglishDigits(value) {
  return String(value || '').replace(/[০-৯]/g, (digit) => BANGLA_TO_ENGLISH_DIGITS[digit] || digit)
}

function toBanglaDigits(value) {
  return String(value || '').replace(/[0-9]/g, (digit) => ENGLISH_TO_BANGLA_DIGITS[digit] || digit)
}

function normalizeSearchText(value) {
  return toEnglishDigits(String(value || '').toLowerCase())
    .replace(/৳/g, ' ')
    .replace(/,/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function transliterateBanglaToLatin(value) {
  return String(value || '')
    .split('')
    .map((char) => BANGLA_TO_LATIN_MAP[char] ?? char)
    .join('')
}

function buildPhoneticToken(token) {
  const normalizedToken = transliterateBanglaToLatin(normalizeSearchText(token))
    .replace(/ph/g, 'f')
    .replace(/bh/g, 'b')
    .replace(/gh/g, 'g')
    .replace(/kh/g, 'k')
    .replace(/chh/g, 'c')
    .replace(/ch/g, 'c')
    .replace(/jh/g, 'j')
    .replace(/sh/g, 's')
    .replace(/th/g, 't')
    .replace(/dh/g, 'd')
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/ou/g, 'u')
    .replace(/oi/g, 'o')
    .replace(/ng/g, 'n')
    .replace(/[^a-z0-9]/g, '')
    .replace(/(.)\1+/g, '$1')

  if (!normalizedToken) return ''
  if (normalizedToken.length === 1) return normalizedToken

  return `${normalizedToken[0]}${normalizedToken.slice(1).replace(/[aeiou]/g, '')}`
}

function getPhoneticSearchKey(value) {
  return normalizeSearchText(value)
    .split(/\s+/)
    .map(buildPhoneticToken)
    .filter(Boolean)
    .join(' ')
}

function getPriceSearchTokens(price) {
  const numericPrice = Number(toEnglishDigits(price))

  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    return []
  }

  const raw = String(Math.round(numericPrice))
  const withCommas = numericPrice.toLocaleString('en-US')
  const banglaRaw = toBanglaDigits(raw)
  const banglaWithCommas = toBanglaDigits(withCommas)

  return [
    raw,
    withCommas,
    `৳ ${raw}`,
    `৳ ${withCommas}`,
    banglaRaw,
    banglaWithCommas,
    `৳ ${banglaRaw}`,
    `৳ ${banglaWithCommas}`,
  ]
}

function getPropertyPrice(post) {
  const price = Number(post?.price || 0)
  return Number.isFinite(price) ? price : 0
}

function getPriceCeiling(posts) {
  const detectedMax = Math.max(...posts.map(getPropertyPrice), 0)

  if (detectedMax <= 10000) return 10000
  if (detectedMax <= 50000) return Math.ceil(detectedMax / 5000) * 5000

  return Math.ceil(detectedMax / 10000) * 10000
}

function createDefaultFilters(maxPrice) {
  return {
    location: '',
    minPrice: 0,
    maxPrice,
    status: 'all',
    media: 'all',
    sort: 'smart',
    verifiedOnly: false,
  }
}

function normalizeFilters(filters, maxPrice) {
  const safeMax = Math.max(maxPrice || 0, 0)
  const nextMin = Math.max(0, Math.min(Number(filters.minPrice || 0), safeMax))
  const nextMax = Math.max(nextMin, Math.min(Number(filters.maxPrice || safeMax), safeMax))

  return {
    ...createDefaultFilters(safeMax),
    ...filters,
    location: (filters.location || '').trim(),
    minPrice: nextMin,
    maxPrice: nextMax,
  }
}

function countActiveFilters(filters, maxPrice) {
  return [
    Boolean(filters.location?.trim()),
    Number(filters.minPrice) > 0,
    Number(filters.maxPrice) < Number(maxPrice || 0),
    filters.status !== 'all',
    filters.media !== 'all',
    filters.sort !== 'smart',
    Boolean(filters.verifiedOnly),
  ].filter(Boolean).length
}

function FilterChip({ label, active, onPress, icon }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.86}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 11,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? '#bfdbfe' : '#dbe4ee',
        backgroundColor: active ? '#eff6ff' : '#fff',
      }}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={13}
          color={active ? '#2563eb' : '#64748b'}
          style={{ marginRight: 5 }}
        />
      ) : null}
      <Text
        style={{
          fontSize: 11,
          fontWeight: '800',
          color: active ? '#1d4ed8' : '#475569',
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function FilterSection({ title, subtitle, children }) {
  return (
    <View style={{ gap: 10 }}>
      <View>
        <Text style={{ fontSize: 13, fontWeight: '900', color: '#0f172a' }}>{title}</Text>
        {subtitle ? (
          <Text style={{ marginTop: 3, fontSize: 11, color: '#64748b' }}>{subtitle}</Text>
        ) : null}
      </View>
      {children}
    </View>
  )
}

function getShortLocationLabel(location) {
  if (!location) return ''

  return String(location)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)[0]
}

function getSearchTextForPost(post) {
  const ownerProfile = post.owner_profile || {}
  const ownerName = getProfileName(
    {
      ...ownerProfile,
      display_name: ownerProfile.display_name || post.owner_name,
      email: ownerProfile.email || post.owner_email,
    },
    'Property Owner'
  )

  return [
    post.title,
    post.description,
    post.location,
    ownerName,
    ...getPriceSearchTokens(post.price),
    post.status === 'rented' ? 'rented rented out unavailable' : 'open for rent available',
  ]
    .filter(Boolean)
    .join(' ')
}

function getSearchTermsForPost(post) {
  const ownerProfile = post.owner_profile || {}
  const ownerName = getProfileName(
    {
      ...ownerProfile,
      display_name: ownerProfile.display_name || post.owner_name,
      email: ownerProfile.email || post.owner_email,
    },
    'Property Owner'
  )

  const locationParts = String(post.location || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)

  return [...new Set([
    post.title,
    ownerName,
    ...locationParts,
  ].filter(Boolean))]
}

function SearchResultRow({ item, onPress }) {
  const ownerProfile = item.owner_profile || {}
  const ownerName = getProfileName(
    {
      ...ownerProfile,
      display_name: ownerProfile.display_name || item.owner_name,
      email: ownerProfile.email || item.owner_email,
    },
    'Property Owner'
  )
  const media = normalizeMediaList(item.media?.length ? item.media : item.image_url ? [item.image_url] : [])
  const previewMedia = media[0]
  const locationLabel = getShortLocationLabel(item.location)

  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      activeOpacity={0.9}
      style={{
        backgroundColor: '#fff',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 62,
          height: 62,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: '#e2e8f0',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {previewMedia?.type === 'image' ? (
          <Image
            source={{ uri: previewMedia.uri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : previewMedia?.type === 'video' ? (
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="play-circle" size={28} color="#0f172a" />
          </View>
        ) : (
          <Ionicons name="home-outline" size={24} color="#64748b" />
        )}
      </View>

      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text numberOfLines={1} style={{ color: '#0f172a', fontSize: 14, fontWeight: '900' }}>
          {item.title || 'Property post'}
        </Text>
        <Text numberOfLines={1} style={{ marginTop: 4, color: '#64748b', fontSize: 12 }}>
          {ownerName}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
          {locationLabel ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#f8fafc',
                borderRadius: 999,
                paddingHorizontal: 7,
                paddingVertical: 3,
                marginRight: 6,
              }}
            >
              <Ionicons name="location-outline" size={10} color="#64748b" style={{ marginRight: 3 }} />
              <Text style={{ color: '#475569', fontSize: 10, fontWeight: '800' }}>{locationLabel}</Text>
            </View>
          ) : null}

          <View
            style={{
              backgroundColor: '#fff7ed',
              borderRadius: 999,
              paddingHorizontal: 7,
              paddingVertical: 3,
            }}
          >
            <Text style={{ color: '#ea580c', fontSize: 10, fontWeight: '900' }}>
              {formatCurrency(item.price)}
            </Text>
          </View>
        </View>
      </View>

      <Ionicons name="arrow-forward" size={18} color="#94a3b8" />
    </TouchableOpacity>
  )
}

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
  const [locationLabel, setLocationLabel] = useState('Detecting location...')
  const [locationFullLabel, setLocationFullLabel] = useState('Detecting location...')
  const [locationLoading, setLocationLoading] = useState(false)
  const [filterModalVisible, setFilterModalVisible] = useState(false)
  const [searchModalVisible, setSearchModalVisible] = useState(false)
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('')
  const [draftSearchQuery, setDraftSearchQuery] = useState('')
  const [recentSearches, setRecentSearches] = useState([])
  const [seenPostIds, setSeenPostIds] = useState([])
  const [feedRefreshTick, setFeedRefreshTick] = useState(0)
  const [appliedFilters, setAppliedFilters] = useState(createDefaultFilters(0))
  const [draftFilters, setDraftFilters] = useState(createDefaultFilters(0))
  const [mediaViewer, setMediaViewer] = useState({
    visible: false,
    media: [],
    index: 0,
  })
  const reopenCommentsOnFocus = useRef(false)
  const handledCommentRouteRequest = useRef(null)
  const commentReturnRoute = useRef(null)
  const manualLocationOverride = useRef(false)
  const postListRef = useRef(null)
  const currentUserIdRef = useRef(null)
  const seenPostIdsRef = useRef([])
  const viewabilityConfig = useRef({
    minimumViewTime: 650,
    itemVisiblePercentThreshold: 55,
  }).current

  function formatLocationLabel(value) {
    if (!value) return ''
    return value.length > 5 ? `${value.slice(0, 5)}..` : value
  }

  useEffect(() => {
    currentUserIdRef.current = currentUser?.id || null
  }, [currentUser?.id])

  useEffect(() => {
    seenPostIdsRef.current = seenPostIds
  }, [seenPostIds])

  const priceCeiling = useMemo(() => getPriceCeiling(properties), [properties])
  const activeFilterCount = useMemo(
    () => countActiveFilters(appliedFilters, priceCeiling),
    [appliedFilters, priceCeiling]
  )
  const defaultLocationArea = useMemo(
    () => getHomeLocationArea(locationFullLabel),
    [locationFullLabel]
  )
  const rankedProperties = useMemo(
    () =>
      rankHomePosts(properties, {
        userArea: defaultLocationArea,
        seenPostIds,
        userId: currentUser?.id || currentUser?.email || 'guest',
        refreshTick: feedRefreshTick,
      }),
    [currentUser?.email, currentUser?.id, defaultLocationArea, feedRefreshTick, properties, seenPostIds]
  )

  const filteredProperties = useMemo(() => {
    const locationNeedle = (appliedFilters.location || '').trim().toLowerCase()
    const items = rankedProperties
      .filter((post) => {
        const price = getPropertyPrice(post)
        const status = post.status || 'open'
        const postMedia = normalizeMediaList(post.media?.length ? post.media : post.image_url ? [post.image_url] : [])
        const hasVideo = postMedia.some((item) => item.type === 'video')
        const hasImage = postMedia.some((item) => item.type === 'image')
        const searchableLocation = `${post.location || ''} ${post.title || ''} ${post.description || ''}`.toLowerCase()

        if (locationNeedle && !searchableLocation.includes(locationNeedle)) {
          return false
        }

        if (price < Number(appliedFilters.minPrice || 0)) {
          return false
        }

        if (price > Number(appliedFilters.maxPrice || priceCeiling)) {
          return false
        }

        if (appliedFilters.status !== 'all' && status !== appliedFilters.status) {
          return false
        }

        if (appliedFilters.media === 'photos' && !hasImage) {
          return false
        }

        if (appliedFilters.media === 'videos' && !hasVideo) {
          return false
        }

        if (appliedFilters.verifiedOnly && getOwnerVerificationStatus(post.owner_profile) !== 'verified') {
          return false
        }

        return true
      })
    if (appliedFilters.sort === 'smart') {
      return items
    }

    return [...items].sort((leftPost, rightPost) => {
      const leftPrice = getPropertyPrice(leftPost)
      const rightPrice = getPropertyPrice(rightPost)
      const leftDate = new Date(leftPost.created_at || 0).getTime()
      const rightDate = new Date(rightPost.created_at || 0).getTime()

      switch (appliedFilters.sort) {
        case 'oldest':
          return leftDate - rightDate
        case 'price_low':
          return leftPrice - rightPrice
        case 'price_high':
          return rightPrice - leftPrice
        case 'newest':
          return rightDate - leftDate
        default:
          return 0
      }
    })
  }, [appliedFilters, priceCeiling, rankedProperties])

  const searchResults = useMemo(() => {
    const query = normalizeSearchText(draftSearchQuery)
    const phoneticQuery = getPhoneticSearchKey(draftSearchQuery)

    if (!query && !phoneticQuery) return []

    return filteredProperties.filter((post) => {
      const postSearchText = getSearchTextForPost(post)
      const normalizedPost = normalizeSearchText(postSearchText)
      const phoneticPost = getPhoneticSearchKey(postSearchText)

      return (
        (query && normalizedPost.includes(query))
        || (phoneticQuery && phoneticPost.includes(phoneticQuery))
      )
    })
  }, [draftSearchQuery, filteredProperties])

  const visibleProperties = useMemo(() => {
    const query = normalizeSearchText(appliedSearchQuery)
    const phoneticQuery = getPhoneticSearchKey(appliedSearchQuery)

    if (!query && !phoneticQuery) return filteredProperties

    return filteredProperties.filter((post) => {
      const postSearchText = getSearchTextForPost(post)
      const normalizedPost = normalizeSearchText(postSearchText)
      const phoneticPost = getPhoneticSearchKey(postSearchText)

      return (
        (query && normalizedPost.includes(query))
        || (phoneticQuery && phoneticPost.includes(phoneticQuery))
      )
    })
  }, [appliedSearchQuery, filteredProperties])

  const suggestionChips = useMemo(() => {
    const locations = filteredProperties
      .map((post) => getShortLocationLabel(post.location))
      .filter(Boolean)
    const owners = filteredProperties
      .map((post) =>
        getProfileName(
          {
            ...(post.owner_profile || {}),
            display_name: post.owner_profile?.display_name || post.owner_name,
            email: post.owner_profile?.email || post.owner_email,
          },
          'Property Owner'
        )
      )
      .filter(Boolean)

    return [...new Set([...locations, ...owners])].slice(0, 8)
  }, [filteredProperties])

  const relatedSearchTerms = useMemo(() => {
    const query = normalizeSearchText(draftSearchQuery)
    const phoneticQuery = getPhoneticSearchKey(draftSearchQuery)

    if (!query && !phoneticQuery) return []

    return [...new Set(
      searchResults
        .flatMap((post) => getSearchTermsForPost(post))
        .filter((term) => {
          const normalizedTerm = normalizeSearchText(term)
          const phoneticTerm = getPhoneticSearchKey(term)

          return (
            (query && normalizedTerm.includes(query))
            || (phoneticQuery && phoneticTerm.includes(phoneticQuery))
          )
        })
    )]
      .filter((term) => normalizeSearchText(term) !== query)
      .slice(0, 8)
  }, [draftSearchQuery, searchResults])

  useEffect(() => {
    loadUser()
    loadProperties()
  }, [])

  useEffect(() => {
    setAppliedFilters((current) => normalizeFilters(current, priceCeiling))
    setDraftFilters((current) => normalizeFilters(current, priceCeiling))
  }, [priceCeiling])

  useEffect(() => {
    let isMounted = true

    async function hydrateSeenPosts() {
      if (!currentUser?.id) {
        if (isMounted) {
          setSeenPostIds([])
        }
        return
      }

      const cachedPostIds = await loadSeenHomePostIds(currentUser.id)

      if (isMounted) {
        setSeenPostIds(cachedPostIds)
      }
    }

    hydrateSeenPosts()

    return () => {
      isMounted = false
    }
  }, [currentUser?.id])

  useFocusEffect(
    useCallback(() => {
      loadUser()
      loadProperties({ silent: true })

      if (!manualLocationOverride.current && !route?.params?.selectedLocation) {
        loadCurrentLocation()
      }
    }, [route?.params?.selectedLocation])
  )

  useEffect(() => {
    if (!route?.params?.refreshFeedAt) return

    loadProperties({ silent: true })
    navigation.setParams({
      refreshFeedAt: undefined,
    })
  }, [loadProperties, navigation, route?.params?.refreshFeedAt])

  useEffect(() => {
    const channel = supabase
      .channel(`home-properties-${Date.now()}-${Math.random()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'properties',
        },
        () => {
          loadProperties({ silent: true })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'property_views',
        },
        () => {
          loadProperties({ silent: true })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadProperties])

  useEffect(() => {
    const selectedLocation = route?.params?.selectedLocation
    const requestId = route?.params?.selectedLocationRequestId

    if (!selectedLocation || !requestId) return

    manualLocationOverride.current = true
    setLocationLoading(false)
    const resolvedArea = selectedLocation.areaLabel || selectedLocation.label || 'Pinned location'
    setLocationFullLabel(resolvedArea)
    setLocationLabel(formatLocationLabel(resolvedArea))
    navigation.setParams({
      selectedLocation: undefined,
      selectedLocationRequestId: undefined,
    })
  }, [navigation, route?.params?.selectedLocation, route?.params?.selectedLocationRequestId])

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

    if (user?.id) {
      try {
        await ensureUserProfileRecord(user)
      } catch (_error) {
        // Feed can continue even if profile sync retries later.
      }
    }

    setCurrentUser(user)
  }

  async function loadCurrentLocation() {
    try {
      setLocationLoading(true)

      const permission = await Location.requestForegroundPermissionsAsync()

      if (!permission.granted) {
        setLocationFullLabel('Location off')
        setLocationLabel(formatLocationLabel('Location off'))
        setLocationLoading(false)
        return 'Location off'
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })

      const selection = await getLocationSelectionFromCoords(
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
        'Current area'
      )

      setLocationFullLabel(selection.areaLabel || 'Current area')
      setLocationLabel(formatLocationLabel(selection.areaLabel || 'Current area'))
      return selection.areaLabel || 'Current area'
    } catch (_error) {
      setLocationFullLabel('Location unavailable')
      setLocationLabel(formatLocationLabel('Location unavailable'))
      return 'Location unavailable'
    } finally {
      setLocationLoading(false)
    }
  }

  async function refreshNotificationBadge(userId = currentUser?.id) {
    setNotificationUnreadCount(await getUnreadNotificationCount(userId))
  }

  const loadProperties = useCallback(async (options = {}) => {
    if (!options.silent) {
      setLoading(true)
    }

    try {
      setProperties(await fetchPropertiesWithProfiles())
    } catch (error) {
      Alert.alert('Error', error.message)
    }

    if (!options.silent) {
      setLoading(false)
    }
  }, [])

  async function markPostsAsSeen(postIds) {
    if (!currentUser?.id || !postIds?.length) return

    const normalizedIds = postIds.map((id) => String(id)).filter(Boolean)
    const nextSeenIds = mergeSeenHomePostIds(seenPostIdsRef.current, normalizedIds)

    if (nextSeenIds.length === seenPostIdsRef.current.length) {
      return
    }

    seenPostIdsRef.current = nextSeenIds
    setSeenPostIds(nextSeenIds)
    await saveSeenHomePostIds(currentUser.id, nextSeenIds)
  }

  async function refreshHomeFeed({ scrollToTop = false } = {}) {
    setFeedRefreshTick((current) => current + 1)
    await loadProperties()

    if (scrollToTop) {
      postListRef.current?.scrollToOffset?.({
        animated: true,
        offset: 0,
      })
    }
  }

  function handleMainTabPress(tabKey, { isActive }) {
    if (tabKey !== 'home' || !isActive) {
      return false
    }

    refreshHomeFeed({ scrollToTop: true })
    return true
  }

  function openFilters() {
    setDraftFilters(normalizeFilters(appliedFilters, priceCeiling))
    setFilterModalVisible(true)
  }

  function closeFilters() {
    setFilterModalVisible(false)
  }

  function updateDraftFilter(key, value) {
    setDraftFilters((current) => normalizeFilters({ ...current, [key]: value }, priceCeiling))
  }

  function resetDraftFilters() {
    setDraftFilters(createDefaultFilters(priceCeiling))
  }

  function applyFilters() {
    setAppliedFilters(normalizeFilters(draftFilters, priceCeiling))
    setFilterModalVisible(false)
  }

  async function useAutoLocationFilter() {
    const detectedLabel = locationFullLabel && !['Location off', 'Location unavailable'].includes(locationFullLabel)
      ? locationFullLabel
      : await loadCurrentLocation()

    if (!detectedLabel || ['Location off', 'Location unavailable'].includes(detectedLabel)) {
      Alert.alert('Location unavailable', 'Allow location access or type an area manually.')
      return
    }

    updateDraftFilter('location', detectedLabel)
  }

  function openSearch() {
    setDraftSearchQuery(appliedSearchQuery)
    setSearchModalVisible(true)
  }

  function closeSearch() {
    Keyboard.dismiss()
    setSearchModalVisible(false)
  }

  function rememberSearch(value) {
    const cleanedValue = (value || '').trim()
    if (!cleanedValue) return

    setRecentSearches((current) => [
      cleanedValue,
      ...current.filter((item) => item.toLowerCase() !== cleanedValue.toLowerCase()),
    ].slice(0, 6))
  }

  function applySearch(value = draftSearchQuery) {
    const cleanedValue = (value || '').trim()
    setAppliedSearchQuery(cleanedValue)
    rememberSearch(cleanedValue)
    closeSearch()
  }

  function clearSearch() {
    setDraftSearchQuery('')
    setAppliedSearchQuery('')
  }

  function openSearchResult(post) {
    rememberSearch(draftSearchQuery)
    closeSearch()
    navigation.navigate('Property', { property: post })
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
    markPostsAsSeen([post.id])
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
      onOpenPost={(post) => {
        markPostsAsSeen([post.id])
        navigation.navigate('Property', { property: post })
      }}
    />
  ), [currentUser, navigation, openMediaViewer, openOwnerProfile])
  const handleViewableItemsChanged = useRef(({ viewableItems }) => {
    const userId = currentUserIdRef.current

    if (!userId) return

    const visibleIds = viewableItems
      .map((entry) => entry?.item?.id)
      .filter(Boolean)
      .map((id) => String(id))

    if (!visibleIds.length) return

    const nextSeenIds = mergeSeenHomePostIds(seenPostIdsRef.current, visibleIds)

    if (nextSeenIds.length === seenPostIdsRef.current.length) {
      return
    }

    seenPostIdsRef.current = nextSeenIds
    setSeenPostIds(nextSeenIds)
    saveSeenHomePostIds(userId, nextSeenIds)
  }).current

  const showInitialLoader = loading && properties.length === 0
  const canCreatePosts = currentUser?.user_metadata?.user_type === 'property_owner'
  const showFilteredEmptyState = !showInitialLoader && visibleProperties.length === 0

  function CreatePostBox() {
    const composerName = getUserDisplayName(currentUser) || 'Property owner'
    const composerPrompt =
      currentUser?.user_metadata?.user_type === 'property_owner'
        ? 'Post your rental ad, photos, rent, and location'
        : 'Share your latest rental update'

    return (
      <View
        style={{
          backgroundColor: '#fff',
          paddingHorizontal: 14,
          paddingVertical: 12,
          marginBottom: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Avatar
            profile={{
              display_name: composerName,
              email: currentUser?.email,
              avatar_url: getUserAvatarUrl(currentUser),
            }}
            name={composerName}
            size={46}
            backgroundColor="#dbeafe"
            textColor="#1d4ed8"
          />

          <TouchableOpacity
            onPress={() => navigation.navigate('CreatePost')}
            style={{
              flex: 1,
              marginLeft: 10,
              borderWidth: 1,
              borderColor: '#dbe4ee',
              borderRadius: 26,
              paddingVertical: 11,
              paddingHorizontal: 16,
              backgroundColor: '#f8fafc',
            }}
          >
            <Text style={{ color: '#475569', fontSize: 14, fontWeight: '700' }}>
              {composerPrompt}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('CreatePost')}
            style={{
              marginLeft: 10,
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: '#ecfdf5',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="images" size={22} color="#16a34a" />
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SwipeTabView
        navigation={navigation}
        activeTab="home"
        disabled={commentModal || mediaViewer.visible}
      >
      <View
        style={{
          backgroundColor: '#fff',
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: '#eee',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <TouchableOpacity
          onPress={() =>
            navigation.navigate('Location', {
              initialLabel: locationLoading ? '' : locationFullLabel,
            })
          }
          activeOpacity={0.82}
          style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}
        >
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: '#f1f5f9',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 7,
            }}
          >
            <Ionicons name="location-outline" size={14} color="#1877F2" />
          </View>

          <Text
            style={{ color: '#334155', fontSize: 12, fontWeight: '700', flexShrink: 1 }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {locationLoading ? 'Loc...' : locationLabel}
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={openFilters}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: activeFilterCount ? '#eff6ff' : '#f1f1f1',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name="options-outline"
              size={19}
              color={activeFilterCount ? '#2563eb' : '#111'}
            />
            {activeFilterCount ? (
              <View
                style={{
                  position: 'absolute',
                  top: -3,
                  right: -3,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: '#2563eb',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>
                  {activeFilterCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={openSearch}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: appliedSearchQuery ? '#eff6ff' : '#f1f1f1',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name="search"
              size={20}
              color={appliedSearchQuery ? '#2563eb' : '#111'}
            />
          </TouchableOpacity>
        </View>
      </View>

      {appliedSearchQuery ? (
        <View
          style={{
            backgroundColor: '#fff',
            paddingHorizontal: 16,
            paddingBottom: 10,
            borderBottomWidth: 1,
            borderBottomColor: '#eee',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#eff6ff',
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 12 }}>
              <Ionicons name="search" size={15} color="#2563eb" style={{ marginRight: 7 }} />
              <Text numberOfLines={1} style={{ color: '#1d4ed8', fontSize: 12, fontWeight: '800', flexShrink: 1 }}>
                Searching: {appliedSearchQuery}
              </Text>
            </View>

            <TouchableOpacity onPress={clearSearch}>
              <Text style={{ color: '#2563eb', fontSize: 12, fontWeight: '900' }}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <FlatList
        ref={postListRef}
        data={visibleProperties}
        keyExtractor={(item) => item.id}
        renderItem={renderPost}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        ListHeaderComponent={canCreatePosts ? <CreatePostBox /> : null}
        ListEmptyComponent={
          showInitialLoader ? (
            <ActivityIndicator style={{ marginTop: 30 }} />
          ) : showFilteredEmptyState ? (
            <View style={{ paddingHorizontal: 22, paddingTop: 28, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>
                {appliedSearchQuery ? 'No ads match this search' : 'No ads match these filters'}
              </Text>
              <Text style={{ marginTop: 6, fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                {appliedSearchQuery
                  ? 'Try another keyword, owner name, or area.'
                  : 'Try a wider budget, another area, or reset the filters.'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (appliedSearchQuery) {
                    clearSearch()
                  } else {
                    setAppliedFilters(createDefaultFilters(priceCeiling))
                  }
                }}
                style={{
                  marginTop: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 999,
                  backgroundColor: '#eff6ff',
                }}
              >
                <Text style={{ color: '#2563eb', fontSize: 12, fontWeight: '900' }}>
                  {appliedSearchQuery ? 'Clear search' : 'Clear filters'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 80 }}
        contentInsetAdjustmentBehavior="automatic"
        refreshing={loading && properties.length > 0}
        onRefresh={() => refreshHomeFeed()}
        removeClippedSubviews
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={60}
        windowSize={7}
      />

      <Modal
        visible={searchModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeSearch}
      >
        <Pressable
          onPress={closeSearch}
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.32)',
            paddingHorizontal: 12,
            paddingTop: 54,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: '#fff',
              borderRadius: 22,
              borderWidth: 1,
              borderColor: '#dbe4ee',
              maxHeight: '80%',
              overflow: 'hidden',
            }}
          >
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: '#eef2f7' }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#f8fafc',
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: '#dbe4ee',
                  paddingHorizontal: 12,
                  height: 48,
                }}
              >
                <Ionicons name="search" size={18} color="#64748b" />
                <TextInput
                  value={draftSearchQuery}
                  onChangeText={setDraftSearchQuery}
                  onSubmitEditing={() => applySearch()}
                  autoFocus
                  placeholder="Search by area, owner, title, or rent"
                  placeholderTextColor="#94a3b8"
                  style={{ flex: 1, marginLeft: 8, color: '#0f172a', fontSize: 14 }}
                  returnKeyType="search"
                />
                {draftSearchQuery ? (
                  <TouchableOpacity onPress={() => setDraftSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '800' }}>
                  {draftSearchQuery
                    ? `${searchResults.length} results ready`
                    : 'Search rentals fast'}
                </Text>

                <TouchableOpacity onPress={closeSearch}>
                  <Text style={{ color: '#2563eb', fontSize: 12, fontWeight: '900' }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              style={{ maxHeight: 480 }}
              contentContainerStyle={{ padding: 14, gap: 12 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {!draftSearchQuery ? (
                <>
                  {recentSearches.length > 0 ? (
                    <FilterSection title="Recent searches">
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {recentSearches.map((term) => (
                          <FilterChip
                            key={term}
                            label={term}
                            icon="time-outline"
                            active={false}
                            onPress={() => setDraftSearchQuery(term)}
                          />
                        ))}
                      </View>
                    </FilterSection>
                  ) : null}

                  <FilterSection title="Popular shortcuts" subtitle="Tap a quick term to search instantly.">
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {suggestionChips.map((term) => (
                        <FilterChip
                          key={term}
                          label={term}
                          icon="sparkles-outline"
                          active={false}
                          onPress={() => setDraftSearchQuery(term)}
                        />
                      ))}
                    </View>
                  </FilterSection>
                </>
              ) : searchResults.length > 0 ? (
                <>
                  {relatedSearchTerms.length > 0 ? (
                    <FilterSection
                      title="Similar Bangla / English words"
                      subtitle="Tap a similar spelling if that is the word you meant."
                    >
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {relatedSearchTerms.map((term) => (
                          <FilterChip
                            key={term}
                            label={term}
                            icon="swap-horizontal-outline"
                            active={false}
                            onPress={() => setDraftSearchQuery(term)}
                          />
                        ))}
                      </View>
                    </FilterSection>
                  ) : null}

                  <FilterSection title="Live results" subtitle="Open a post directly or apply this search to the feed.">
                    <View style={{ gap: 10 }}>
                      {searchResults.slice(0, 6).map((item) => (
                        <SearchResultRow key={item.id} item={item} onPress={openSearchResult} />
                      ))}
                    </View>
                  </FilterSection>

                  <TouchableOpacity
                    onPress={() => applySearch()}
                    style={{
                      height: 46,
                      borderRadius: 16,
                      backgroundColor: '#2563eb',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>
                      Show {searchResults.length} result{searchResults.length === 1 ? '' : 's'} in feed
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <View style={{ paddingVertical: 10 }}>
                  <Text style={{ color: '#0f172a', fontSize: 14, fontWeight: '900' }}>
                    No results for "{draftSearchQuery}"
                  </Text>
                  <Text style={{ marginTop: 6, color: '#64748b', fontSize: 12 }}>
                    Try another area, owner name, post title, or a lower rent number.
                  </Text>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeFilters}
      >
        <Pressable
          onPress={closeFilters}
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.35)',
            justifyContent: 'flex-end',
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 12,
              paddingHorizontal: 16,
              paddingBottom: 18,
              maxHeight: '82%',
            }}
          >
            <View
              style={{
                width: 42,
                height: 5,
                borderRadius: 999,
                backgroundColor: '#dbe4ee',
                alignSelf: 'center',
                marginBottom: 12,
              }}
            />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <View>
                <Text style={{ fontSize: 17, fontWeight: '900', color: '#0f172a' }}>
                  Advanced Filters
                </Text>
                <Text style={{ marginTop: 2, fontSize: 11, color: '#64748b' }}>
                  Narrow rentals by budget, place, media, and availability.
                </Text>
              </View>

              <TouchableOpacity
                onPress={closeFilters}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: '#f8fafc',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="close" size={18} color="#0f172a" />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 10, gap: 18 }}
            >
              <FilterSection
                title="Location"
                subtitle="Detect your current area automatically or type one yourself."
              >
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <FilterChip
                    label={locationLoading ? 'Detecting...' : 'Use current area'}
                    icon="locate"
                    active={Boolean(draftFilters.location)}
                    onPress={useAutoLocationFilter}
                  />
                </View>

                <TextInput
                  value={draftFilters.location}
                  onChangeText={(value) => updateDraftFilter('location', value)}
                  placeholder="Type area, city, or neighborhood"
                  placeholderTextColor="#94a3b8"
                  style={{
                    height: 44,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: '#dbe4ee',
                    backgroundColor: '#f8fafc',
                    paddingHorizontal: 12,
                    color: '#0f172a',
                    fontSize: 13,
                  }}
                />
              </FilterSection>

              <FilterSection
                title="Budget"
                subtitle="Move the sliders to choose a comfortable rent range."
              >
                <View
                  style={{
                    backgroundColor: '#f8fafc',
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    gap: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '800' }}>
                      Min
                    </Text>
                    <Text style={{ fontSize: 11, color: '#0f172a', fontWeight: '900' }}>
                      {formatCurrency(draftFilters.minPrice)}
                    </Text>
                  </View>
                  <Slider
                    minimumValue={0}
                    maximumValue={priceCeiling}
                    step={Math.max(500, Math.round(priceCeiling / 40))}
                    value={draftFilters.minPrice}
                    minimumTrackTintColor="#2563eb"
                    maximumTrackTintColor="#cbd5e1"
                    thumbTintColor="#2563eb"
                    onValueChange={(value) => updateDraftFilter('minPrice', value)}
                  />

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                    <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '800' }}>
                      Max
                    </Text>
                    <Text style={{ fontSize: 11, color: '#0f172a', fontWeight: '900' }}>
                      {formatCurrency(draftFilters.maxPrice)}
                    </Text>
                  </View>
                  <Slider
                    minimumValue={draftFilters.minPrice}
                    maximumValue={priceCeiling}
                    step={Math.max(500, Math.round(priceCeiling / 40))}
                    value={draftFilters.maxPrice}
                    minimumTrackTintColor="#2563eb"
                    maximumTrackTintColor="#cbd5e1"
                    thumbTintColor="#2563eb"
                    onValueChange={(value) => updateDraftFilter('maxPrice', value)}
                  />
                </View>
              </FilterSection>

              <FilterSection title="Availability">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <FilterChip
                    label="All"
                    active={draftFilters.status === 'all'}
                    onPress={() => updateDraftFilter('status', 'all')}
                  />
                  <FilterChip
                    label="Open for rent"
                    active={draftFilters.status === 'open'}
                    onPress={() => updateDraftFilter('status', 'open')}
                  />
                  <FilterChip
                    label="Rented out"
                    active={draftFilters.status === 'rented'}
                    onPress={() => updateDraftFilter('status', 'rented')}
                  />
                </View>
              </FilterSection>

              <FilterSection title="Media">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <FilterChip
                    label="All posts"
                    active={draftFilters.media === 'all'}
                    onPress={() => updateDraftFilter('media', 'all')}
                  />
                  <FilterChip
                    label="Photos"
                    active={draftFilters.media === 'photos'}
                    onPress={() => updateDraftFilter('media', 'photos')}
                  />
                  <FilterChip
                    label="Videos"
                    active={draftFilters.media === 'videos'}
                    onPress={() => updateDraftFilter('media', 'videos')}
                  />
                </View>
              </FilterSection>

              <FilterSection title="Sort">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <FilterChip
                    label="Smart"
                    active={draftFilters.sort === 'smart'}
                    onPress={() => updateDraftFilter('sort', 'smart')}
                  />
                  <FilterChip
                    label="Newest"
                    active={draftFilters.sort === 'newest'}
                    onPress={() => updateDraftFilter('sort', 'newest')}
                  />
                  <FilterChip
                    label="Oldest"
                    active={draftFilters.sort === 'oldest'}
                    onPress={() => updateDraftFilter('sort', 'oldest')}
                  />
                  <FilterChip
                    label="Price low"
                    active={draftFilters.sort === 'price_low'}
                    onPress={() => updateDraftFilter('sort', 'price_low')}
                  />
                  <FilterChip
                    label="Price high"
                    active={draftFilters.sort === 'price_high'}
                    onPress={() => updateDraftFilter('sort', 'price_high')}
                  />
                </View>
              </FilterSection>

              <FilterSection title="Owner">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <FilterChip
                    label="Any owner"
                    active={!draftFilters.verifiedOnly}
                    onPress={() => updateDraftFilter('verifiedOnly', false)}
                  />
                  <FilterChip
                    label="Verified only"
                    active={draftFilters.verifiedOnly}
                    onPress={() => updateDraftFilter('verifiedOnly', true)}
                  />
                </View>
              </FilterSection>
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                onPress={resetDraftFilters}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 15,
                  backgroundColor: '#f8fafc',
                  borderWidth: 1,
                  borderColor: '#dbe4ee',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#475569', fontSize: 13, fontWeight: '900' }}>
                  Reset
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={applyFilters}
                style={{
                  flex: 1.4,
                  height: 46,
                  borderRadius: 15,
                  backgroundColor: '#2563eb',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>
                  Apply Filters
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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

      <BottomNavBar
        navigation={navigation}
        activeTab="home"
        messageUnreadCount={messageUnreadCount}
        notificationUnreadCount={notificationUnreadCount}
        onTabPress={handleMainTabPress}
      />
      </SwipeTabView>
    </SafeAreaView>
  )
}
