import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Clipboard from 'expo-clipboard'
import * as DocumentPicker from 'expo-document-picker'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import * as ExpoLocation from 'expo-location'
import Constants from 'expo-constants'
import MapView, { Marker } from 'react-native-maps'
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import { supabase } from '../lib/supabase'
import { getCachedAuthUser } from '../lib/authSession'
import Avatar from '../components/common/Avatar'
import GroupAvatar from '../components/common/GroupAvatar'
import ActionSheetModal from '../components/common/ActionSheetModal'
import MediaComposerModal from '../components/chat/MediaComposerModal'
import MediaViewer from '../components/common/MediaViewer'
import ConversationRow from '../components/chat/ConversationRow'
import MessageBubble from '../components/chat/MessageBubble'
import BottomNavBar from '../components/navigation/BottomNavBar'
import SwipeTabView from '../components/navigation/SwipeTabView'
import useChatPresence from '../hooks/useChatPresence'
import { CHAT_MEDIA_BUCKET, uploadMediaAsset } from '../lib/media'
import { sendPushToUser } from '../lib/pushNotifications'
import {
  getChatAppearance,
  resolveChatColorPreset,
  resolveChatWallpaperPreset,
} from '../lib/chatAppearance'
import { useAppSettings } from '../lib/appSettings'
import {
  CHAT_CONTACT_CARD_MIME_TYPE,
  CHAT_LOCATION_MIME_TYPE,
  CHAT_RED_PACKET_MIME_TYPE,
  formatCurrencyAmount,
  formatDuration,
  getCallPresentation,
  getDirectTarget,
  getPropertyId,
  isContactCardMessage,
  isLocationMessage,
  isRedPacketMessage,
  mediaLabel,
  parseContactCardPayload,
} from '../lib/chatUtils'
import { fetchWalletBalance } from '../lib/wallet'
import {
  buildGroupProfile,
  fetchGroupMembers,
  isGroupConversation,
} from '../lib/chatGroups'
import {
  buildAgoraChannelName,
  canUseAgoraNativeModule,
  createAgoraCallId,
  hasActiveAgoraCall,
  reserveActiveAgoraCall,
  sendAgoraCallInvite,
} from '../lib/agoraCall'
import { getProfileName, getUserAvatarUrl, getUserDisplayName } from '../lib/userDisplay'
import { getLocationSelectionFromCoords } from '../lib/location'
import {
  getConversationLinkPreviewEnabled,
  getMutedConversationIds,
  getPinnedConversationIds,
} from '../lib/chatPreferences'
import { fetchConnections } from '../lib/social'
import {
  extractFirstLink,
  fetchLinkPreview,
  getLinkHost,
} from '../lib/linkPreviews'

const EMPTY_ROUTE_PARAMS = {}
const RED_PACKET_MAX_AMOUNT = 200
const RED_PACKET_REMINDER_INTERVAL_MS = 5 * 60 * 60 * 1000
const FORWARD_MAX_RECIPIENTS = 30
const COMPOSER_INPUT_MIN_HEIGHT = 42
const COMPOSER_INPUT_MAX_HEIGHT = 116
const MESSAGE_SETTINGS_STORAGE_KEY = 'rentalx.message_settings.v1'
const CHAT_FOLDERS_STORAGE_KEY = 'rentalx.chat_folders.v1'
const CHAT_FOLDER_ASSIGNMENTS_STORAGE_KEY = 'rentalx.chat_folder_assignments.v1'
const DEFAULT_MESSAGE_SETTINGS = {
  showActiveNow: true,
  showMessagePreviews: true,
  showUnreadBadges: true,
  keepPinnedFirst: true,
  smartInboxSorting: true,
  smartReplySuggestions: true,
  smartSafetyReminders: true,
  followUpNudges: true,
}
const DEFAULT_CHAT_FOLDERS = [
  {
    id: 'all',
    title: 'All',
    icon: 'albums-outline',
    color: '#1877F2',
    assignable: false,
  },
  {
    id: 'personal',
    title: 'Personal',
    icon: 'person-outline',
    color: '#16a34a',
    assignable: false,
  },
  {
    id: 'me',
    title: 'Me',
    icon: 'bookmark-outline',
    color: '#f97316',
    assignable: true,
  },
]
const CHAT_FOLDER_COLORS = [
  '#7c3aed',
  '#db2777',
  '#0891b2',
  '#ca8a04',
  '#dc2626',
  '#0d9488',
  '#4f46e5',
  '#65a30d',
  '#c2410c',
  '#9333ea',
]
const DEFAULT_CHAT_LOCATION_REGION = {
  latitude: 23.8103,
  longitude: 90.4125,
  latitudeDelta: 0.018,
  longitudeDelta: 0.018,
}
const HAS_ANDROID_GOOGLE_MAPS_KEY =
  Platform.OS !== 'android' ||
  Boolean(Constants?.expoConfig?.extra?.googleMapsEnabled)
function normalizeMeteringLevel(metering) {
  if (typeof metering !== 'number' || Number.isNaN(metering)) {
    return 0.18
  }

  const clamped = Math.max(-60, Math.min(0, metering))
  return Math.max(0.12, (clamped + 60) / 60)
}

function hexToRgba(hex, alpha = 1) {
  const safeHex = String(hex || '').replace('#', '')

  if (safeHex.length !== 6) {
    return `rgba(24, 119, 242, ${alpha})`
  }

  const red = parseInt(safeHex.slice(0, 2), 16)
  const green = parseInt(safeHex.slice(2, 4), 16)
  const blue = parseInt(safeHex.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function hslToHex(hue, saturation = 72, lightness = 44) {
  const normalizedHue = ((hue % 360) + 360) % 360
  const normalizedSaturation = saturation / 100
  const normalizedLightness = lightness / 100
  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation
  const x = chroma * (1 - Math.abs(((normalizedHue / 60) % 2) - 1))
  const match = normalizedLightness - chroma / 2
  const [red, green, blue] =
    normalizedHue < 60
      ? [chroma, x, 0]
      : normalizedHue < 120
        ? [x, chroma, 0]
        : normalizedHue < 180
          ? [0, chroma, x]
          : normalizedHue < 240
            ? [0, x, chroma]
            : normalizedHue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x]

  return [red, green, blue]
    .map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0'))
    .join('')
    .replace(/^/, '#')
}

function getConversationDeletionField(conversation, userId) {
  if (!conversation || !userId) return null

  if (conversation.participant_one_id === userId) {
    return 'participant_one_deleted_at'
  }

  if (conversation.participant_two_id === userId) {
    return 'participant_two_deleted_at'
  }

  return null
}

function getConversationDeletedAt(conversation, userId) {
  if (isGroupConversation(conversation)) {
    return conversation?.group_cleared_at || null
  }

  const field = getConversationDeletionField(conversation, userId)
  return field ? conversation?.[field] || null : null
}

function getConversationActivityTime(conversation) {
  if (!conversation) return 0

  const activityAt =
    conversation.last_message_at ||
    conversation.updated_at ||
    conversation.created_at

  return activityAt ? new Date(activityAt).getTime() : 0
}

function isConversationVisibleForUser(conversation, userId) {
  const deletedAt = getConversationDeletedAt(conversation, userId)

  if (!deletedAt) return true

  const lastActivityAt = getConversationActivityTime(conversation)

  if (!lastActivityAt) return false

  return lastActivityAt > new Date(deletedAt).getTime()
}

function sortConversationsByActivity(conversations = []) {
  return [...conversations].sort(
    (firstItem, secondItem) =>
      getConversationActivityTime(secondItem) - getConversationActivityTime(firstItem)
  )
}

function sortMessageRowsWithSettings(rows = [], settings = DEFAULT_MESSAGE_SETTINGS, presenceByUserId = {}) {
  const orderedRows = [...rows]

  if (!settings.smartInboxSorting && !settings.keepPinnedFirst) {
    return sortConversationsByActivity(orderedRows)
  }

  return orderedRows.sort((firstItem, secondItem) => {
    if (settings.keepPinnedFirst && Boolean(firstItem.is_pinned) !== Boolean(secondItem.is_pinned)) {
      return firstItem.is_pinned ? -1 : 1
    }

    if (settings.smartInboxSorting) {
      const firstUnread = firstItem.unread_count || 0
      const secondUnread = secondItem.unread_count || 0

      if (Boolean(firstUnread) !== Boolean(secondUnread)) {
        return firstUnread ? -1 : 1
      }

      const firstOnline = firstItem.presence?.is_online || presenceByUserId[firstItem.other_user_id]?.is_online
      const secondOnline = secondItem.presence?.is_online || presenceByUserId[secondItem.other_user_id]?.is_online

      if (Boolean(firstOnline) !== Boolean(secondOnline)) {
        return firstOnline ? -1 : 1
      }
    }

    return getConversationActivityTime(secondItem) - getConversationActivityTime(firstItem)
  })
}

function normalizeConversationSearch(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeChatFolderName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 22)
}

function normalizeChatFolderAssignments(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.entries(value).reduce((acc, [conversationId, folderIds]) => {
    const safeFolderIds = Array.isArray(folderIds)
      ? [...new Set(folderIds.map(String).filter(Boolean))]
      : []

    if (conversationId && safeFolderIds.length) {
      acc[String(conversationId)] = safeFolderIds
    }

    return acc
  }, {})
}

function normalizeCustomChatFolders(value) {
  if (!Array.isArray(value)) return []

  const usedIds = new Set(DEFAULT_CHAT_FOLDERS.map((folder) => folder.id))
  const usedTitles = new Set(DEFAULT_CHAT_FOLDERS.map((folder) => folder.title.toLowerCase()))

  return value.reduce((folders, folder, index) => {
    const title = normalizeChatFolderName(folder?.title || folder?.name)
    const id = String(folder?.id || `custom-${Date.now()}-${index}`)
    const color = String(folder?.color || CHAT_FOLDER_COLORS[index % CHAT_FOLDER_COLORS.length])

    if (!title || usedIds.has(id) || usedTitles.has(title.toLowerCase())) {
      return folders
    }

    usedIds.add(id)
    usedTitles.add(title.toLowerCase())
    folders.push({
      id,
      title,
      color,
      icon: 'folder-outline',
      assignable: true,
      custom: true,
    })

    return folders
  }, [])
}

function getNextChatFolderColor(customFolders = []) {
  const usedColors = new Set([
    ...DEFAULT_CHAT_FOLDERS.map((folder) => folder.color),
    ...customFolders.map((folder) => folder.color),
  ])

  const paletteColor = CHAT_FOLDER_COLORS.find((color) => !usedColors.has(color))
  if (paletteColor) return paletteColor

  let colorIndex = customFolders.length
  let generatedColor = hslToHex(colorIndex * 47 + 21)

  while (usedColors.has(generatedColor)) {
    colorIndex += 1
    generatedColor = hslToHex(colorIndex * 47 + 21)
  }

  return generatedColor
}

function getConversationFolderIds(assignments, conversationId) {
  return assignments[String(conversationId)] || []
}

function buildRandomRedPacketShares(amount, recipientCount) {
  const safeCount = Math.max(1, Number(recipientCount || 0))
  const totalCents = Math.round(Number(amount || 0) * 100)

  if (totalCents < safeCount) {
    throw new Error('Amount is too small for the selected members.')
  }

  if (safeCount === 1) {
    return [Number((totalCents / 100).toFixed(2))]
  }

  let remainingCents = totalCents
  const shares = []

  for (let index = 0; index < safeCount - 1; index += 1) {
    const remainingMembers = safeCount - index
    const maxShare = remainingCents - (remainingMembers - 1)
    const share = 1 + Math.floor(Math.random() * maxShare)
    shares.push(share)
    remainingCents -= share
  }

  shares.push(remainingCents)

  for (let index = shares.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const currentValue = shares[index]
    shares[index] = shares[swapIndex]
    shares[swapIndex] = currentValue
  }

  return shares.map((cents) => Number((cents / 100).toFixed(2)))
}

function normalizeRentalXIdSearch(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
}

function getConversationSearchText(conversation) {
  const profile = conversation?.other_profile || {}

  return [
    getProfileName(profile, ''),
    profile.display_name,
    profile.email,
    profile.rentalx_id,
    conversation?.last_message,
    conversation?.property_title,
    conversation?.property_location,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function getOtherParticipantId(conversation, currentUserId) {
  if (!conversation || !currentUserId) return null

  return conversation.participant_one_id === currentUserId
    ? conversation.participant_two_id
    : conversation.participant_one_id
}

function collapseConversationRows(conversations, currentUserId) {
  const groupedRows = new Map()

  sortConversationsByActivity(conversations).forEach((conversation) => {
    const otherUserId = getOtherParticipantId(conversation, currentUserId)

    if (!otherUserId) return

    const existingConversation = groupedRows.get(otherUserId)

    if (!existingConversation) {
      groupedRows.set(otherUserId, { ...conversation })
      return
    }

    groupedRows.set(otherUserId, {
      ...existingConversation,
      unread_count:
        (existingConversation.unread_count || 0) + (conversation.unread_count || 0),
      participant_one_deleted_at:
        existingConversation.participant_one_deleted_at || conversation.participant_one_deleted_at,
      participant_two_deleted_at:
        existingConversation.participant_two_deleted_at || conversation.participant_two_deleted_at,
    })
  })

  return [...groupedRows.values()]
}

function sortConversationRowsWithPinned(conversations, pinnedIds) {
  return [...conversations].sort((firstItem, secondItem) => {
    const firstPinned = pinnedIds.has(String(firstItem.id))
    const secondPinned = pinnedIds.has(String(secondItem.id))

    if (firstPinned !== secondPinned) return firstPinned ? -1 : 1

    return getConversationActivityTime(secondItem) - getConversationActivityTime(firstItem)
  })
}

function getMessageDeletionField(message, userId) {
  if (!message || !userId) return null

  if (message.sender_id === userId) {
    return 'deleted_for_sender_at'
  }

  if (message.receiver_id === userId) {
    return 'deleted_for_receiver_at'
  }

  return null
}

function isMessageVisibleForUser(message, userId) {
  const deletionField = getMessageDeletionField(message, userId)

  if (!deletionField) return true

  return !message?.[deletionField]
}

function getMessageReactionField(message, userId) {
  if (!message || !userId) return null

  if (message.sender_id === userId) {
    return 'sender_reaction'
  }

  if (message.receiver_id === userId) {
    return 'receiver_reaction'
  }

  return null
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
  if (message.message_type === 'call') return getCallPresentation(message).title
  return message.body || 'Message'
}

function canForwardMessage(message) {
  if (!message || message.deleted_for_everyone_at) return false
  if (message.message_type === 'call') return false
  if (isRedPacketMessage(message)) return false
  return Boolean(
    String(message.body || '').trim() ||
    message.media_url ||
    isLocationMessage(message) ||
    isContactCardMessage(message)
  )
}

function buildForwardMessagePayload(message) {
  if (!canForwardMessage(message)) return null

  return {
    body: message.body || null,
    message_type: message.message_type || 'text',
    media_url: message.media_url || null,
    media_mime_type: message.media_mime_type || null,
    media_name: message.media_name || null,
    audio_duration_ms: message.audio_duration_ms || null,
  }
}

function getForwardNotificationBody(message) {
  if (isLocationMessage(message)) return 'Forwarded a location'
  if (isContactCardMessage(message)) return 'Forwarded a contact card'
  if (message.message_type === 'image') return 'Forwarded a photo'
  if (message.message_type === 'video') return 'Forwarded a video'
  if (message.message_type === 'voice') return 'Forwarded a voice message'
  if (message.message_type === 'file') return `Forwarded ${message.media_name || 'a file'}`
  return String(message.body || '').trim().slice(0, 120) || 'Forwarded a message'
}

function getConversationSummaryFromMessage(message) {
  if (!message || message.deleted_for_everyone_at) {
    return {
      last_message: null,
      last_message_type: 'text',
      last_message_at: null,
      last_sender_id: null,
    }
  }

  if (message.message_type === 'call') {
    return {
      last_message: getCallPresentation(message).summaryLabel,
      last_message_type: 'call',
      last_message_at: message.created_at,
      last_sender_id: message.sender_id,
    }
  }

  if (isLocationMessage(message)) {
    return {
      last_message: 'Shared location',
      last_message_type: 'file',
      last_message_at: message.created_at,
      last_sender_id: message.sender_id,
    }
  }

  if (isRedPacketMessage(message)) {
    return {
      last_message: 'Red packet',
      last_message_type: 'file',
      last_message_at: message.created_at,
      last_sender_id: message.sender_id,
    }
  }

  if (isContactCardMessage(message)) {
    return {
      last_message: 'Contact card',
      last_message_type: 'file',
      last_message_at: message.created_at,
      last_sender_id: message.sender_id,
    }
  }

  return {
    last_message:
      String(message.body || '').trim() || mediaLabel(message.message_type),
    last_message_type: message.message_type || 'text',
    last_message_at: message.created_at,
    last_sender_id: message.sender_id,
  }
}

async function fetchProfiles(userIds) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))]

  if (uniqueIds.length === 0) return {}

  const { data } = await supabase
    .from('user_profiles')
    .select('user_id, email, display_name, rentalx_id, avatar_url, is_verified')
    .in('user_id', uniqueIds)

  return (data || []).reduce((profilesById, profile) => {
    profilesById[profile.user_id] = profile
    return profilesById
  }, {})
}

function buildContactCardPayload(profile = {}) {
  const userId = profile.user_id || profile.id

  return {
    userId,
    displayName: getProfileName(profile, 'Rental X member'),
    rentalXId: profile.rentalx_id || '',
    avatarUrl: profile.avatar_url || null,
    isVerified: Boolean(profile.is_verified),
  }
}

function getContactSearchText(profile = {}) {
  return [
    getProfileName(profile, ''),
    profile.display_name,
    profile.email,
    profile.rentalx_id,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function MessageSettingsRow({ icon, title, subtitle, value, onValueChange }) {
  const { theme } = useAppSettings()

  return (
    <View
      style={{
        minHeight: 58,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 13,
          backgroundColor: theme.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}
      >
        <Ionicons name={icon} size={17} color={theme.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 2, lineHeight: 15 }} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.border, true: theme.accentSoft }}
        thumbColor={value ? theme.accent : theme.mutedText}
      />
    </View>
  )
}

export default function ChatScreen({ route, navigation, embeddedTabShell = false }) {
  const { theme } = useAppSettings()
  const flatListRef = useRef(null)
  const messageInputRef = useRef(null)
  const conversationSearchInputRef = useRef(null)
  const highlightTimerRef = useRef(null)
  const keyboardScrollTimerRef = useRef(null)
  const suppressAutoScrollUntilRef = useRef(0)
  const handledCapturedAssetNonceRef = useRef(null)
  const handledScanNonceRef = useRef(null)
  const longPressRecordingRef = useRef(false)
  const skipNextMicTapRef = useRef(false)
  const composerFocusAnim = useRef(new Animated.Value(0)).current
  const recordingPulseAnim = useRef(new Animated.Value(0)).current
  const audioRecorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  })
  const recorderState = useAudioRecorderState(audioRecorder)
  const insets = useSafeAreaInsets()
  const { width: windowWidth, height: windowHeight } = useWindowDimensions()
  const routeParams = route.params || EMPTY_ROUTE_PARAMS
  const requestedConversationId = routeParams?.conversationId || routeParams?.openConversationId || null
  const directTarget = useMemo(() => getDirectTarget(routeParams), [routeParams])
  const directProperty = routeParams?.property || null
  const scannedRentalXId = routeParams?.scannedRentalXId || null
  const scannedContactAction = routeParams?.scannedContactAction || 'add-contact'
  const scanNonce = routeParams?.scanNonce || null

  const [currentUser, setCurrentUser] = useState(null)
  const [mode, setMode] = useState(directTarget ? 'chat' : 'list')
  const [conversation, setConversation] = useState(null)
  const [otherUser, setOtherUser] = useState(directTarget)
  const [conversationProperty, setConversationProperty] = useState(directProperty)
  const [messages, setMessages] = useState([])
  const [conversationRows, setConversationRows] = useState([])
  const conversationRowsRef = useRef([])
  const [groupMembers, setGroupMembers] = useState([])
  const [conversationSearchQuery, setConversationSearchQuery] = useState('')
  const [addingContactFromSearch, setAddingContactFromSearch] = useState(false)
  const [quickChatMenuVisible, setQuickChatMenuVisible] = useState(false)
  const [messagingSettingsVisible, setMessagingSettingsVisible] = useState(false)
  const [messageSettings, setMessageSettings] = useState(DEFAULT_MESSAGE_SETTINGS)
  const [customChatFolders, setCustomChatFolders] = useState([])
  const [chatFolderAssignments, setChatFolderAssignments] = useState({})
  const [activeChatFolderId, setActiveChatFolderId] = useState('all')
  const [chatFolderCreatorVisible, setChatFolderCreatorVisible] = useState(false)
  const [chatFolderAssignmentVisible, setChatFolderAssignmentVisible] = useState(false)
  const [newChatFolderName, setNewChatFolderName] = useState('')
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [composerFocused, setComposerFocused] = useState(false)
  const [attachmentPickerVisible, setAttachmentPickerVisible] = useState(false)
  const [attachmentPageIndex, setAttachmentPageIndex] = useState(0)
  const [locationPreview, setLocationPreview] = useState(null)
  const [locationPreviewLoading, setLocationPreviewLoading] = useState(false)
  const [redPacketComposerVisible, setRedPacketComposerVisible] = useState(false)
  const [redPacketAmount, setRedPacketAmount] = useState('')
  const [redPacketWish, setRedPacketWish] = useState('Best wishes')
  const [redPacketPhotoAsset, setRedPacketPhotoAsset] = useState(null)
  const [redPacketTargetMode, setRedPacketTargetMode] = useState('all')
  const [selectedRedPacketMemberIds, setSelectedRedPacketMemberIds] = useState([])
  const [sendingRedPacket, setSendingRedPacket] = useState(false)
  const [redPacketsByMessageId, setRedPacketsByMessageId] = useState({})
  const [openingRedPacketId, setOpeningRedPacketId] = useState(null)
  const [redPacketDetailsId, setRedPacketDetailsId] = useState(null)
  const [contactPickerVisible, setContactPickerVisible] = useState(false)
  const [contactPickerPurpose, setContactPickerPurpose] = useState('share')
  const [contactPickerSearchQuery, setContactPickerSearchQuery] = useState('')
  const [contactPickerContacts, setContactPickerContacts] = useState([])
  const [loadingContactPicker, setLoadingContactPicker] = useState(false)
  const [sendingContactCard, setSendingContactCard] = useState(false)
  const [contactPickerActionLoadingId, setContactPickerActionLoadingId] = useState(null)
  const [forwardTargetMessage, setForwardTargetMessage] = useState(null)
  const [selectedForwardContactIds, setSelectedForwardContactIds] = useState([])
  const [forwardingMessage, setForwardingMessage] = useState(false)
  const [pendingVoiceNote, setPendingVoiceNote] = useState(null)
  const [recordingWaveform, setRecordingWaveform] = useState([])
  const [composerInputHeight, setComposerInputHeight] = useState(COMPOSER_INPUT_MIN_HEIGHT)
  const [openedFromList, setOpenedFromList] = useState(false)
  const [selectedConversationIds, setSelectedConversationIds] = useState([])
  const [replyTarget, setReplyTarget] = useState(null)
  const [highlightedMessageId, setHighlightedMessageId] = useState(null)
  const [activeReactionMessageId, setActiveReactionMessageId] = useState(null)
  const [messageActionTarget, setMessageActionTarget] = useState(null)
  const [mediaViewer, setMediaViewer] = useState({
    visible: false,
    media: [],
    index: 0,
  })
  const [selectedMediaAssets, setSelectedMediaAssets] = useState([])
  const [chatAppearance, setChatAppearance] = useState(null)
  const [linkPreviewsEnabled, setLinkPreviewsEnabled] = useState(true)
  const [linkPreviewsByUrl, setLinkPreviewsByUrl] = useState({})
  const typingTimeoutRef = useRef(null)
  const conversationListLoadingRef = useRef(false)
  const linkPreviewRequestsRef = useRef(new Set())
  const voicePreviewPlayer = useAudioPlayer(pendingVoiceNote?.uri || null, {
    updateInterval: 250,
  })
  const voicePreviewStatus = useAudioPlayerStatus(voicePreviewPlayer)
  const reactionInteractionAtRef = useRef(0)

  const otherUserName = getProfileName(otherUser, 'Rental X member')
  const currentUserName = getUserDisplayName(currentUser) || 'Rental X member'
  const isActiveGroupChat = isGroupConversation(conversation)
  const activeGroupMember = groupMembers.find((member) => member.user_id === currentUser?.id)
  const groupCanSend =
    !isActiveGroupChat ||
    conversation?.group_message_policy !== 'admins' ||
    activeGroupMember?.role === 'admin'
  const eligibleRedPacketMembers = useMemo(
    () =>
      groupMembers.filter(
        (member) =>
          member.user_id &&
          member.user_id !== currentUser?.id &&
          member.status !== 'left' &&
          member.status !== 'removed'
      ),
    [currentUser?.id, groupMembers]
  )
  const groupMemberProfilesById = useMemo(
    () =>
      groupMembers.reduce((profilesById, member) => {
        if (member.user_id) {
          profilesById[member.user_id] = {
            id: member.user_id,
            user_id: member.user_id,
            ...(member.profile || {}),
          }
        }

        return profilesById
      }, {}),
    [groupMembers]
  )
  const currentUserGroupProfile = useMemo(() => {
    if (!currentUser?.id) return null

    return {
      id: currentUser.id,
      user_id: currentUser.id,
      display_name: currentUserName,
      avatar_url: getUserAvatarUrl(currentUser),
      email: currentUser.email,
    }
  }, [currentUser, currentUserName])
  const canSend = Boolean(
    currentUser?.id &&
    conversation?.id &&
    groupCanSend &&
    (isActiveGroupChat || otherUser?.id)
  )
  const messageLookup = useMemo(
    () =>
      messages.reduce((itemsById, message) => {
        itemsById[message.id] = message
        return itemsById
      }, {}),
    [messages]
  )
  const messageIndexLookup = useMemo(
    () =>
      messages.reduce((itemsById, message, index) => {
        itemsById[message.id] = index
        return itemsById
      }, {}),
    [messages]
  )
  const {
    presenceByUserId,
    setPresenceByUserId,
    updateMyPresence,
    getChatStatusText,
  } = useChatPresence({
    currentUserId: currentUser?.id,
    mode,
    conversationId: conversation?.id,
    otherUserId: isActiveGroupChat ? null : otherUser?.id,
  })

  const activeColorPreset = resolveChatColorPreset(chatAppearance?.colorPresetId)
  const activeWallpaperPreset = resolveChatWallpaperPreset(chatAppearance?.wallpaperPresetId)

  function shouldSuppressAutoScroll() {
    return Date.now() < suppressAutoScrollUntilRef.current
  }

  function scrollToBottom(animated = true) {
    if (shouldSuppressAutoScroll()) return

    flatListRef.current?.scrollToEnd({ animated })
  }

  function suppressAutoScroll(durationMs = 1400) {
    suppressAutoScrollUntilRef.current = Date.now() + durationMs
  }

  function scheduleKeyboardAwareScroll(delayMs = 0) {
    if (keyboardScrollTimerRef.current) {
      clearTimeout(keyboardScrollTimerRef.current)
    }

    keyboardScrollTimerRef.current = setTimeout(() => {
      scrollToBottom(true)
    }, delayMs)
  }

  async function sendRedPacketReminderNotifications(packets = []) {
    if (!currentUser?.id) return

    const now = Date.now()
    const reminderRows = []

    packets.forEach((packet) => {
      if (packet.sender_id !== currentUser.id || !packet.recipients?.length) return

      packet.recipients.forEach((recipient) => {
        if (!recipient?.id || !recipient.user_id || recipient.opened_at) return

        const lastReminderAt = recipient.last_reminded_at || packet.created_at
        const lastReminderTime = lastReminderAt ? new Date(lastReminderAt).getTime() : now

        if (now - lastReminderTime < RED_PACKET_REMINDER_INTERVAL_MS) return

        reminderRows.push({ packet, recipient })
      })
    })

    if (!reminderRows.length) return

    await Promise.all(
      reminderRows.slice(0, 25).map(async ({ packet, recipient }) => {
        const remindedAt = new Date().toISOString()

        await sendPushToUser({
          recipientId: recipient.user_id,
          title: 'Unopened red packet',
          body: `${currentUserName} sent you ${formatCurrencyAmount(recipient.amount, recipient.currency || packet.currency || 'BDT')}. Tap to open it.`,
          data: {
            type: 'red_packet_reminder',
            conversationId: packet.conversation_id,
            messageId: packet.message_id,
            redPacketId: packet.id,
            actorId: currentUser.id,
            actorName: currentUserName,
          },
        }).catch(() => null)

        await supabase
          .from('chat_red_packet_recipients')
          .update({ last_reminded_at: remindedAt })
          .eq('id', recipient.id)
          .catch(() => null)
      })
    )
  }

  async function loadRedPacketsForMessages(messageRows = [], currentUserId = null) {
    const redPacketMessageIds = messageRows
      .filter((message) => isRedPacketMessage(message))
      .map((message) => message.id)
      .filter(Boolean)

    if (redPacketMessageIds.length === 0) {
      setRedPacketsByMessageId({})
      return
    }

    const { data: packets, error } = await supabase
      .from('chat_red_packets')
      .select('*')
      .in('message_id', redPacketMessageIds)

    if (error) {
      setRedPacketsByMessageId({})
      return
    }

    const packetIds = (packets || []).map((packet) => packet.id)
    let entriesByPacketId = {}
    let recipientsByPacketId = {}

    if (packetIds.length > 0) {
      const { data: entries } = await supabase
        .from('wallet_entries')
        .select('id, user_id, red_packet_id, amount, currency, source, created_at')
        .in('red_packet_id', packetIds)

      entriesByPacketId = (entries || []).reduce((itemsByPacketId, entry) => {
        if (entry.source === 'red_packet_received' || entry.source === 'red_packet') {
          if (!itemsByPacketId[entry.red_packet_id]) {
            itemsByPacketId[entry.red_packet_id] = []
          }
          itemsByPacketId[entry.red_packet_id].push(entry)
        }
        return itemsByPacketId
      }, {})

      const { data: recipients, error: recipientsError } = await supabase
        .from('chat_red_packet_recipients')
        .select('id, red_packet_id, user_id, amount, currency, opened_at, wallet_entry_id, last_reminded_at, created_at')
        .in('red_packet_id', packetIds)

      if (!recipientsError) {
        const recipientUserIds = [...new Set((recipients || []).map((recipient) => recipient.user_id).filter(Boolean))]
        let profilesById = {}

        if (recipientUserIds.length) {
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('user_id, email, display_name, rentalx_id, avatar_url, is_verified')
            .in('user_id', recipientUserIds)

          profilesById = (profiles || []).reduce((itemsById, profile) => {
            itemsById[profile.user_id] = profile
            return itemsById
          }, {})
        }

        recipientsByPacketId = (recipients || []).reduce((itemsByPacketId, recipient) => {
          if (!itemsByPacketId[recipient.red_packet_id]) {
            itemsByPacketId[recipient.red_packet_id] = []
          }

          itemsByPacketId[recipient.red_packet_id].push({
            ...recipient,
            profile: profilesById[recipient.user_id] || null,
          })
          return itemsByPacketId
        }, {})
      }
    }

    const nextPackets = (packets || []).reduce((itemsByMessageId, packet) => {
      const packetEntries = entriesByPacketId[packet.id] || []
      const packetRecipients = recipientsByPacketId[packet.id] || []
      const myRecipient = packetRecipients.find((recipient) => recipient.user_id === currentUserId) || null
      const openedEntry =
        packetEntries.find((entry) => entry.user_id === currentUserId) ||
        packetEntries[0] ||
        null
      const openedRecipients = packetRecipients
        .filter((recipient) => recipient.opened_at || recipient.wallet_entry_id)
        .map((recipient) => ({
          ...recipient,
          openedEntry: packetEntries.find((entry) => entry.user_id === recipient.user_id) || null,
        }))
      const recipientCount = packetRecipients.length || packet.recipient_count || 1
      const openedCount = packetRecipients.length
        ? openedRecipients.length
        : openedEntry
          ? 1
          : 0
      const openedByMe = myRecipient
        ? Boolean(myRecipient.opened_at || packetEntries.find((entry) => entry.user_id === currentUserId))
        : Boolean(openedEntry && openedEntry.user_id === currentUserId)

      itemsByMessageId[packet.message_id] = {
        ...packet,
        recipients: packetRecipients,
        myRecipient,
        openedRecipients,
        recipientCount,
        openedCount,
        allOpened: openedCount >= recipientCount,
        claimAmount: myRecipient?.amount || packet.amount,
        opened: openedByMe,
        openedEntry,
        creditedToMe: openedByMe,
      }
      return itemsByMessageId
    }, {})

    setRedPacketsByMessageId(nextPackets)
    sendRedPacketReminderNotifications(Object.values(nextPackets)).catch(() => {})
  }

  const loadMessages = useCallback(async (
    conversationId,
    currentUserId,
    showLoader = false,
    activeConversation = null
  ) => {
    if (!conversationId) return

    if (showLoader) {
      setLoading(true)
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(250)

    if (error) {
      if (showLoader) {
        Alert.alert('Database update needed', error.message)
      }
      setLoading(false)
      return
    }

    const deletedAt = getConversationDeletedAt(activeConversation, currentUserId)
    const visibleMessages = (deletedAt
      ? (data || []).filter(
        (item) => new Date(item.created_at).getTime() > new Date(deletedAt).getTime()
      )
      : (data || [])
    ).filter((item) => isMessageVisibleForUser(item, currentUserId))

    setMessages(visibleMessages)
    loadRedPacketsForMessages(visibleMessages, currentUserId).catch(() => {
      setRedPacketsByMessageId({})
    })

    if (currentUserId) {
      const readAt = new Date().toISOString()

      if (isGroupConversation(activeConversation)) {
        await supabase
          .from('chat_group_members')
          .update({ last_read_at: readAt })
          .eq('conversation_id', conversationId)
          .eq('user_id', currentUserId)
      } else {
        await supabase
          .from('chat_messages')
          .update({ seen_at: readAt })
          .eq('conversation_id', conversationId)
          .eq('receiver_id', currentUserId)
          .is('seen_at', null)
      }
    }

    if (showLoader) {
      setLoading(false)
    }
  }, [])

  const loadConversationList = useCallback(async (user) => {
    if (conversationListLoadingRef.current) return

    if (!user?.id) {
      conversationRowsRef.current = []
      setConversationRows([])
      setLoading(false)
      return
    }

    conversationListLoadingRef.current = true

    if (!conversationRowsRef.current.length) {
      setLoading(true)
    }

    try {
      const { data, error } = await supabase
        .from('chat_conversations')
        .select('*')
        .or(`participant_one_id.eq.${user.id},participant_two_id.eq.${user.id}`)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })

      if (error) {
        Alert.alert('Database update needed', error.message)
        return
      }

      const directRows = (data || []).filter((item) => !isGroupConversation(item))
      let groupRows = []
      let groupMembershipByConversationId = {}
      let groupMemberCountsByConversationId = {}
      let groupMemberIdsByConversationId = {}
      let groupUnreadCountsByConversationId = {}

    try {
      const { data: memberships, error: membershipError } = await supabase
        .from('chat_group_members')
        .select('conversation_id, role, status, last_read_at, cleared_at')
        .eq('user_id', user.id)
        .eq('status', 'active')

      if (!membershipError && memberships?.length) {
        groupMembershipByConversationId = memberships.reduce((itemsById, membership) => {
          itemsById[membership.conversation_id] = membership
          return itemsById
        }, {})

        const groupIds = [...new Set(memberships.map((membership) => membership.conversation_id).filter(Boolean))]

        if (groupIds.length) {
          const [groupsResponse, membersResponse, messagesResponse] = await Promise.all([
            supabase
              .from('chat_conversations')
              .select('*')
              .in('id', groupIds)
              .eq('conversation_type', 'group')
              .order('last_message_at', { ascending: false, nullsFirst: false })
              .order('created_at', { ascending: false }),
            supabase
              .from('chat_group_members')
              .select('conversation_id, user_id')
              .in('conversation_id', groupIds)
              .eq('status', 'active'),
            supabase
              .from('chat_messages')
              .select('conversation_id, sender_id, created_at')
              .in('conversation_id', groupIds)
              .order('created_at', { ascending: false })
              .limit(1000),
          ])
          const { data: fetchedGroups, error: groupError } = groupsResponse

          if (!groupError) {
            groupRows = fetchedGroups || []
          }

          const memberCountRows = membersResponse.data || []
          groupMemberCountsByConversationId = (memberCountRows || []).reduce((itemsById, member) => {
            itemsById[member.conversation_id] = (itemsById[member.conversation_id] || 0) + 1
            return itemsById
          }, {})
          groupMemberIdsByConversationId = (memberCountRows || []).reduce((itemsById, member) => {
            if (!member.user_id) return itemsById

            if (!itemsById[member.conversation_id]) {
              itemsById[member.conversation_id] = []
            }

            itemsById[member.conversation_id].push(member.user_id)
            return itemsById
          }, {})

          const groupMessageRows = messagesResponse.data || []
          groupUnreadCountsByConversationId = (groupMessageRows || []).reduce((itemsById, message) => {
            if (message.sender_id === user.id) return itemsById

            const membership = groupMembershipByConversationId[message.conversation_id] || {}
            const unreadAfter = [membership.last_read_at, membership.cleared_at]
              .filter(Boolean)
              .sort()
              .pop()

            if (unreadAfter && new Date(message.created_at).getTime() <= new Date(unreadAfter).getTime()) {
              return itemsById
            }

            itemsById[message.conversation_id] = (itemsById[message.conversation_id] || 0) + 1
            return itemsById
          }, {})
        }
      }
    } catch (_error) {
      groupRows = []
    }

      const directVisibleRows = directRows.filter((item) => isConversationVisibleForUser(item, user.id))
      const groupVisibleRows = groupRows
      .map((item) => ({
        ...item,
        group_cleared_at: groupMembershipByConversationId[item.id]?.cleared_at || null,
        my_group_role: groupMembershipByConversationId[item.id]?.role || 'member',
      }))
      .filter((item) => isConversationVisibleForUser(item, user.id))

    const otherIds = directVisibleRows.map((item) =>
      item.participant_one_id === user.id
        ? item.participant_two_id
        : item.participant_one_id
    )
    const groupPreviewProfileIds = Object.values(groupMemberIdsByConversationId)
      .flat()
      .filter(Boolean)
    const [
      profilesById,
      presenceResponse,
      unreadResponse,
      pinnedIds,
      mutedIds,
    ] = await Promise.all([
      fetchProfiles([...otherIds, ...groupPreviewProfileIds]),
      otherIds.length > 0
        ? supabase
            .from('user_presence')
            .select('user_id, is_online, last_seen_at')
            .in('user_id', otherIds)
        : Promise.resolve({ data: [], error: null }),
      (data || []).length > 0
        ? supabase
            .from('chat_messages')
            .select('conversation_id')
            .eq('receiver_id', user.id)
            .is('seen_at', null)
        : Promise.resolve({ data: [] }),
      getPinnedConversationIds(),
      getMutedConversationIds(),
    ])
    const presenceById = presenceResponse.error
      ? {}
      : (presenceResponse.data || []).reduce((acc, row) => {
          acc[row.user_id] = row
          return acc
        }, {})

    setPresenceByUserId(presenceById)
    const unreadCountsByConversation = {}

    ; (unreadResponse.data || []).forEach((message) => {
      unreadCountsByConversation[message.conversation_id] =
        (unreadCountsByConversation[message.conversation_id] || 0) + 1
    })

    const directHydratedRows = directVisibleRows.map((item) => {
      const otherId =
        item.participant_one_id === user.id
          ? item.participant_two_id
          : item.participant_one_id

      return {
        ...item,
        other_user_id: otherId,
        other_profile: {
          id: otherId,
          ...(profilesById[otherId] || { user_id: otherId }),
        },
        presence: presenceById[otherId] || null,
        unread_count: unreadCountsByConversation[item.id] || 0,
      }
    })
    const groupHydratedRows = groupVisibleRows.map((item) => ({
      ...item,
      is_group: true,
      other_user_id: null,
      other_profile: buildGroupProfile(item),
      presence: null,
      unread_count: groupUnreadCountsByConversationId[item.id] || 0,
      group_member_count: groupMemberCountsByConversationId[item.id] || 0,
      group_preview_profiles: (groupMemberIdsByConversationId[item.id] || [])
        .slice(0, 4)
        .map((memberId) => ({
          id: memberId,
          user_id: memberId,
          ...(profilesById[memberId] || {}),
        })),
    }))
    const hydratedRows = [
      ...collapseConversationRows(directHydratedRows, user.id),
      ...groupHydratedRows,
    ]
    const collapsedRows = hydratedRows.map((item) => ({
      ...item,
      is_pinned: pinnedIds.has(String(item.id)),
      is_muted: mutedIds.has(String(item.id)),
    }))

      const nextConversationRows = sortConversationRowsWithPinned(collapsedRows, pinnedIds)
      conversationRowsRef.current = nextConversationRows
      setConversationRows(nextConversationRows)
      setSelectedConversationIds((current) =>
        current.filter((id) => hydratedRows.some((item) => item.id === id))
      )
    } catch (error) {
      console.warn('Conversation list refresh failed:', error?.message || error)
    } finally {
      conversationListLoadingRef.current = false
      setLoading(false)
    }
  }, [])

  const getOrCreateConversation = useCallback(async (user, targetUser, property) => {
    if (!user?.id || !targetUser?.id) return null

    const participantIds = [user.id, targetUser.id].sort()
    const propertyId = getPropertyId(property)
    const { data: existingConversations, error: lookupError } = await supabase
      .from('chat_conversations')
      .select('*')
      .eq('participant_one_id', participantIds[0])
      .eq('participant_two_id', participantIds[1])
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })

    if (lookupError) throw lookupError

    const directConversations = (existingConversations || []).filter(
      (item) => !isGroupConversation(item)
    )

    if (directConversations.length) {
      const visibleConversation = directConversations.find((item) =>
        isConversationVisibleForUser(item, user.id)
      )

      return visibleConversation || directConversations[0]
    }

    const { data: createdConversation, error: createError } = await supabase
      .from('chat_conversations')
      .insert({
        participant_one_id: participantIds[0],
        participant_two_id: participantIds[1],
        property_id: propertyId,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single()

    if (createError) throw createError

    return createdConversation
  }, [])

  const openConversation = useCallback(async ({ item, profile, fromList = false }) => {
    const isGroup = isGroupConversation(item)

    setSelectedConversationIds([])
    setOpenedFromList(fromList)
    setMode('chat')
    setConversation(item)
    setOtherUser(isGroup ? buildGroupProfile(item) : profile)
    setConversationProperty(null)
    setGroupMembers([])
    setReplyTarget(null)

    if (isGroup) {
      try {
        const members = await fetchGroupMembers(item.id)
        setGroupMembers(members)
      } catch (_error) {
        setGroupMembers([])
      }
    }

    await loadMessages(item.id, currentUser?.id, true, item)
  }, [currentUser?.id, loadMessages])

  async function findProfileByRentalXId(rawRentalXId) {
    const rentalXId = normalizeRentalXIdSearch(rawRentalXId)

    if (!rentalXId) return null

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('user_id, email, display_name, rentalx_id, avatar_url, is_verified')
      .eq('rentalx_id', rentalXId)
      .maybeSingle()

    if (error) throw error

    if (!profile?.user_id) {
      Alert.alert('Contact not found', 'No user found with this Rental X ID.')
      return null
    }

    if (profile.user_id === currentUser?.id) {
      Alert.alert('That is your ID', 'Enter another user Rental X ID.')
      return null
    }

    return {
      id: profile.user_id,
      ...profile,
    }
  }

  async function openDirectChatWithProfile(profile) {
    const targetUserId = profile?.id || profile?.user_id

    if (!currentUser?.id || !targetUserId) return

    if (targetUserId === currentUser.id) {
      Alert.alert('That is your ID', 'Choose another contact.')
      return
    }

    const targetProfile = {
      id: targetUserId,
      user_id: targetUserId,
      ...profile,
    }
    const nextConversation = await getOrCreateConversation(currentUser, targetProfile, null)

    await loadConversationList(currentUser)
    setContactPickerVisible(false)
    setContactPickerSearchQuery('')
    setConversationSearchQuery('')
    setSelectedConversationIds([])
    setOpenedFromList(true)
    setMode('chat')
    setConversation(nextConversation)
    setOtherUser(targetProfile)
    setConversationProperty(null)
    setGroupMembers([])
    setReplyTarget(null)
    await loadMessages(nextConversation.id, currentUser.id, true, nextConversation)
  }

  async function addContactProfile(profile, options = {}) {
    const targetUserId = profile?.id || profile?.user_id
    const { showSuccess = true } = options

    if (!currentUser?.id || !targetUserId || contactPickerActionLoadingId) return false

    if (targetUserId === currentUser.id) {
      Alert.alert('That is your ID', 'Choose another contact.')
      return false
    }

    try {
      setContactPickerActionLoadingId(targetUserId)

      let alreadyAdded = false
      const { error } = await supabase
        .from('user_follows')
        .insert({
          follower_id: currentUser.id,
          following_id: targetUserId,
        })

      if (error) {
        alreadyAdded =
          error.code === '23505' ||
          /duplicate key|already exists/i.test(String(error.message || ''))

        if (!alreadyAdded) throw error
      }

      setContactPickerContacts((current) =>
        current.map((contact) =>
          (contact.id || contact.user_id) === targetUserId
            ? { ...contact, is_following: true }
            : contact
        )
      )

      if (!alreadyAdded) {
        sendPushToUser({
          recipientId: targetUserId,
          title: 'New contact',
          body: `${currentUserName} added you as a contact`,
          data: {
            type: 'user_follow',
            actorId: currentUser.id,
            actorName: currentUserName,
            eventKey: `user_follow:${targetUserId}:${currentUser.id}`,
          },
        })
      }

      if (showSuccess) {
        Alert.alert(
          alreadyAdded ? 'Already in contacts' : 'Contact added',
          alreadyAdded ? 'This user is already in your contacts.' : 'This user is now in your contacts.'
        )
      }

      return true
    } catch (error) {
      const message = /row level security|policy/i.test(String(error?.message || ''))
        ? 'Supabase blocked this contact add. Run the latest supabase-owner-profile-features.sql, then try again.'
        : error?.message || 'Could not add this contact.'

      Alert.alert('Add contact failed', message)
      return false
    } finally {
      setContactPickerActionLoadingId(null)
    }
  }

  async function isContactAlreadyAdded(profile) {
    const targetUserId = profile?.id || profile?.user_id

    if (!currentUser?.id || !targetUserId) return false

    const { data, error } = await supabase
      .from('user_follows')
      .select('id')
      .eq('follower_id', currentUser.id)
      .eq('following_id', targetUserId)
      .maybeSingle()

    if (error) throw error

    return Boolean(data?.id)
  }

  async function startContactFromRentalXId(rawRentalXId = conversationSearchQuery) {
    if (addingContactFromSearch) return

    if (!currentUser?.id) {
      Alert.alert('Login needed', 'Please login to add a contact.')
      return
    }

    try {
      setAddingContactFromSearch(true)

      const profile = await findProfileByRentalXId(rawRentalXId)

      if (!profile) return

      await openDirectChatWithProfile(profile)
    } catch (error) {
      Alert.alert('Chat failed', error?.message || 'Could not start this chat.')
    } finally {
      setAddingContactFromSearch(false)
    }
  }

  const openContactCard = useCallback(async (contact) => {
    const contactUserId = contact?.userId || contact?.user_id || contact?.id

    if (!contactUserId || !currentUser?.id) return

    if (contactUserId === currentUser.id) {
      Alert.alert('Your contact', 'This is your Rental X contact card.')
      return
    }

    try {
      const profilesById = await fetchProfiles([contactUserId])
      const targetProfile = {
        id: contactUserId,
        user_id: contactUserId,
        display_name: contact.displayName,
        rentalx_id: contact.rentalXId,
        avatar_url: contact.avatarUrl,
        is_verified: contact.isVerified,
        ...(profilesById[contactUserId] || {}),
      }
      const nextConversation = await getOrCreateConversation(currentUser, targetProfile, null)

      await loadConversationList(currentUser)
      setSelectedConversationIds([])
      setOpenedFromList(true)
      setMode('chat')
      setConversation(nextConversation)
      setOtherUser(targetProfile)
      setConversationProperty(null)
      setGroupMembers([])
      setReplyTarget(null)
      await loadMessages(nextConversation.id, currentUser.id, true, nextConversation)
    } catch (error) {
      Alert.alert('Chat unavailable', error?.message || 'Could not open this contact.')
    }
  }, [currentUser, getOrCreateConversation, loadConversationList, loadMessages])

  const initializeChat = useCallback(async () => {
    if (!conversationRowsRef.current.length) {
      setLoading(true)
    }

    const user = await getCachedAuthUser()

    setCurrentUser(user)

    if (!user) {
      setLoading(false)
      return
    }

    if (requestedConversationId) {
      try {
        const { data: requestedConversation, error: requestedConversationError } = await supabase
          .from('chat_conversations')
          .select('*')
          .eq('id', requestedConversationId)
          .single()

        if (requestedConversationError) throw requestedConversationError

        const isGroup = isGroupConversation(requestedConversation)

        if (isGroup) {
          const members = await fetchGroupMembers(requestedConversation.id)
          const currentMember = members.find((member) => member.user_id === user.id)
          const nextConversation = {
            ...requestedConversation,
            group_cleared_at: currentMember?.cleared_at || null,
            my_group_role: currentMember?.role || 'member',
          }

          setOpenedFromList(true)
          setMode('chat')
          setConversation(nextConversation)
          setOtherUser(buildGroupProfile(requestedConversation))
          setConversationProperty(null)
          setGroupMembers(members)
          setReplyTarget(null)
          await loadMessages(requestedConversation.id, user.id, true, nextConversation)
          return
        }

        const otherId = getOtherParticipantId(requestedConversation, user.id)

        if (!otherId || otherId === user.id) {
          throw new Error('This chat is unavailable.')
        }

        const profilesById = await fetchProfiles([otherId])
        const targetProfile = {
          id: otherId,
          ...(profilesById[otherId] || { user_id: otherId }),
        }

        setOpenedFromList(true)
        setMode('chat')
        setConversation(requestedConversation)
        setOtherUser(targetProfile)
        setConversationProperty(directProperty)
        setGroupMembers([])
        setReplyTarget(null)
        await loadMessages(requestedConversation.id, user.id, true, requestedConversation)
        return
      } catch (error) {
        Alert.alert('Chat unavailable', error.message)
        setLoading(false)
        return
      }
    }

    if (!directTarget?.id) {
      setMode('list')
      setConversation(null)
      setOtherUser(null)
      setGroupMembers([])
      await loadConversationList(user)
      return
    }

    if (directTarget.id === user.id) {
      setMode('list')
      setGroupMembers([])
      await loadConversationList(user)
      return
    }

    try {
      const profilesById = await fetchProfiles([directTarget.id])
      const hydratedTarget = {
        ...directTarget,
        ...(profilesById[directTarget.id] || {}),
      }
      const nextConversation = await getOrCreateConversation(
        user,
        hydratedTarget,
        directProperty
      )

      setOpenedFromList(false)
      setMode('chat')
      setOtherUser(hydratedTarget)
      setConversationProperty(directProperty)
      setConversation(nextConversation)
      setGroupMembers([])
      setReplyTarget(null)
      await loadMessages(nextConversation.id, user.id, true, nextConversation)
    } catch (error) {
      Alert.alert('Chat unavailable', error.message)
      setLoading(false)
    }
  }, [
    directProperty,
    directTarget,
    getOrCreateConversation,
    loadConversationList,
    loadMessages,
    requestedConversationId,
  ])

  useEffect(() => {
    initializeChat()
  }, [initializeChat])

  useEffect(() => {
    let isMounted = true

    async function loadMessageSettings() {
      try {
        const rawValue = await AsyncStorage.getItem(MESSAGE_SETTINGS_STORAGE_KEY)
        const savedSettings = rawValue ? JSON.parse(rawValue) : {}

        if (isMounted) {
          setMessageSettings({
            ...DEFAULT_MESSAGE_SETTINGS,
            ...(savedSettings && typeof savedSettings === 'object' ? savedSettings : {}),
          })
        }
      } catch (_error) {
        if (isMounted) {
          setMessageSettings(DEFAULT_MESSAGE_SETTINGS)
        }
      }
    }

    loadMessageSettings()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadChatFolders() {
      try {
        const [foldersValue, assignmentsValue] = await Promise.all([
          AsyncStorage.getItem(CHAT_FOLDERS_STORAGE_KEY),
          AsyncStorage.getItem(CHAT_FOLDER_ASSIGNMENTS_STORAGE_KEY),
        ])
        const savedFolders = foldersValue ? JSON.parse(foldersValue) : []
        const savedAssignments = assignmentsValue ? JSON.parse(assignmentsValue) : {}

        if (isMounted) {
          setCustomChatFolders(normalizeCustomChatFolders(savedFolders))
          setChatFolderAssignments(normalizeChatFolderAssignments(savedAssignments))
        }
      } catch (_error) {
        if (isMounted) {
          setCustomChatFolders([])
          setChatFolderAssignments({})
        }
      }
    }

    loadChatFolders()

    return () => {
      isMounted = false
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (mode !== 'chat' || !conversation?.id) return undefined

      let isMounted = true

      getConversationLinkPreviewEnabled(conversation.id)
        .then((enabled) => {
          if (isMounted) {
            setLinkPreviewsEnabled(enabled)
          }
        })
        .catch(() => {
          if (isMounted) {
            setLinkPreviewsEnabled(true)
          }
        })

      return () => {
        isMounted = false
      }
    }, [conversation?.id, mode])
  )

  useEffect(() => {
    if (!linkPreviewsEnabled) return

    const urls = [
      ...new Set(
        messages
          .filter((message) => message.message_type === 'text' && !message.deleted_for_everyone_at)
          .map((message) => extractFirstLink(message.body))
          .filter(Boolean)
      ),
    ]

    urls.forEach((url) => {
      if (linkPreviewsByUrl[url] || linkPreviewRequestsRef.current.has(url)) return

      linkPreviewRequestsRef.current.add(url)
      setLinkPreviewsByUrl((current) => ({
        ...current,
        [url]: {
          url,
          title: getLinkHost(url),
          description: url,
          image: null,
          siteName: getLinkHost(url),
          loading: true,
        },
      }))

      fetchLinkPreview(url)
        .then((preview) => {
          setLinkPreviewsByUrl((current) => ({
            ...current,
            [url]: {
              ...(preview || current[url]),
              loading: false,
            },
          }))
        })
        .catch(() => {
          setLinkPreviewsByUrl((current) => ({
            ...current,
            [url]: {
              url,
              title: getLinkHost(url),
              description: url,
              image: null,
              siteName: getLinkHost(url),
              loading: false,
            },
          }))
        })
    })
  }, [linkPreviewsByUrl, linkPreviewsEnabled, messages])

  useEffect(() => {
    if (!currentUser?.id || !scannedRentalXId) return

    const scanKey = scanNonce || scannedRentalXId

    if (handledScanNonceRef.current === scanKey) return

    handledScanNonceRef.current = scanKey

    async function handleScannedContact() {
      try {
        const profile = await findProfileByRentalXId(scannedRentalXId)

        navigation.setParams?.({
          scannedRentalXId: undefined,
          scannedContactAction: undefined,
          scanNonce: undefined,
        })

        if (!profile) return

        if (scannedContactAction === 'new-chat') {
          await openDirectChatWithProfile(profile)
          return
        }

        setMode('list')
        setConversation(null)
        setOtherUser(null)
        setConversationProperty(null)
        setGroupMembers([])
        const isAlreadyAdded = await isContactAlreadyAdded(profile)

        setContactPickerPurpose('scan-preview')
        setContactPickerVisible(true)
        setContactPickerSearchQuery('')
        setContactPickerContacts([{ ...profile, is_following: isAlreadyAdded }])
      } catch (error) {
        Alert.alert('Scan failed', error?.message || 'Could not use this Rental X ID.')
      }
    }

    handleScannedContact()
  }, [currentUser?.id, scanNonce, scannedContactAction, scannedRentalXId])

  useEffect(() => {
    Animated.timing(composerFocusAnim, {
      toValue: composerFocused ? 1 : 0,
      duration: composerFocused ? 220 : 180,
      useNativeDriver: false,
    }).start()
  }, [composerFocusAnim, composerFocused])

  useEffect(() => {
    if (!recorderState?.isRecording) {
      recordingPulseAnim.stopAnimation()
      recordingPulseAnim.setValue(0)
      return undefined
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(recordingPulseAnim, {
          toValue: 1,
          duration: 760,
          useNativeDriver: false,
        }),
        Animated.timing(recordingPulseAnim, {
          toValue: 0,
          duration: 760,
          useNativeDriver: false,
        }),
      ])
    )

    pulseLoop.start()

    return () => {
      pulseLoop.stop()
      recordingPulseAnim.setValue(0)
    }
  }, [recordingPulseAnim, recorderState?.isRecording])

  useEffect(() => {
    if (!recorderState?.isRecording) return

    setRecordingWaveform((current) => {
      const nextLevel = normalizeMeteringLevel(recorderState?.metering)
      const next = [...current, nextLevel]
      return next.slice(-18)
    })
  }, [recorderState?.isRecording, recorderState?.metering])

  useEffect(() => {
    if (messageText) return

    setComposerInputHeight(COMPOSER_INPUT_MIN_HEIGHT)
  }, [messageText])

  useEffect(() => {
    const capturedAsset = route?.params?.capturedChatAsset
    const captureNonce = route?.params?.capturedChatAssetNonce

    if (!capturedAsset?.uri || !captureNonce) return
    if (handledCapturedAssetNonceRef.current === captureNonce) return

    handledCapturedAssetNonceRef.current = captureNonce

    setSelectedMediaAssets((current) => {
      const nextAsset = {
        ...capturedAsset,
        composerKey:
          capturedAsset.assetId ||
          capturedAsset.id ||
          `${capturedAsset.uri}-${captureNonce}`,
        type: 'image',
      }

      const merged = [...current, nextAsset]
      return merged.slice(0, 5)
    })
  }, [route?.params?.capturedChatAsset, route?.params?.capturedChatAssetNonce])

  const loadAppearance = useCallback(async () => {
    if (!conversation?.id) {
      setChatAppearance(null)
      return
    }

    const nextAppearance = await getChatAppearance(conversation.id)
    setChatAppearance(nextAppearance)
  }, [conversation?.id])

  useEffect(() => {
    loadAppearance()
  }, [loadAppearance])

  useFocusEffect(
    useCallback(() => {
      loadAppearance()
    }, [loadAppearance])
  )

  useFocusEffect(
    useCallback(() => {
      if (mode === 'chat' && conversation?.id && currentUser?.id) {
        loadMessages(conversation.id, currentUser.id, false, conversation)
      }
    }, [conversation, currentUser?.id, loadMessages, mode])
  )

  useFocusEffect(
    useCallback(() => {
      if (mode === 'list' && currentUser?.id) {
        loadConversationList(currentUser)
      }
    }, [currentUser, loadConversationList, mode])
  )

  useEffect(() => {
    if (mode !== 'chat' || !conversation?.id || !currentUser?.id) return undefined

    const refreshMessages = () => {
      loadMessages(conversation.id, currentUser.id, false, conversation)
    }
    const channelName = `chat-messages-${conversation.id}-${Date.now()}-${Math.random()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        refreshMessages
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_red_packet_recipients',
        },
        refreshMessages
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversation?.id, currentUser?.id, loadMessages, mode])

  useEffect(() => {
    if (mode !== 'list' || !currentUser?.id) return undefined

    const refreshList = () => {
      loadConversationList(currentUser)
    }
    const channelName = `chat-list-${currentUser.id}-${Date.now()}-${Math.random()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations',
        },
        refreshList
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
        },
        refreshList
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUser, loadConversationList, mode])

  useEffect(() => {
    if (mode === 'chat' && messages.length > 0) {
      setTimeout(() => scrollToBottom(true), 80)
    }
  }, [messages.length, mode])

  useEffect(() => {
    if (mode !== 'chat') return undefined

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const showSubscription = Keyboard.addListener(showEvent, () => {
      if (!composerFocused) return

      scheduleKeyboardAwareScroll(Platform.OS === 'ios' ? 50 : 90)
    })

    return () => {
      showSubscription.remove()
    }
  }, [composerFocused, mode])

  useEffect(() => {
    return () => {
      if (keyboardScrollTimerRef.current) {
        clearTimeout(keyboardScrollTimerRef.current)
      }

      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current)
      }
    }
  }, [])

  function getGroupMessageReceiverId() {
    const otherMember = groupMembers.find((member) => member.user_id && member.user_id !== currentUser?.id)

    return (
      otherMember?.user_id ||
      (conversation?.participant_one_id === currentUser?.id
        ? conversation?.participant_two_id
        : conversation?.participant_one_id) ||
      null
    )
  }

  async function sendMessage({
    body = '',
    messageType = 'text',
    mediaUrl = null,
    mediaMimeType = null,
    mediaName = null,
    audioDurationMs = null,
    pushRecipientIds = null,
  } = {}) {
    if (isActiveGroupChat && !groupCanSend) {
      Alert.alert('Admins only', 'Only group admins can send messages in this group.')
      return null
    }

    if (!canSend || sending) return

    const cleanBody = body.trim()

    if (!cleanBody && !mediaUrl) return

    const isGroupChat = isActiveGroupChat
    const receiverId = isGroupChat ? getGroupMessageReceiverId() : otherUser?.id

    if (!receiverId || receiverId === currentUser.id) {
      Alert.alert('Message unavailable', 'This chat needs another active member before sending.')
      return
    }

    const replySnapshot = replyTarget || null
    const createdAt = new Date().toISOString()
    const optimisticId = `local-${currentUser.id}-${Date.now()}`
    const optimisticMessage = {
      id: optimisticId,
      conversation_id: conversation.id,
      sender_id: currentUser.id,
      receiver_id: receiverId,
      body: cleanBody || null,
      media_url: mediaUrl,
      media_mime_type: mediaMimeType,
      media_name: mediaName,
      audio_duration_ms: audioDurationMs,
      message_type: messageType,
      reply_to_message_id: replySnapshot?.id || null,
      created_at: createdAt,
      updated_at: createdAt,
      pending_local: true,
    }

    setMessages((current) => [...current, optimisticMessage])
    setMessageText('')
    setReplyTarget(null)
    requestAnimationFrame(() => scrollToBottom(true))
    setSending(true)

    const isSharedLocation =
      mediaMimeType === CHAT_LOCATION_MIME_TYPE
    const isRedPacket =
      mediaMimeType === CHAT_RED_PACKET_MIME_TYPE
    const isContactCard =
      mediaMimeType === CHAT_CONTACT_CARD_MIME_TYPE
    const lastMessage =
      isSharedLocation
        ? 'Shared location'
        : isRedPacket
          ? 'Red packet'
          : isContactCard
            ? 'Contact card'
        : messageType === 'text'
          ? cleanBody
          : mediaLabel(messageType)

    let insertError = null
    let insertedMessage = null
    const basePayload = {
      conversation_id: conversation.id,
      sender_id: currentUser.id,
      receiver_id: receiverId,
      body: cleanBody || null,
      media_url: mediaUrl,
      media_mime_type: mediaMimeType,
      media_name: mediaName,
      audio_duration_ms: audioDurationMs,
      reply_to_message_id: replySnapshot?.id || null,
      created_at: createdAt,
      updated_at: createdAt,
    }

    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        ...basePayload,
        message_type: messageType,
      })
      .select('*')
      .single()

    insertedMessage = data
    insertError = error

    if (insertError && messageType === 'file' && !isSharedLocation && !isRedPacket && !isContactCard) {
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('chat_messages')
        .insert({
          ...basePayload,
          message_type: 'text',
        })
        .select('*')
        .single()
      insertedMessage = fallbackData
      insertError = fallbackError
    }

    if (insertError) {
      setMessages((current) => current.filter((item) => item.id !== optimisticId))
      setMessageText((current) => (current ? current : cleanBody))
      setReplyTarget((current) => current || replySnapshot)
      Alert.alert('Message failed', insertError.message)
      setSending(false)
      return null
    }

    if (insertedMessage) {
      setMessages((current) =>
        current.map((item) =>
          item.id === optimisticId
            ? {
              ...insertedMessage,
              pending_local: false,
            }
            : item
        )
      )
    }

    const conversationUpdate = {
      last_message: lastMessage,
      last_message_type: messageType,
      last_message_at: createdAt,
      last_sender_id: currentUser.id,
      updated_at: createdAt,
    }
    const deletionField = getConversationDeletionField(conversation, currentUser.id)

    if (deletionField) {
      conversationUpdate[deletionField] = null
    }

    await supabase
      .from('chat_conversations')
      .update(conversationUpdate)
      .eq('id', conversation.id)

    const notificationBody =
      isSharedLocation
        ? 'Shared a location'
        : isRedPacket
          ? 'Sent a red packet'
          : isContactCard
            ? 'Sent a contact card'
        : messageType === 'text'
          ? cleanBody.slice(0, 120)
          : `Sent a ${mediaLabel(messageType).toLowerCase()}`
    const pushPayload = {
      type: 'chat_message',
      actorId: currentUser.id,
      actorName: currentUserName,
      actorAvatarUrl: getUserAvatarUrl(currentUser),
      propertyId: getPropertyId(conversationProperty) || conversation.property_id,
      propertyTitle: conversationProperty?.title || '',
      conversationId: conversation.id,
      messageType,
      createdAt,
    }

    if (isGroupChat) {
      const recipients = Array.isArray(pushRecipientIds)
        ? [...new Set(pushRecipientIds.filter((memberId) => memberId && memberId !== currentUser.id))]
        : groupMembers
          .map((member) => member.user_id)
          .filter((memberId) => memberId && memberId !== currentUser.id)

      await Promise.all(
        recipients.map((recipientId) =>
          sendPushToUser({
            recipientId,
            title: otherUserName,
            body: `${currentUserName}: ${notificationBody}`,
            data: {
              ...pushPayload,
              isGroup: true,
              groupTitle: otherUserName,
            },
          })
        )
      )
    } else {
      await sendPushToUser({
        recipientId: otherUser.id,
        title: currentUserName,
        body: notificationBody,
        data: pushPayload,
      })
    }

    await updateMyPresence({ online: true, typing: false })
    setSending(false)
    return insertedMessage
  }

  async function sendTextMessage() {
    await sendMessage({ body: messageText })
  }

  async function openMessageContactPicker(purpose = 'new-chat') {
    if (!currentUser?.id) return

    setContactPickerPurpose(purpose)
    setContactPickerVisible(true)
    setContactPickerSearchQuery('')
    setLoadingContactPicker(true)

    try {
      const [followers, following, directConversationResult] = await Promise.all([
        fetchConnections({ userId: currentUser.id, kind: 'followers', currentUserId: currentUser.id }),
        fetchConnections({ userId: currentUser.id, kind: 'following', currentUserId: currentUser.id }),
        supabase
          .from('chat_conversations')
          .select('participant_one_id, participant_two_id, conversation_type')
          .or(`participant_one_id.eq.${currentUser.id},participant_two_id.eq.${currentUser.id}`),
      ])
      const directContactIds = directConversationResult.error
        ? []
        : (directConversationResult.data || [])
          .filter((item) => !isGroupConversation(item))
          .map((item) =>
            item.participant_one_id === currentUser.id
              ? item.participant_two_id
              : item.participant_one_id
          )
      const contactIds = [
        ...followers.map((item) => item.related_user_id),
        ...following.map((item) => item.related_user_id),
        ...directContactIds,
        ...conversationRows.map((row) => row.other_user_id),
        otherUser?.id || otherUser?.user_id,
      ].filter((id) => id && id !== currentUser.id)
      const uniqueContactIds = [...new Set(contactIds)]
      const profilesById = await fetchProfiles(uniqueContactIds)
      const followingIds = new Set(following.map((item) => item.related_user_id).filter(Boolean))
      const contactsById = {}

      uniqueContactIds.forEach((id) => {
        const profile = profilesById[id]

        if (profile?.user_id || profile?.id) {
          const profileId = profile.user_id || profile.id
          contactsById[profileId] = {
            id: profileId,
            ...profile,
            is_following: followingIds.has(profileId),
          }
        }
      })

      setContactPickerContacts(Object.values(contactsById))
    } catch (error) {
      Alert.alert('Contacts unavailable', error?.message || 'Could not load contacts.')
    } finally {
      setLoadingContactPicker(false)
    }
  }

  async function openContactCardPicker() {
    if (!currentUser?.id || !conversation?.id) return

    setContactPickerPurpose('share')
    setContactPickerVisible(true)
    setContactPickerSearchQuery('')
    setLoadingContactPicker(true)

    try {
      const contactIds = [
        currentUser.id,
        ...(isActiveGroupChat
          ? groupMembers.map((member) => member.user_id)
          : [otherUser?.id || otherUser?.user_id]),
        ...conversationRows.map((row) => row.other_user_id),
      ].filter(Boolean)
      const profilesById = await fetchProfiles(contactIds)
      const contactsById = {}

      contactIds.forEach((id) => {
        const profile =
          profilesById[id] ||
          (id === currentUser.id
            ? {
                user_id: currentUser.id,
                email: currentUser.email,
                display_name:
                  currentUser.user_metadata?.name ||
                  currentUser.user_metadata?.full_name ||
                  currentUser.email,
                avatar_url: currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture || null,
                is_verified: false,
              }
            : null)

        if (profile?.user_id || profile?.id) {
          const profileId = profile.user_id || profile.id
          contactsById[profileId] = {
            id: profileId,
            ...profile,
          }
        }
      })

      setContactPickerContacts(Object.values(contactsById))
    } catch (error) {
      Alert.alert('Contacts unavailable', error?.message || 'Could not load contacts.')
    } finally {
      setLoadingContactPicker(false)
    }
  }

  async function findContactByRentalXId() {
    const rentalXId = normalizeRentalXIdSearch(contactPickerSearchQuery)

    if (!rentalXId || loadingContactPicker) return

    try {
      setLoadingContactPicker(true)

      const profile = await findProfileByRentalXId(rentalXId)

      if (!profile?.user_id) return

      setContactPickerContacts((current) => {
        const exists = current.some((item) => (item.user_id || item.id) === profile.user_id)
        if (exists) return current
        return [{ id: profile.user_id, ...profile }, ...current]
      })
    } catch (error) {
      Alert.alert('Contact search failed', error?.message || 'Could not find this contact.')
    } finally {
      setLoadingContactPicker(false)
    }
  }

  async function handleContactPickerSelect(contact) {
    if (contactPickerPurpose === 'forward-message') {
      toggleForwardContact(contact)
      return
    }

    if (contactPickerPurpose === 'share') {
      await sendContactCard(contact)
      return
    }

    const contactId = contact?.id || contact?.user_id

    if (!contactId || contactPickerActionLoadingId) return

    try {
      if (contactPickerPurpose === 'add-contact') {
        await addContactProfile(contact)
        return
      }

      if (contactPickerPurpose === 'scan-preview') {
        if (contact.is_following) {
          setContactPickerActionLoadingId(contactId)
          await openDirectChatWithProfile(contact)
          return
        }

        await addContactProfile(contact)
        return
      }

      setContactPickerActionLoadingId(contactId)
      await openDirectChatWithProfile(contact)
    } catch (error) {
      Alert.alert('Contact action failed', error?.message || 'Could not complete this action.')
    } finally {
      setContactPickerActionLoadingId(null)
    }
  }

  async function sendContactCard(profile) {
    if (!profile || sendingContactCard || !canSend) return

    const payload = buildContactCardPayload(profile)

    if (!payload.userId) {
      Alert.alert('Contact unavailable', 'This contact cannot be shared right now.')
      return
    }

    try {
      setSendingContactCard(true)
      await sendMessage({
        body: JSON.stringify(payload),
        messageType: 'file',
        mediaMimeType: CHAT_CONTACT_CARD_MIME_TYPE,
        mediaName: 'Contact card',
      })
      setContactPickerVisible(false)
      setContactPickerSearchQuery('')
    } catch (error) {
      Alert.alert('Share failed', error?.message || 'Could not share this contact.')
    } finally {
      setSendingContactCard(false)
    }
  }

  function toggleForwardContact(contact) {
    const contactId = contact?.id || contact?.user_id

    if (!contactId || forwardingMessage) return

    setSelectedForwardContactIds((current) => {
      if (current.includes(contactId)) {
        return current.filter((id) => id !== contactId)
      }

      if (current.length >= FORWARD_MAX_RECIPIENTS) {
        Alert.alert('Limit reached', `You can forward to up to ${FORWARD_MAX_RECIPIENTS} people at a time.`)
        return current
      }

      return [...current, contactId]
    })
  }

  function closeContactPicker() {
    if (sendingContactCard || forwardingMessage || contactPickerActionLoadingId) return

    setContactPickerVisible(false)
    setContactPickerSearchQuery('')
    setSelectedForwardContactIds([])
    setForwardTargetMessage(null)
  }

  async function openForwardMessagePicker(message) {
    if (!canForwardMessage(message)) {
      Alert.alert('Forward unavailable', 'This message cannot be forwarded.')
      return
    }

    setMessageActionTarget(null)
    setForwardTargetMessage(message)
    setSelectedForwardContactIds([])
    await openMessageContactPicker('forward-message')
  }

  async function sendForwardedMessage() {
    if (!currentUser?.id || !forwardTargetMessage || forwardingMessage) return

    const forwardPayload = buildForwardMessagePayload(forwardTargetMessage)

    if (!forwardPayload) {
      Alert.alert('Forward unavailable', 'This message cannot be forwarded.')
      return
    }

    const targetContacts = contactPickerContacts.filter((contact) =>
      selectedForwardContactIds.includes(contact.id || contact.user_id)
    )

    if (!targetContacts.length) {
      Alert.alert('Choose contacts', 'Select at least one person to forward this message.')
      return
    }

    if (targetContacts.length > FORWARD_MAX_RECIPIENTS) {
      Alert.alert('Too many people', `Select up to ${FORWARD_MAX_RECIPIENTS} people at a time.`)
      return
    }

    setForwardingMessage(true)

    try {
      const baseTime = Date.now()
      const forwardedConversationIds = []

      for (let index = 0; index < targetContacts.length; index += 1) {
        const contact = targetContacts[index]
        const targetUserId = contact.id || contact.user_id

        if (!targetUserId || targetUserId === currentUser.id) continue

        const targetProfile = {
          id: targetUserId,
          user_id: targetUserId,
          ...contact,
        }
        const targetConversation = await getOrCreateConversation(currentUser, targetProfile, null)

        if (!targetConversation?.id) continue

        const createdAt = new Date(baseTime + index * 700).toISOString()
        const { data: insertedMessage, error: insertError } = await supabase
          .from('chat_messages')
          .insert({
            conversation_id: targetConversation.id,
            sender_id: currentUser.id,
            receiver_id: targetUserId,
            ...forwardPayload,
            reply_to_message_id: null,
            created_at: createdAt,
            updated_at: createdAt,
          })
          .select('*')
          .single()

        if (insertError) throw insertError

        const summary = getConversationSummaryFromMessage({
          ...insertedMessage,
          created_at: createdAt,
          sender_id: currentUser.id,
        })
        const deletionField = getConversationDeletionField(targetConversation, currentUser.id)

        await supabase
          .from('chat_conversations')
          .update({
            ...summary,
            updated_at: createdAt,
            ...(deletionField ? { [deletionField]: null } : {}),
          })
          .eq('id', targetConversation.id)

        forwardedConversationIds.push(targetConversation.id)

        await sendPushToUser({
          recipientId: targetUserId,
          title: currentUserName,
          body: getForwardNotificationBody(forwardTargetMessage),
          data: {
            type: 'chat_message',
            actorId: currentUser.id,
            actorName: currentUserName,
            actorAvatarUrl: getUserAvatarUrl(currentUser),
            conversationId: targetConversation.id,
            messageType: forwardPayload.message_type,
            createdAt,
          },
        })
      }

      if (conversation?.id && forwardedConversationIds.includes(conversation.id)) {
        await loadMessages(conversation.id, currentUser.id, false, conversation)
      }

      await loadConversationList(currentUser)
      setContactPickerVisible(false)
      setContactPickerSearchQuery('')
      setSelectedForwardContactIds([])
      setForwardTargetMessage(null)
      Alert.alert('Forwarded', `Sent to ${targetContacts.length} ${targetContacts.length === 1 ? 'person' : 'people'}.`)
    } catch (error) {
      Alert.alert('Forward failed', error?.message || 'Could not forward this message.')
    } finally {
      setForwardingMessage(false)
    }
  }

  async function pickMedia() {
    if (!currentUser?.id || uploading) return

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 5,
      orderedSelection: true,
      quality: 1,
    })

    if (result.canceled || !result.assets?.length) return

    const nextAssets = result.assets.slice(0, 5).map((asset, index) => ({
      ...asset,
      composerKey:
        asset.assetId ||
        asset.id ||
        `${asset.uri}-${Date.now()}-${index}`,
      type: asset.type === 'video' ? 'video' : 'image',
    }))

    if (result.assets.length > 5) {
      Alert.alert('Only 5 at a time', 'You can select up to 5 photos or videos in one batch.')
    }

    setSelectedMediaAssets(nextAssets)
  }

  async function capturePhoto() {
    if (!currentUser?.id || uploading || sending) return

    if (selectedMediaAssets.length >= 5) {
      Alert.alert('Only 5 at a time', 'You can attach up to 5 photos or videos in one batch.')
      return
    }

    navigation.navigate('ChatCamera', {
      remainingSlots: Math.max(0, 5 - selectedMediaAssets.length),
    })
  }

  async function sendSelectedMediaBatch() {
    if (!currentUser?.id || !conversation?.id || !otherUser?.id || selectedMediaAssets.length === 0 || uploading || sending) {
      return
    }

    try {
      setUploading(true)

      const uploadedAssets = await Promise.all(
        selectedMediaAssets.map(async (asset) => {
          const messageType = asset.type === 'video' ? 'video' : 'image'
          const uploadResult = await uploadMediaAsset({
            uri: asset.uri,
            type: messageType,
            mimeType: asset.mimeType,
            userId: currentUser.id,
            bucket: CHAT_MEDIA_BUCKET,
          })

          return {
            ...asset,
            messageType,
            mediaUrl: uploadResult.mediaUrl,
            mediaMimeType: uploadResult.mediaMimeType,
          }
        })
      )

      const baseTime = Date.now()
      const rows = uploadedAssets.map((asset, index) => {
        const createdAt = new Date(baseTime + index * 1000).toISOString()

        return {
          conversation_id: conversation.id,
          sender_id: currentUser.id,
          receiver_id: otherUser.id,
          body: null,
          message_type: asset.messageType,
          media_url: asset.mediaUrl,
          media_mime_type: asset.mediaMimeType,
          audio_duration_ms: null,
          reply_to_message_id: replyTarget?.id || null,
          created_at: createdAt,
          updated_at: createdAt,
        }
      })

      const { error } = await supabase.from('chat_messages').insert(rows)

      if (error) {
        throw error
      }

      const lastCreatedAt = rows[rows.length - 1]?.created_at || new Date().toISOString()
      const summaryLabel =
        uploadedAssets.length === 1
          ? mediaLabel(uploadedAssets[0].messageType)
          : `${uploadedAssets.length} attachments`

      await supabase
        .from('chat_conversations')
        .update({
          last_message: summaryLabel,
          last_message_type: uploadedAssets.length === 1 ? uploadedAssets[0].messageType : 'image',
          last_message_at: lastCreatedAt,
          last_sender_id: currentUser.id,
          updated_at: lastCreatedAt,
          ...(getConversationDeletionField(conversation, currentUser.id)
            ? { [getConversationDeletionField(conversation, currentUser.id)]: null }
            : {}),
        })
        .eq('id', conversation.id)

      await sendPushToUser({
        recipientId: otherUser.id,
        title: currentUserName,
        body:
          uploadedAssets.length === 1
            ? `Sent a ${mediaLabel(uploadedAssets[0].messageType).toLowerCase()}`
            : `Sent ${uploadedAssets.length} photos`,
        data: {
          type: 'chat_message',
          actorId: currentUser.id,
          actorName: currentUserName,
          actorAvatarUrl: getUserAvatarUrl(currentUser),
          propertyId: getPropertyId(conversationProperty) || conversation.property_id,
          propertyTitle: conversationProperty?.title || '',
          conversationId: conversation.id,
          messageType: uploadedAssets.length === 1 ? uploadedAssets[0].messageType : 'image',
          createdAt: lastCreatedAt,
        },
      })

      await updateMyPresence({ online: true, typing: false })
      setSelectedMediaAssets([])
      setReplyTarget(null)
    } catch (error) {
      Alert.alert('Media send failed', error?.message || 'Could not send these files right now.')
    } finally {
      setUploading(false)
    }
  }

  async function pickDocumentFile() {
    if (!currentUser?.id || uploading || sending || !conversation?.id) return

    const result = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
      type: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        '*/*',
      ],
    })

    if (result.canceled || !result.assets?.length) return

    const file = result.assets[0]

    try {
      setUploading(true)

      const uploadResult = await uploadMediaAsset({
        uri: file.uri,
        type: 'file',
        mimeType: file.mimeType,
        userId: currentUser.id,
        bucket: CHAT_MEDIA_BUCKET,
      })

      await sendMessage({
        body: file.name || 'Document',
        messageType: 'file',
        mediaUrl: uploadResult.mediaUrl,
        mediaMimeType: uploadResult.mediaMimeType,
        mediaName: file.name || 'Document',
      })
    } catch (error) {
      Alert.alert('File send failed', error?.message || 'Could not send this file right now.')
    } finally {
      setUploading(false)
    }
  }

  async function openLocationPreview() {
    if (!currentUser?.id || uploading || sending || !conversation?.id) return

    try {
      setLocationPreview(null)
      setLocationPreviewLoading(true)

      const permission = await ExpoLocation.requestForegroundPermissionsAsync()

      if (permission.status !== 'granted') {
        Alert.alert('Location needed', 'Please allow location access to share your current location.')
        return
      }

      const position = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      })
      const coords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }
      let locationLabel = 'Current location'

      try {
        const selectedLocation = await getLocationSelectionFromCoords(coords, 'Current location')
        locationLabel =
          selectedLocation?.areaLabel ||
          selectedLocation?.label ||
          selectedLocation?.fullLabel ||
          locationLabel
      } catch {
        locationLabel = `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
      }

      const mapsUrl =
        `https://www.google.com/maps/search/?api=1&query=${coords.latitude},${coords.longitude}`

      setLocationPreview({
        ...coords,
        label: locationLabel,
        mapsUrl,
      })
    } catch (error) {
      Alert.alert('Location unavailable', error?.message || 'Could not share your location right now.')
    } finally {
      setLocationPreviewLoading(false)
    }
  }

  async function sendLocationPreview() {
    if (!locationPreview || uploading || sending) return

    await sendMessage({
      body: 'Shared location',
      messageType: 'file',
      mediaUrl: locationPreview.mapsUrl,
      mediaMimeType: CHAT_LOCATION_MIME_TYPE,
      mediaName: locationPreview.label || 'Current location',
    })
    setLocationPreview(null)
  }

  function resetRedPacketComposer() {
    setRedPacketAmount('')
    setRedPacketWish('Best wishes')
    setRedPacketPhotoAsset(null)
    setRedPacketTargetMode('all')
    setSelectedRedPacketMemberIds([])
  }

  function parseRedPacketAmountInput(value) {
    return Number(String(value || '').replace(/[^\d.]/g, ''))
  }

  async function pickRedPacketPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.9,
    })

    if (result.canceled || !result.assets?.length) return

    setRedPacketPhotoAsset(result.assets[0])
  }

  function toggleRedPacketMemberSelection(memberId) {
    setSelectedRedPacketMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId]
    )
  }

  function getRedPacketRecipientMembers() {
    if (!isActiveGroupChat) {
      return otherUser?.id
        ? [{
          userId: otherUser.id,
          profile: otherUser,
        }]
        : []
    }

    const selectedIds = new Set(selectedRedPacketMemberIds)
    const targetMembers =
      redPacketTargetMode === 'group_selected'
        ? eligibleRedPacketMembers.filter((member) => selectedIds.has(member.user_id))
        : eligibleRedPacketMembers

    return targetMembers.map((member) => ({
      userId: member.user_id,
      profile: member.profile,
    }))
  }

  async function sendRedPacket() {
    if (!currentUser?.id || !conversation?.id || sending || sendingRedPacket) return

    const amount = parseRedPacketAmountInput(redPacketAmount)
    const wish = redPacketWish.trim() || 'Best wishes'
    const recipientMembers = getRedPacketRecipientMembers()
    const recipientIds = recipientMembers.map((member) => member.userId).filter(Boolean)
    const packetMode = isActiveGroupChat
      ? redPacketTargetMode === 'group_selected'
        ? 'group_selected'
        : 'group_all'
      : 'direct'

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Amount needed', 'Add a valid gift amount before sending.')
      return
    }

    if (amount > RED_PACKET_MAX_AMOUNT) {
      Alert.alert('Amount too high', 'Red packet amount can be up to 200 BDT.')
      return
    }

    if (!recipientIds.length) {
      Alert.alert(
        'Choose members',
        isActiveGroupChat
          ? 'Select at least one group member for this red packet.'
          : 'This chat needs a receiver before sending a red packet.'
      )
      return
    }

    try {
      setSendingRedPacket(true)

      const { error: redPacketSetupError } = await supabase
        .from('chat_red_packets')
        .select('id')
        .limit(1)

      if (redPacketSetupError) {
        throw redPacketSetupError
      }

      const walletBalance = await fetchWalletBalance(currentUser.id, 'BDT')

      if (walletBalance < amount) {
        Alert.alert(
          'Not enough wallet balance',
          `Your wallet has ${formatCurrencyAmount(walletBalance, 'BDT')}. Request e-money from your Wallet first.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Wallet', onPress: () => navigation.navigate('Wallet') },
          ]
        )
        return
      }

      let photoUrl = null

      if (redPacketPhotoAsset?.uri) {
        const uploadResult = await uploadMediaAsset({
          uri: redPacketPhotoAsset.uri,
          type: 'image',
          mimeType: redPacketPhotoAsset.mimeType,
          userId: currentUser.id,
          bucket: CHAT_MEDIA_BUCKET,
        })
        photoUrl = uploadResult.mediaUrl
      }

      const shares = packetMode === 'direct'
        ? [amount]
        : buildRandomRedPacketShares(amount, recipientIds.length)
      const recipientRows = recipientIds.map((recipientId, index) => ({
        user_id: recipientId,
        amount: shares[index],
        currency: 'BDT',
      }))

      const insertedMessage = await sendMessage({
        body: wish,
        messageType: 'file',
        mediaUrl: photoUrl,
        mediaMimeType: CHAT_RED_PACKET_MIME_TYPE,
        mediaName: 'Red packet',
        pushRecipientIds: isActiveGroupChat ? recipientIds : null,
      })

      if (!insertedMessage?.id) {
        throw new Error('Could not create the red packet message.')
      }

      const packetReceiverId = recipientIds[0] || insertedMessage.receiver_id

      const { data: packet, error } = await supabase
        .from('chat_red_packets')
        .insert({
          message_id: insertedMessage.id,
          conversation_id: conversation.id,
          sender_id: currentUser.id,
          receiver_id: packetReceiverId,
          amount,
          currency: 'BDT',
          wish,
          photo_url: photoUrl,
          packet_mode: packetMode,
          recipient_count: recipientIds.length,
          random_split: packetMode !== 'direct',
        })
        .select('*')
        .single()

      if (error) {
        throw error
      }

      const { data: insertedRecipients, error: recipientError } = await supabase
        .from('chat_red_packet_recipients')
        .insert(
          recipientRows.map((recipient) => ({
            red_packet_id: packet.id,
            ...recipient,
          }))
        )
        .select('id, red_packet_id, user_id, amount, currency, opened_at, wallet_entry_id, last_reminded_at, created_at')

      if (recipientError) {
        throw recipientError
      }

      const { error: debitError } = await supabase
        .from('wallet_entries')
        .insert({
          user_id: currentUser.id,
          red_packet_id: packet.id,
          amount: -amount,
          currency: 'BDT',
          source: 'red_packet_sent',
        })

      if (debitError) {
        throw debitError
      }

      setRedPacketsByMessageId((current) => ({
        ...current,
        [insertedMessage.id]: {
          ...packet,
          recipients: insertedRecipients || [],
          myRecipient: null,
          openedRecipients: [],
          recipientCount: recipientIds.length,
          openedCount: 0,
          allOpened: false,
          claimAmount: amount,
          opened: false,
          openedEntry: null,
        },
      }))
      setRedPacketComposerVisible(false)
      resetRedPacketComposer()
    } catch (error) {
      Alert.alert(
        'Red packet failed',
        error?.message || 'Could not send this red packet. Run supabase-red-packet-features.sql if this is the first setup.'
      )
    } finally {
      setSendingRedPacket(false)
    }
  }

  async function openRedPacket(redPacket) {
    if (!redPacket?.id || !currentUser?.id || openingRedPacketId) return

    const myRecipient = redPacket.myRecipient || null
    const canClaimRecipientRow = Boolean(myRecipient?.id && !myRecipient.opened_at)
    const canClaimLegacyDirectPacket =
      !redPacket.recipients?.length &&
      redPacket.receiver_id === currentUser.id

    if (!canClaimRecipientRow && !canClaimLegacyDirectPacket) {
      Alert.alert(
        'Red packet',
        redPacket.opened
          ? 'You already opened this red packet.'
          : 'This red packet was not sent to your account.'
      )
      return
    }

    try {
      setOpeningRedPacketId(redPacket.id)

      if (canClaimRecipientRow) {
        const { data: claimRows, error: claimError } = await supabase
          .rpc('claim_chat_red_packet', {
            target_red_packet_id: redPacket.id,
          })

        if (claimError) {
          throw claimError
        }

        const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows
        const claimedAmount = Number(claim?.amount || myRecipient.amount || 0)

        await loadRedPacketsForMessages(messages, currentUser.id)

        Alert.alert(
          'Gift opened',
          `${formatCurrencyAmount(claimedAmount, claim?.currency || myRecipient.currency || 'BDT')} added to your account.`
        )
        return
      }

      const { data: entry, error } = await supabase
        .from('wallet_entries')
        .insert({
          user_id: currentUser.id,
          red_packet_id: redPacket.id,
          amount: redPacket.amount,
          currency: redPacket.currency || 'BDT',
          source: 'red_packet_received',
        })
        .select('id, user_id, red_packet_id, amount, currency, source, created_at')
        .single()

      if (error) {
        if (String(error.message || '').toLowerCase().includes('duplicate')) {
          const { data: existingEntry } = await supabase
            .from('wallet_entries')
            .select('id, user_id, red_packet_id, amount, currency, source, created_at')
            .eq('red_packet_id', redPacket.id)
            .eq('source', 'red_packet_received')
            .maybeSingle()

          if (existingEntry) {
            setRedPacketsByMessageId((current) => {
              const next = { ...current }

              Object.keys(next).forEach((messageId) => {
                if (next[messageId]?.id === redPacket.id) {
                  next[messageId] = {
                    ...next[messageId],
                    opened: true,
                    openedEntry: existingEntry,
                    creditedToMe: existingEntry.user_id === currentUser.id,
                  }
                }
              })

              return next
            })
          }

          Alert.alert('Already opened', 'This red packet was already added to your account.')
          return
        }

        throw error
      }

      setRedPacketsByMessageId((current) => {
        const next = { ...current }

        Object.keys(next).forEach((messageId) => {
          if (next[messageId]?.id === redPacket.id) {
            next[messageId] = {
              ...next[messageId],
              opened: true,
              openedEntry: entry,
              creditedToMe: true,
            }
          }
        })

        return next
      })

      Alert.alert(
        'Gift opened',
        `${formatCurrencyAmount(redPacket.amount, redPacket.currency || 'BDT')} added to your account.`
      )
    } catch (error) {
      Alert.alert(
        'Open failed',
        error?.message || 'Could not open this red packet. Run supabase-red-packet-features.sql first.'
      )
    } finally {
      setOpeningRedPacketId(null)
    }
  }

  async function startRecording() {
    if (!currentUser?.id || recorderState?.isRecording) return false

    setAttachmentPickerVisible(false)
    const permission = await requestRecordingPermissionsAsync()

    if (!permission.granted) {
      Alert.alert('Microphone needed', 'Please allow microphone access to send voice messages.')
      return false
    }

    try {
      try {
        voicePreviewPlayer.pause()
      } catch {
        // ignore preview player pause issues
      }
      setPendingVoiceNote(null)
      setRecordingWaveform([])
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      })
      await audioRecorder.prepareToRecordAsync()
      audioRecorder.record()
      return true
    } catch (error) {
      Alert.alert('Recording failed', error.message)
      return false
    }
  }

  async function stopRecordingForReview() {
    if (!recorderState?.isRecording || uploading) return

    try {
      await audioRecorder.stop()

      const uri = audioRecorder.uri
      const durationMillis = recorderState.durationMillis || 0

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      })

      if (!uri) {
        throw new Error('No recording file was created.')
      }
      setPendingVoiceNote({
        uri,
        durationMillis,
        waveformLevels: recordingWaveform.length ? recordingWaveform : [0.2, 0.32, 0.28, 0.42, 0.24, 0.38],
      })
      setRecordingWaveform([])
    } catch (error) {
      Alert.alert('Voice message failed', error.message)
    }
  }

  async function sendPendingVoiceNote() {
    if (!pendingVoiceNote?.uri || uploading || !currentUser?.id) return

    try {
      setUploading(true)

      const uploadResult = await uploadMediaAsset({
        uri: pendingVoiceNote.uri,
        type: 'voice',
        mimeType: 'audio/mp4',
        userId: currentUser.id,
        bucket: CHAT_MEDIA_BUCKET,
      })

      await sendMessage({
        messageType: 'voice',
        mediaUrl: uploadResult.mediaUrl,
        mediaMimeType: uploadResult.mediaMimeType,
        audioDurationMs: pendingVoiceNote.durationMillis,
      })

      setPendingVoiceNote(null)
    } catch (error) {
      Alert.alert('Voice message failed', error.message)
    } finally {
      setUploading(false)
    }
  }

  function discardPendingVoiceNote() {
    try {
      voicePreviewPlayer.pause()
      voicePreviewPlayer.seekTo(0)
    } catch {
      // ignore preview reset issues
    }

    setPendingVoiceNote(null)
  }

  async function toggleVoicePreviewPlayback() {
    if (!pendingVoiceNote?.uri) return

    try {
      const previewDuration = pendingVoiceNote.durationMillis || 0
      const previewPositionMillis = Math.floor((voicePreviewStatus?.currentTime || 0) * 1000)
      const finished = previewDuration > 0 && previewPositionMillis >= previewDuration - 120

      if (voicePreviewStatus?.playing) {
        voicePreviewPlayer.pause()
      } else {
        if (finished) {
          await voicePreviewPlayer.seekTo(0)
        }
        voicePreviewPlayer.play()
      }
    } catch {
      Alert.alert('Preview unavailable', 'This recording could not be reviewed right now.')
    }
  }

  function toggleRecording() {
    if (recorderState?.isRecording) {
      stopRecordingForReview()
    } else {
      startRecording()
    }
  }

  async function stopAndSendRecordingDirectly() {
    if (!recorderState?.isRecording || uploading || !currentUser?.id) return

    try {
      setUploading(true)
      await audioRecorder.stop()

      const uri = audioRecorder.uri
      const durationMillis = recorderState.durationMillis || 0

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      })

      if (!uri) {
        throw new Error('No recording file was created.')
      }

      const uploadResult = await uploadMediaAsset({
        uri,
        type: 'voice',
        mimeType: 'audio/mp4',
        userId: currentUser.id,
        bucket: CHAT_MEDIA_BUCKET,
      })

      await sendMessage({
        messageType: 'voice',
        mediaUrl: uploadResult.mediaUrl,
        mediaMimeType: uploadResult.mediaMimeType,
        audioDurationMs: durationMillis,
      })

      setRecordingWaveform([])
      setPendingVoiceNote(null)
    } catch (error) {
      Alert.alert('Voice message failed', error.message)
    } finally {
      setUploading(false)
      longPressRecordingRef.current = false
    }
  }

  async function startVoiceCall() {
    if (!currentUser?.id || (!isActiveGroupChat && !otherUser?.id)) return

    if (hasActiveAgoraCall()) {
      Alert.alert('Line busy', 'End the current call before starting another one.')
      return
    }

    if (!canUseAgoraNativeModule()) {
      Alert.alert(
        'Call needs a native build',
        'Agora calling will not run inside Expo Go. Please install a preview/development build and try again.'
      )
      return
    }

    const groupRecipientIds = isActiveGroupChat
      ? groupMembers
        .map((member) => member.user_id)
        .filter((memberId) => memberId && memberId !== currentUser.id)
      : []
    const primaryRecipientId = isActiveGroupChat ? groupRecipientIds[0] : otherUser.id

    if (!primaryRecipientId) {
      Alert.alert('Call unavailable', 'This group needs another active member before calling.')
      return
    }

    const callId = createAgoraCallId('audio')
    const channelName = buildAgoraChannelName({
      conversationId: conversation?.id,
      callId,
      callerId: currentUser.id,
      recipientId: primaryRecipientId,
      kind: 'audio',
    })
    const callKey = `audio:${callId || channelName}`

    if (!reserveActiveAgoraCall(callKey)) {
      Alert.alert('Line busy', 'End the current call before starting another one.')
      return
    }

    const recipients = isActiveGroupChat ? groupRecipientIds : [otherUser.id]

    Promise.all(recipients.map((recipientId) =>
      sendAgoraCallInvite({
        callKind: 'audio',
        caller: currentUser,
        recipientId,
        property: conversationProperty,
        conversationId: conversation?.id || null,
        callId,
        channelName,
      })
    )).catch((error) => {
      console.warn('Audio call invite failed:', error?.message || error)
    })

    navigation.navigate('AudioCall', {
      participant: isActiveGroupChat
        ? { ...otherUser, id: primaryRecipientId, user_id: primaryRecipientId }
        : otherUser,
      property: conversationProperty,
      conversationId: conversation?.id || null,
      callId,
      channelName,
      startedByMe: true,
    })
  }

  async function startVideoCall() {
    if (!currentUser?.id || (!isActiveGroupChat && !otherUser?.id)) return

    if (hasActiveAgoraCall()) {
      Alert.alert('Line busy', 'End the current call before starting another one.')
      return
    }

    if (!canUseAgoraNativeModule()) {
      Alert.alert(
        'Call needs a native build',
        'Agora calling will not run inside Expo Go. Please install a preview/development build and try again.'
      )
      return
    }

    const groupRecipientIds = isActiveGroupChat
      ? groupMembers
        .map((member) => member.user_id)
        .filter((memberId) => memberId && memberId !== currentUser.id)
      : []
    const primaryRecipientId = isActiveGroupChat ? groupRecipientIds[0] : otherUser.id

    if (!primaryRecipientId) {
      Alert.alert('Call unavailable', 'This group needs another active member before calling.')
      return
    }

    const callId = createAgoraCallId('video')
    const channelName = buildAgoraChannelName({
      conversationId: conversation?.id,
      callId,
      callerId: currentUser.id,
      recipientId: primaryRecipientId,
      kind: 'video',
    })
    const callKey = `video:${callId || channelName}`

    if (!reserveActiveAgoraCall(callKey)) {
      Alert.alert('Line busy', 'End the current call before starting another one.')
      return
    }

    const recipients = isActiveGroupChat ? groupRecipientIds : [otherUser.id]

    Promise.all(recipients.map((recipientId) =>
      sendAgoraCallInvite({
        callKind: 'video',
        caller: currentUser,
        recipientId,
        property: conversationProperty,
        conversationId: conversation?.id || null,
        callId,
        channelName,
      })
    )).catch((error) => {
      console.warn('Video call invite failed:', error?.message || error)
    })

    navigation.navigate('VideoCall', {
      participant: isActiveGroupChat
        ? { ...otherUser, id: primaryRecipientId, user_id: primaryRecipientId }
        : otherUser,
      property: conversationProperty,
      conversationId: conversation?.id || null,
      callId,
      channelName,
      startedByMe: true,
    })
  }

  function handlePressCallHistory(message) {
    if (getCallPresentation(message).isVideo) {
      startVideoCall()
      return
    }

    startVoiceCall()
  }

  function openChatSettings() {
    if (!conversation?.id || (!isActiveGroupChat && !otherUser?.id)) return

    navigation.navigate('ChatSettings', {
      conversationId: conversation.id,
      participant: otherUser,
      property: conversationProperty || null,
      conversation,
      groupMembers,
    })
  }

  function jumpToMessage(messageId) {
    if (!messageId) return

    const index = messageIndexLookup[messageId]

    if (typeof index !== 'number') return

    suppressAutoScrollUntilRef.current = Date.now() + 2500

    flatListRef.current?.scrollToIndex({
      index,
      animated: true,
      viewPosition: 0.35,
    })

    setHighlightedMessageId(messageId)

    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current)
    }

    highlightTimerRef.current = setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageId ? null : current))
    }, 1800)
  }

  function focusMessageInput() {
    setActiveReactionMessageId(null)
    setAttachmentPickerVisible(false)
    setComposerFocused(true)
    requestAnimationFrame(() => {
      messageInputRef.current?.focus()
    })
  }

  function openAttachmentPicker() {
    setActiveReactionMessageId(null)

    if (attachmentPickerVisible) {
      setAttachmentPickerVisible(false)
      return
    }

    Keyboard.dismiss()
    setComposerFocused(false)
    setAttachmentPageIndex(0)
    setAttachmentPickerVisible(true)
    scheduleKeyboardAwareScroll(120)
  }

  function handleComposerContentSizeChange(event) {
    const nextHeight = Math.min(
      COMPOSER_INPUT_MAX_HEIGHT,
      Math.max(COMPOSER_INPUT_MIN_HEIGHT, Math.ceil(event?.nativeEvent?.contentSize?.height || 0))
    )

    setComposerInputHeight((currentHeight) =>
      Math.abs(currentHeight - nextHeight) > 1 ? nextHeight : currentHeight
    )
  }

  function handleAttachmentAction(actionKey) {
    setAttachmentPickerVisible(false)

    setTimeout(() => {
      if (actionKey === 'photo') {
        pickMedia()
        return
      }

      if (actionKey === 'camera') {
        capturePhoto()
        return
      }

      if (actionKey === 'video-call') {
        startVideoCall()
        return
      }

      if (actionKey === 'audio-call') {
        startVoiceCall()
        return
      }

      if (actionKey === 'files') {
        pickDocumentFile()
        return
      }

      if (actionKey === 'location') {
        openLocationPreview()
        return
      }

      if (actionKey === 'red-packet') {
        resetRedPacketComposer()
        setRedPacketComposerVisible(true)
        return
      }

      if (actionKey === 'favorite') {
        navigation.navigate('Favorite')
        return
      }

      if (actionKey === 'contact-card') {
        openContactCardPicker()
      }
    }, 180)
  }

  function handleReplyToMessage(message) {
    setMessageActionTarget(null)
    setReplyTarget(message)
    focusMessageInput()
  }

  async function copyMessageText(message) {
    const text = String(message?.body || '').trim()

    if (!text) return

    try {
      await Clipboard.setStringAsync(text)
      setMessageActionTarget(null)
      Alert.alert('Copied', 'Message text copied.')
    } catch (error) {
      Alert.alert('Copy failed', error?.message || 'Unable to copy this message right now.')
    }
  }

  async function toggleMessageReaction(message, reaction = '❤️') {
    if (!currentUser?.id || !message?.id || message.deleted_for_everyone_at) return

    const reactionField = getMessageReactionField(message, currentUser.id)

    if (!reactionField) return

    suppressAutoScroll(1600)

    const currentReaction = message[reactionField] === 'love' ? '❤️' : message[reactionField]
    const nextReaction = currentReaction === reaction ? null : reaction
    const updatedAt = new Date().toISOString()

    setMessages((current) =>
      current.map((item) =>
        item.id === message.id
          ? {
            ...item,
            [reactionField]: nextReaction,
            updated_at: updatedAt,
          }
          : item
      )
    )

    const { error } = await supabase
      .from('chat_messages')
      .update({
        [reactionField]: nextReaction,
        updated_at: updatedAt,
      })
      .eq('id', message.id)

    if (error) {
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id
            ? {
              ...item,
              [reactionField]: message[reactionField] || null,
            }
            : item
        )
      )
      Alert.alert('Reaction failed', error.message)
    }
  }

  async function deleteMessageForMe(message) {
    if (!currentUser?.id || !message?.id) return

    setMessageActionTarget(null)

    const deletionField = getMessageDeletionField(message, currentUser.id)

    if (!deletionField) return

    const deletedAt = new Date().toISOString()
    const { error } = await supabase
      .from('chat_messages')
      .update({
        [deletionField]: deletedAt,
        updated_at: deletedAt,
      })
      .eq('id', message.id)

    if (error) {
      Alert.alert('Delete failed', error.message)
      return
    }

    setMessages((current) => current.filter((item) => item.id !== message.id))

    if (replyTarget?.id === message.id) {
      setReplyTarget(null)
    }
  }

  async function deleteMessageForEveryone(message) {
    if (!currentUser?.id || !message?.id) return

    setMessageActionTarget(null)

    const deletedAt = new Date().toISOString()
    const payload = {
      body: null,
      media_url: null,
      media_mime_type: null,
      audio_duration_ms: null,
      reply_to_message_id: null,
      sender_reaction: null,
      receiver_reaction: null,
      deleted_for_everyone_at: deletedAt,
      deleted_for_everyone_by: currentUser.id,
      updated_at: deletedAt,
    }

    const { error } = await supabase
      .from('chat_messages')
      .update(payload)
      .eq('id', message.id)

    if (error) {
      Alert.alert('Delete failed', error.message)
      return
    }

    const nextMessages = messages.map((item) =>
      item.id === message.id
        ? {
          ...item,
          ...payload,
        }
        : item
    )

    setMessages(nextMessages)

    const latestVisibleMessage = [...nextMessages]
      .reverse()
      .find((item) => !item.deleted_for_everyone_at)
    const nextConversationSummary = getConversationSummaryFromMessage(latestVisibleMessage)

    await supabase
      .from('chat_conversations')
      .update({
        ...nextConversationSummary,
        updated_at: deletedAt,
      })
      .eq('id', conversation.id)

    setConversation((current) =>
      current
        ? {
          ...current,
          ...nextConversationSummary,
          updated_at: deletedAt,
        }
        : current
    )

    if (replyTarget?.id === message.id) {
      setReplyTarget(null)
    }
  }

  function openMessageActions(message) {
    setActiveReactionMessageId(null)
    setMessageActionTarget(message)
  }

  function markReactionInteraction() {
    reactionInteractionAtRef.current = Date.now()
  }

  function requestReactionPicker(messageId) {
    if (!messageId) return
    setActiveReactionMessageId(messageId)
  }

  function dismissReactionPicker() {
    setActiveReactionMessageId(null)
  }

  function dismissReactionPickerFromOutside() {
    if (!activeReactionMessageId) return false

    setTimeout(() => {
      if (Date.now() - reactionInteractionAtRef.current > 80) {
        setActiveReactionMessageId(null)
      }
    }, 0)

    return false
  }

  const goBackFromChat = useCallback(() => {
    if (openedFromList) {
      setMode('list')
      setConversation(null)
      setMessages([])
      setReplyTarget(null)
      loadConversationList(currentUser)
      return
    }

    navigation.goBack()
  }, [currentUser, loadConversationList, navigation, openedFromList])

  const selectionMode = selectedConversationIds.length > 0

  const toggleConversationSelection = useCallback((conversationId) => {
    setSelectedConversationIds((current) =>
      current.includes(conversationId)
        ? current.filter((id) => id !== conversationId)
        : [...current, conversationId]
    )
  }, [])

  const clearConversationSelection = useCallback(() => {
    setSelectedConversationIds([])
  }, [])

  const deleteSelectedConversations = useCallback(async () => {
    if (!currentUser?.id || selectedConversationIds.length === 0) return

    const targetRows = conversationRows.filter((item) => selectedConversationIds.includes(item.id))

    if (targetRows.length === 0) {
      clearConversationSelection()
      return
    }

    Alert.alert(
      selectedConversationIds.length > 1 ? 'Delete conversations?' : 'Delete conversation?',
      selectedConversationIds.length > 1
        ? 'These chats will be removed from your message list.'
        : 'This chat will be removed from your message list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const deletedAt = new Date().toISOString()
            const groupTargetIds = targetRows
              .filter((item) => isGroupConversation(item))
              .map((item) => item.id)
            const directTargets = targetRows.filter((item) => !isGroupConversation(item))
            const groups = directTargets.reduce((acc, item) => {
              const field = getConversationDeletionField(item, currentUser.id)

              if (!field) return acc

              if (!acc[field]) {
                acc[field] = []
              }

              acc[field].push(item.id)
              return acc
            }, {})

            const groupEntries = Object.entries(groups)

            if (groupEntries.length === 0 && groupTargetIds.length === 0) {
              Alert.alert('Delete unavailable', 'Unable to identify your chat records right now.')
              return
            }

            if (groupTargetIds.length > 0) {
              const { error } = await supabase
                .from('chat_group_members')
                .update({
                  cleared_at: deletedAt,
                  last_read_at: deletedAt,
                })
                .eq('user_id', currentUser.id)
                .in('conversation_id', groupTargetIds)

              if (error) {
                Alert.alert('Delete failed', error.message)
                return
              }
            }

            for (const [field, ids] of groupEntries) {
              const { error } = await supabase
                .from('chat_conversations')
                .update({
                  [field]: deletedAt,
                  updated_at: deletedAt,
                })
                .in('id', ids)

              if (error) {
                const message = error.message?.includes('participant_one_deleted_at')
                  || error.message?.includes('participant_two_deleted_at')
                  ? 'Run the latest supabase-chat-features.sql in Supabase, then try deleting chats again.'
                  : error.message

                Alert.alert('Delete failed', message)
                return
              }
            }

            clearConversationSelection()
            const nextAssignments = {
              ...chatFolderAssignments,
            }

            selectedConversationIds.forEach((conversationId) => {
              delete nextAssignments[String(conversationId)]
            })
            persistChatFolderAssignments(nextAssignments)
            await loadConversationList(currentUser)
          },
        },
      ]
    )
  }, [
    clearConversationSelection,
    chatFolderAssignments,
    conversationRows,
    currentUser,
    loadConversationList,
    persistChatFolderAssignments,
    selectedConversationIds,
  ])

  useFocusEffect(
    useCallback(() => {
      if (mode !== 'chat') return undefined

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (attachmentPickerVisible) {
          setAttachmentPickerVisible(false)
          setAttachmentPageIndex(0)
          return true
        }

        if (messageActionTarget) {
          setMessageActionTarget(null)
          return true
        }

        goBackFromChat()
        return true
      })

      return () => {
        subscription.remove()
      }
    }, [attachmentPickerVisible, goBackFromChat, messageActionTarget, mode])
  )

  useFocusEffect(
    useCallback(() => {
      if (mode !== 'list' || !selectionMode) return undefined

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        clearConversationSelection()
        return true
      })

      return () => {
        subscription.remove()
      }
    }, [clearConversationSelection, mode, selectionMode])
  )

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

  const messageActionItems = useMemo(() => {
    if (!messageActionTarget) return []

    const reactionField = getMessageReactionField(messageActionTarget, currentUser?.id)
    const currentReaction = reactionField ? messageActionTarget[reactionField] : null
    const actionReaction = currentReaction === 'love' ? '❤️' : currentReaction || '❤️'
    const actions = [
      {
        icon: 'return-down-forward-outline',
        title: 'Reply',
        subtitle: 'Quote this message in your reply.',
        onPress: () => handleReplyToMessage(messageActionTarget),
      },
      {
        icon: currentReaction ? 'heart-dislike-outline' : 'heart-outline',
        title: currentReaction ? 'Remove reaction' : 'Love',
        subtitle: 'React to this message quickly.',
        onPress: () => {
          setMessageActionTarget(null)
          toggleMessageReaction(messageActionTarget, actionReaction)
        },
      },
    ]

    if (String(messageActionTarget.body || '').trim()) {
      actions.push({
        icon: 'copy-outline',
        title: 'Copy text',
        subtitle: 'Copy this message to your clipboard.',
        onPress: () => copyMessageText(messageActionTarget),
      })
    }

    if (canForwardMessage(messageActionTarget)) {
      actions.push({
        icon: 'share-social-outline',
        title: 'Forward',
        subtitle: 'Send this message to multiple people.',
        onPress: () => openForwardMessagePicker(messageActionTarget),
      })
    }

    actions.push({
      icon: 'trash-outline',
      title: 'Delete for me',
      subtitle: 'Remove this message from your chat only.',
      danger: true,
      onPress: () => deleteMessageForMe(messageActionTarget),
    })

    if (messageActionTarget.sender_id === currentUser?.id && !messageActionTarget.deleted_for_everyone_at) {
      actions.push({
        icon: 'trash-bin-outline',
        title: 'Delete for everyone',
        subtitle: 'Remove this message for both people.',
        danger: true,
        onPress: () => deleteMessageForEveryone(messageActionTarget),
      })
    }

    return actions
  }, [currentUser?.id, messageActionTarget])

  const groupMemberTotal = groupMembers.length || conversation?.group_member_count || 0
  const chatStatusText = isActiveGroupChat
    ? (groupMemberTotal ? `${groupMemberTotal} members` : 'Group chat')
    : getChatStatusText()
  const quickChatActions = [
    {
      key: 'new-chat',
      icon: 'chatbubble-ellipses-outline',
      title: 'New chat',
      subtitle: 'Start a message',
    },
    {
      key: 'new-group',
      icon: 'people-outline',
      title: 'New group',
      subtitle: 'Create chat',
    },
    {
      key: 'add-contacts',
      icon: 'person-add-outline',
      title: 'Add contacts',
      subtitle: 'Find people',
    },
    {
      key: 'scan',
      icon: 'scan-outline',
      title: 'Scan',
      subtitle: 'RentalX ID',
    },
  ]

  function handleQuickChatAction(actionKey) {
    setQuickChatMenuVisible(false)

    if (actionKey === 'new-chat') {
      openMessageContactPicker('new-chat')
      return
    }

    if (actionKey === 'new-group') {
      navigation.navigate('CreateGroupChat')
      return
    }

    if (actionKey === 'add-contacts') {
      openMessageContactPicker('add-contact')
      return
    }

    navigation.navigate('ChatQrScanner', {
      purpose: 'add-contact',
    })
  }

  function openMessagingSettings() {
    setMessagingSettingsVisible(true)
  }

  function updateMessageSetting(key, value) {
    setMessageSettings((current) => {
      const nextSettings = {
        ...current,
        [key]: value,
      }

      AsyncStorage.setItem(MESSAGE_SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings)).catch(() => {})

      return nextSettings
    })
  }

  const chatFolders = useMemo(
    () => [...DEFAULT_CHAT_FOLDERS, ...customChatFolders],
    [customChatFolders]
  )
  const assignableChatFolders = useMemo(
    () => chatFolders.filter((folder) => folder.assignable),
    [chatFolders]
  )
  const activeChatFolder = useMemo(
    () => chatFolders.find((folder) => folder.id === activeChatFolderId) || chatFolders[0],
    [activeChatFolderId, chatFolders]
  )

  function persistCustomChatFolders(nextFolders) {
    const normalizedFolders = normalizeCustomChatFolders(nextFolders)
    setCustomChatFolders(normalizedFolders)
    AsyncStorage.setItem(CHAT_FOLDERS_STORAGE_KEY, JSON.stringify(normalizedFolders)).catch(() => {})
  }

  function persistChatFolderAssignments(nextAssignments) {
    const normalizedAssignments = normalizeChatFolderAssignments(nextAssignments)
    setChatFolderAssignments(normalizedAssignments)
    AsyncStorage.setItem(
      CHAT_FOLDER_ASSIGNMENTS_STORAGE_KEY,
      JSON.stringify(normalizedAssignments)
    ).catch(() => {})
  }

  function openChatFolderCreator() {
    setNewChatFolderName('')
    setChatFolderCreatorVisible(true)
  }

  function createCustomChatFolder() {
    const title = normalizeChatFolderName(newChatFolderName)
    const titleExists = chatFolders.some(
      (folder) => folder.title.toLowerCase() === title.toLowerCase()
    )

    if (!title) {
      Alert.alert('Folder name needed', 'Add a short name for this chat folder.')
      return
    }

    if (titleExists) {
      Alert.alert('Folder already exists', 'Every chat folder needs a unique name.')
      return
    }

    const nextFolder = {
      id: `custom-${Date.now()}`,
      title,
      icon: 'folder-outline',
      color: getNextChatFolderColor(customChatFolders),
      assignable: true,
      custom: true,
    }
    const nextFolders = [...customChatFolders, nextFolder]

    persistCustomChatFolders(nextFolders)
    setActiveChatFolderId(nextFolder.id)
    setNewChatFolderName('')
    setChatFolderCreatorVisible(false)
  }

  function openSelectedChatFolderAssignment() {
    if (!selectedConversationIds.length) return

    setChatFolderAssignmentVisible(true)
  }

  function toggleSelectedChatsInFolder(folderId) {
    if (!selectedConversationIds.length || !folderId) return

    const selectedIds = selectedConversationIds.map(String)
    const allSelectedAlreadyInFolder = selectedIds.every((conversationId) =>
      getConversationFolderIds(chatFolderAssignments, conversationId).includes(folderId)
    )
    const nextAssignments = {
      ...chatFolderAssignments,
    }

    selectedIds.forEach((conversationId) => {
      const currentFolderIds = getConversationFolderIds(nextAssignments, conversationId)
      const nextFolderIds = allSelectedAlreadyInFolder
        ? currentFolderIds.filter((item) => item !== folderId)
        : [...new Set([...currentFolderIds, folderId])]

      if (nextFolderIds.length) {
        nextAssignments[conversationId] = nextFolderIds
      } else {
        delete nextAssignments[conversationId]
      }
    })

    persistChatFolderAssignments(nextAssignments)
    setActiveChatFolderId(folderId)
    setChatFolderAssignmentVisible(false)
    clearConversationSelection()
  }

  function getChatFolderSelectionState(folderId) {
    if (!selectedConversationIds.length) return false

    return selectedConversationIds.every((conversationId) =>
      getConversationFolderIds(chatFolderAssignments, conversationId).includes(folderId)
    )
  }

  function isConversationInChatFolder(conversationItem, folderId) {
    if (folderId === 'all') return true
    if (folderId === 'personal') return !isGroupConversation(conversationItem)

    return getConversationFolderIds(chatFolderAssignments, conversationItem.id).includes(folderId)
  }

  function getChatFolderCount(folderId) {
    return visibleConversationRows.filter((item) => isConversationInChatFolder(item, folderId)).length
  }

  const visibleConversationRows = useMemo(() => {
    const query = normalizeConversationSearch(conversationSearchQuery)

    if (!query) return conversationRows

    return conversationRows.filter((item) =>
      getConversationSearchText(item).includes(query)
    )
  }, [conversationRows, conversationSearchQuery])

  const folderFilteredConversationRows = useMemo(
    () => visibleConversationRows.filter((item) =>
      isConversationInChatFolder(item, activeChatFolder?.id || 'all')
    ),
    [activeChatFolder, chatFolderAssignments, visibleConversationRows]
  )

  const messageListRows = useMemo(
    () => sortMessageRowsWithSettings(folderFilteredConversationRows, messageSettings, presenceByUserId),
    [folderFilteredConversationRows, messageSettings, presenceByUserId]
  )

  const visibleContactPickerContacts = useMemo(() => {
    const query = normalizeConversationSearch(contactPickerSearchQuery)

    if (!query) return contactPickerContacts

    return contactPickerContacts.filter((contact) =>
      getContactSearchText(contact).includes(query)
    )
  }, [contactPickerContacts, contactPickerSearchQuery])
  const activeRedPacketDetails = useMemo(() => {
    if (!redPacketDetailsId) return null

    return Object.values(redPacketsByMessageId).find((packet) => packet?.id === redPacketDetailsId) || null
  }, [redPacketDetailsId, redPacketsByMessageId])
  const isScanContactPreview = contactPickerPurpose === 'scan-preview'
  const contactPickerModalTitle = isScanContactPreview
    ? 'Contact preview'
    : contactPickerPurpose === 'forward-message'
      ? 'Forward to'
      : contactPickerPurpose === 'add-contact'
        ? 'Add contacts'
        : 'New chat'
  const contactPickerModalIcon = isScanContactPreview
    ? 'qr-code-outline'
    : contactPickerPurpose === 'forward-message'
      ? 'return-down-forward-outline'
      : contactPickerPurpose === 'add-contact'
        ? 'person-add-outline'
        : 'chatbubble-ellipses-outline'

  const activeConversationRows = useMemo(
    () =>
      messageSettings.showActiveNow
        ? sortMessageRowsWithSettings(visibleConversationRows, messageSettings, presenceByUserId).filter((item) =>
        Boolean(item.presence?.is_online || presenceByUserId[item.other_user_id]?.is_online)
      )
        : [],
    [messageSettings, presenceByUserId, visibleConversationRows]
  )

  function showRedPacketDetails(redPacket) {
    if (!redPacket?.id || !redPacket.openedRecipients?.length) {
      Alert.alert('Red packet', 'No one has opened this red packet yet.')
      return
    }

    setRedPacketDetailsId(redPacket.id)
  }

  function renderRedPacketOpenedActivity(message, redPacket) {
    if (!isRedPacketMessage(message) || message.sender_id !== currentUser?.id) return null
    if (!redPacket?.openedRecipients?.length) return null

    return (
      <View style={{ alignItems: 'center', marginTop: -2, marginBottom: 8, paddingHorizontal: 18 }}>
        {redPacket.openedRecipients.map((recipient) => {
          const name = getProfileName(recipient.profile, 'Member')

          return (
            <TouchableOpacity
              key={`red-packet-activity-${redPacket.id}-${recipient.user_id}`}
              onPress={() => showRedPacketDetails(redPacket)}
              activeOpacity={0.84}
              style={{
                maxWidth: '92%',
                borderRadius: 999,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.surface,
                paddingHorizontal: 12,
                paddingVertical: 7,
                marginTop: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Ionicons name="gift-outline" size={13} color="#dc2626" />
              <Text
                numberOfLines={1}
                style={{ color: theme.text, fontSize: 11, fontWeight: '800', flexShrink: 1 }}
              >
                {name} opened red packet
              </Text>
              <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '900' }}>
                See details
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
    )
  }

  const attachmentActions = [
    {
      key: 'photo',
      icon: 'image-outline',
      title: 'Photo',
      color: '#22c55e',
    },
    {
      key: 'camera',
      icon: 'camera-outline',
      title: 'Camera',
      color: '#0ea5e9',
    },
    {
      key: 'video-call',
      icon: 'videocam-outline',
      title: 'Video call',
      color: '#8b5cf6',
    },
    {
      key: 'audio-call',
      icon: 'call-outline',
      title: 'Audio call',
      color: '#06b6d4',
    },
    {
      key: 'files',
      icon: 'document-text-outline',
      title: 'Files',
      color: '#f97316',
    },
    {
      key: 'location',
      icon: 'location-outline',
      title: 'Location',
      color: '#14b8a6',
    },
    {
      key: 'red-packet',
      icon: 'gift-outline',
      title: 'Red packet',
      color: '#ef4444',
    },
    {
      key: 'contact-card',
      icon: 'id-card-outline',
      title: 'Contact',
      color: '#64748b',
    },
  ]
  const attachmentMoreActions = [
    {
      key: 'favorite',
      icon: 'heart-outline',
      title: 'Favorite',
      color: '#e11d48',
    },
  ]
  const attachmentActionPages = [attachmentActions, attachmentMoreActions]
  const attachmentPageWidth = Math.max(0, windowWidth - 32)
  const attachmentTileWidth = Math.min(76, Math.max(58, (attachmentPageWidth - 30) / 4))
  const currentRecordingLevel = recorderState?.isRecording
    ? (recordingWaveform[recordingWaveform.length - 1] ?? normalizeMeteringLevel(recorderState?.metering))
    : 0
  const recordingAuraCount = Math.max(5, Math.min(10, 5 + Math.round(currentRecordingLevel * 5)))
  const recordingAuraMaxSize = Math.min(windowWidth * 0.96, windowHeight * 0.48)
  const recordingAuraMinSize = Math.min(110, recordingAuraMaxSize * 0.42)
  const recordingAuraStep = (recordingAuraMaxSize - recordingAuraMinSize) / 9
  const composerTrayVisible = attachmentPickerVisible
  const leftAccessoryWidth = composerFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [42, 0],
  })
  const accessoryOpacity = composerFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  })
  const accessorySpacing = composerFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 0],
  })
  const inputRadius = composerFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [21, 16],
  })
  const inputBackground = composerFocusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#f1f5f9', '#eaf3ff'],
  })

  if (loading && !conversation && conversationRows.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} />
      </SafeAreaView>
    )
  }

  if (!currentUser) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Ionicons name="lock-closed-outline" size={42} color={theme.mutedText} />
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900', marginTop: 12 }}>
          Sign in required
        </Text>
        <Text style={{ color: theme.mutedText, textAlign: 'center', marginTop: 6 }}>
          Please login again to use Rental X messaging.
        </Text>
      </SafeAreaView>
    )
  }

  if (mode === 'list') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <SwipeTabView navigation={navigation} activeTab="chat">
        <View style={{ flex: 1 }}>
          <View
            style={{
              backgroundColor: theme.surface,
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            {selectionMode ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={clearConversationSelection}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                  }}
                >
                  <Ionicons name="close" size={24} color={theme.text} />
                </TouchableOpacity>

                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 24, fontWeight: '900' }}>
                      {selectedConversationIds.length} selected
                    </Text>
                    <Text style={{ color: theme.mutedText, marginTop: 3 }}>
                      Add to folder or remove from your list
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={openSelectedChatFolderAssignment}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: theme.accentSoft,
                      marginRight: 8,
                    }}
                  >
                    <Ionicons name="folder-open-outline" size={21} color={theme.accent} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={deleteSelectedConversations}
                    style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#fee2e2',
                  }}
                >
                  <Ionicons name="trash-outline" size={22} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ color: theme.text, fontSize: 26, fontWeight: '900' }}>
                    Messages
                  </Text>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      onPress={openMessagingSettings}
                      activeOpacity={0.85}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: theme.surfaceMuted,
                        borderWidth: 1,
                        borderColor: theme.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="settings-outline" size={21} color={theme.accent} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setQuickChatMenuVisible(true)}
                      activeOpacity={0.85}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: theme.accentSoft,
                        borderWidth: 1,
                        borderColor: theme.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="add" size={24} color={theme.accent} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View
                  style={{
                    width: '100%',
                    height: 46,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surfaceMuted,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 12,
                    marginTop: 12,
                  }}
                >
                  <Ionicons name="search" size={18} color={theme.mutedText} />
                  <TextInput
                    ref={conversationSearchInputRef}
                    value={conversationSearchQuery}
                    onChangeText={setConversationSearchQuery}
                    placeholder="Search or enter Rental X ID"
                    placeholderTextColor={theme.mutedText}
                    returnKeyType="search"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onSubmitEditing={() => startContactFromRentalXId()}
                    style={{
                      flex: 1,
                      color: theme.text,
                      fontSize: 14,
                      marginLeft: 8,
                    }}
                  />
                  {conversationSearchQuery ? (
                    <>
                      <TouchableOpacity
                        onPress={() => startContactFromRentalXId()}
                        disabled={addingContactFromSearch}
                        activeOpacity={0.82}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 15,
                          backgroundColor: theme.accentSoft,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginLeft: 6,
                        }}
                      >
                        {addingContactFromSearch ? (
                          <ActivityIndicator size="small" color={theme.accent} />
                        ) : (
                          <Ionicons name="person-add-outline" size={17} color={theme.accent} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setConversationSearchQuery('')}
                        style={{ marginLeft: 6 }}
                      >
                        <Ionicons name="close-circle" size={18} color={theme.mutedText} />
                      </TouchableOpacity>
                    </>
                  ) : null}
                </View>
              </>
            )}
          </View>

          <Modal
            visible={quickChatMenuVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setQuickChatMenuVisible(false)}
          >
            <Pressable
              onPress={() => setQuickChatMenuVisible(false)}
              style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.12)' }}
            >
              <Pressable
                onPress={() => {}}
                style={{
                  position: 'absolute',
                  top: insets.top + 58,
                  right: 16,
                  width: 178,
                  backgroundColor: theme.surface,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.border,
                  paddingVertical: 6,
                  overflow: 'hidden',
                }}
              >
                {quickChatActions.map((action) => (
                  <TouchableOpacity
                    key={action.key}
                    onPress={() => handleQuickChatAction(action.key)}
                    activeOpacity={0.84}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                    }}
                  >
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        backgroundColor: theme.accentSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 9,
                      }}
                    >
                      <Ionicons name={action.icon} size={16} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: 12, fontWeight: '900' }}>
                        {action.title}
                      </Text>
                      <Text style={{ color: theme.mutedText, fontSize: 10, marginTop: 1 }}>
                        {action.subtitle}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </Pressable>
            </Pressable>
            </Modal>

            <Modal
              visible={chatFolderCreatorVisible}
              transparent
              animationType="fade"
              onRequestClose={() => setChatFolderCreatorVisible(false)}
            >
              <Pressable
                onPress={() => setChatFolderCreatorVisible(false)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 20,
                  backgroundColor: 'rgba(15, 23, 42, 0.28)',
                }}
              >
                <Pressable
                  onPress={() => {}}
                  style={{
                    width: '100%',
                    maxWidth: 360,
                    borderRadius: 22,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    padding: 16,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        backgroundColor: theme.accentSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 10,
                      }}
                    >
                      <Ionicons name="folder-outline" size={19} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>
                        New chat folder
                      </Text>
                      <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 2 }}>
                        Give it a short unique name.
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      height: 44,
                      borderRadius: 15,
                      borderWidth: 1,
                      borderColor: theme.border,
                      backgroundColor: theme.surfaceMuted,
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 12,
                      marginTop: 14,
                    }}
                  >
                    <Ionicons
                      name="pricetag-outline"
                      size={17}
                      color={getNextChatFolderColor(customChatFolders)}
                    />
                    <TextInput
                      value={newChatFolderName}
                      onChangeText={setNewChatFolderName}
                      placeholder="Folder name"
                      placeholderTextColor={theme.mutedText}
                      maxLength={22}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={createCustomChatFolder}
                      style={{
                        flex: 1,
                        color: theme.text,
                        fontSize: 14,
                        fontWeight: '800',
                        marginLeft: 8,
                      }}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                    <TouchableOpacity
                      onPress={() => setChatFolderCreatorVisible(false)}
                      style={{
                        flex: 1,
                        height: 42,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: theme.surfaceMuted,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
                        Cancel
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={createCustomChatFolder}
                      style={{
                        flex: 1,
                        height: 42,
                        borderRadius: 14,
                        backgroundColor: getNextChatFolderColor(customChatFolders),
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>
                        Create
                      </Text>
                    </TouchableOpacity>
                  </View>
                </Pressable>
              </Pressable>
            </Modal>

            <Modal
              visible={chatFolderAssignmentVisible}
              transparent
              animationType="slide"
              onRequestClose={() => setChatFolderAssignmentVisible(false)}
            >
              <Pressable
                onPress={() => setChatFolderAssignmentVisible(false)}
                style={{
                  flex: 1,
                  justifyContent: 'flex-end',
                  backgroundColor: 'rgba(15, 23, 42, 0.30)',
                }}
              >
                <Pressable
                  onPress={() => {}}
                  style={{
                    backgroundColor: theme.surface,
                    borderTopLeftRadius: 24,
                    borderTopRightRadius: 24,
                    borderWidth: 1,
                    borderColor: theme.border,
                    paddingHorizontal: 16,
                    paddingTop: 10,
                    paddingBottom: Math.max(insets.bottom, 10) + 14,
                  }}
                >
                  <View
                    style={{
                      width: 42,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: theme.border,
                      alignSelf: 'center',
                      marginBottom: 12,
                    }}
                  />

                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: theme.accentSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 10,
                      }}
                    >
                      <Ionicons name="folder-open-outline" size={20} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>
                        Add to folder
                      </Text>
                      <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 2 }}>
                        {selectedConversationIds.length} selected chat{selectedConversationIds.length === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        setChatFolderAssignmentVisible(false)
                        openChatFolderCreator()
                      }}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 17,
                        backgroundColor: theme.accentSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="add" size={20} color={theme.accent} />
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ gap: 9, paddingBottom: 2 }}
                  >
                    {assignableChatFolders.map((folder) => {
                      const selectedInFolder = getChatFolderSelectionState(folder.id)

                      return (
                        <TouchableOpacity
                          key={`assign-folder-${folder.id}`}
                          onPress={() => toggleSelectedChatsInFolder(folder.id)}
                          activeOpacity={0.84}
                          style={{
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: selectedInFolder ? folder.color : theme.border,
                            backgroundColor: selectedInFolder
                              ? hexToRgba(folder.color, 0.13)
                              : theme.surfaceMuted,
                            padding: 11,
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                        >
                          <View
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 18,
                              backgroundColor: hexToRgba(folder.color, selectedInFolder ? 0.22 : 0.13),
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginRight: 10,
                            }}
                          >
                            <Ionicons name={folder.icon} size={18} color={folder.color} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: folder.color, fontSize: 14, fontWeight: '900' }}>
                              {folder.title}
                            </Text>
                            <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 2 }}>
                              {selectedInFolder ? 'Tap to remove selected chats' : 'Tap to add selected chats'}
                            </Text>
                          </View>
                          <Ionicons
                            name={selectedInFolder ? 'checkmark-circle' : 'add-circle-outline'}
                            size={22}
                            color={selectedInFolder ? folder.color : theme.mutedText}
                          />
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                </Pressable>
              </Pressable>
            </Modal>

            <Modal
              visible={messagingSettingsVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setMessagingSettingsVisible(false)}
          >
            <Pressable
              onPress={() => setMessagingSettingsVisible(false)}
              style={{
                flex: 1,
                justifyContent: 'flex-end',
                backgroundColor: 'rgba(15, 23, 42, 0.32)',
              }}
            >
              <Pressable
                onPress={() => {}}
                style={{
                  maxHeight: Math.min(windowHeight * 0.78, 620),
                  backgroundColor: theme.surface,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  borderWidth: 1,
                  borderColor: theme.border,
                  paddingHorizontal: 16,
                  paddingTop: 10,
                  paddingBottom: Math.max(insets.bottom, 10) + 14,
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: theme.border,
                    alignSelf: 'center',
                    marginBottom: 12,
                  }}
                />

                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: theme.accentSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 10,
                    }}
                  >
                    <Ionicons name="settings-outline" size={21} color={theme.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>
                      Message settings
                    </Text>
                    <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 2 }}>
                      Basic and smart controls
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setMessagingSettingsVisible(false)}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="close" size={20} color={theme.mutedText} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator
                  contentContainerStyle={{ paddingBottom: 18 }}
                >
                  <Text
                    style={{
                      color: theme.mutedText,
                      fontSize: 11,
                      fontWeight: '900',
                      textTransform: 'uppercase',
                      marginTop: 8,
                      marginBottom: 2,
                    }}
                  >
                    Basic
                  </Text>
                  <MessageSettingsRow
                    icon="radio-button-on-outline"
                    title="Active now"
                    subtitle="Show online contacts above your chats."
                    value={messageSettings.showActiveNow}
                    onValueChange={(value) => updateMessageSetting('showActiveNow', value)}
                  />
                  <MessageSettingsRow
                    icon="chatbox-ellipses-outline"
                    title="Message previews"
                    subtitle="Show the latest message text in the list."
                    value={messageSettings.showMessagePreviews}
                    onValueChange={(value) => updateMessageSetting('showMessagePreviews', value)}
                  />
                  <MessageSettingsRow
                    icon="notifications-outline"
                    title="Unread badges"
                    subtitle="Show counters for unread conversations."
                    value={messageSettings.showUnreadBadges}
                    onValueChange={(value) => updateMessageSetting('showUnreadBadges', value)}
                  />
                  <MessageSettingsRow
                    icon="pin-outline"
                    title="Pinned first"
                    subtitle="Keep sticky chats at the top of the inbox."
                    value={messageSettings.keepPinnedFirst}
                    onValueChange={(value) => updateMessageSetting('keepPinnedFirst', value)}
                  />

                  <Text
                    style={{
                      color: theme.mutedText,
                      fontSize: 11,
                      fontWeight: '900',
                      textTransform: 'uppercase',
                      marginTop: 12,
                      marginBottom: 2,
                    }}
                  >
                    Smart
                  </Text>
                  <MessageSettingsRow
                    icon="sparkles-outline"
                    title="Smart inbox"
                    subtitle="Prioritize unread and active chats automatically."
                    value={messageSettings.smartInboxSorting}
                    onValueChange={(value) => updateMessageSetting('smartInboxSorting', value)}
                  />
                  <MessageSettingsRow
                    icon="return-down-forward-outline"
                    title="Smart replies"
                    subtitle="Prepare short reply suggestions for future AI tools."
                    value={messageSettings.smartReplySuggestions}
                    onValueChange={(value) => updateMessageSetting('smartReplySuggestions', value)}
                  />
                  <MessageSettingsRow
                    icon="shield-checkmark-outline"
                    title="Safety reminders"
                    subtitle="Keep scam and suspicious message warnings enabled."
                    value={messageSettings.smartSafetyReminders}
                    onValueChange={(value) => updateMessageSetting('smartSafetyReminders', value)}
                  />
                  <MessageSettingsRow
                    icon="alarm-outline"
                    title="Follow-up nudges"
                    subtitle="Remember chats that may need a reply later."
                    value={messageSettings.followUpNudges}
                    onValueChange={(value) => updateMessageSetting('followUpNudges', value)}
                  />
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>

          <Modal
            visible={contactPickerVisible && contactPickerPurpose !== 'share'}
            transparent
            animationType="slide"
            onRequestClose={() => {
              closeContactPicker()
            }}
          >
            <Pressable
              onPress={() => {
                closeContactPicker()
              }}
              style={{
                flex: 1,
                justifyContent: 'flex-end',
                backgroundColor: 'rgba(15, 23, 42, 0.32)',
              }}
            >
              <Pressable
                onPress={() => {}}
                style={{
                  maxHeight: Math.min(windowHeight * 0.72, 560),
                  backgroundColor: theme.surface,
                  borderTopLeftRadius: 24,
                  borderTopRightRadius: 24,
                  borderWidth: 1,
                  borderColor: theme.border,
                  paddingHorizontal: 16,
                  paddingTop: 10,
                  paddingBottom: Math.max(insets.bottom, 10) + 14,
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: theme.border,
                    alignSelf: 'center',
                    marginBottom: 12,
                  }}
                />

                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: theme.accentSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 10,
                    }}
                  >
                    <Ionicons
                      name={contactPickerModalIcon}
                      size={21}
                      color={theme.accent}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }} numberOfLines={1}>
                      {contactPickerModalTitle}
                    </Text>
                    {contactPickerPurpose === 'forward-message' ? (
                      <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '800', marginTop: 2 }}>
                        Select friends to forward. {selectedForwardContactIds.length}/{FORWARD_MAX_RECIPIENTS}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={closeContactPicker}
                    disabled={Boolean(contactPickerActionLoadingId) || forwardingMessage}
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: contactPickerActionLoadingId || forwardingMessage ? 0.5 : 1,
                    }}
                  >
                    <Ionicons name="close" size={20} color={theme.mutedText} />
                  </TouchableOpacity>
                </View>

                {isScanContactPreview ? null : (
                  <View
                    style={{
                      minHeight: 44,
                      borderRadius: 15,
                      borderWidth: 1,
                      borderColor: theme.border,
                      backgroundColor: theme.surfaceMuted,
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 12,
                      marginBottom: 12,
                    }}
                  >
                    <Ionicons name="search" size={17} color={theme.mutedText} />
                    <TextInput
                      value={contactPickerSearchQuery}
                      onChangeText={setContactPickerSearchQuery}
                      placeholder="Search or enter Rental X ID"
                      placeholderTextColor={theme.mutedText}
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="search"
                      onSubmitEditing={() => findContactByRentalXId()}
                      style={{
                        flex: 1,
                        color: theme.text,
                        fontSize: 13,
                        marginLeft: 8,
                        paddingVertical: 4,
                      }}
                    />
                    {contactPickerSearchQuery ? (
                      <TouchableOpacity
                        onPress={() => findContactByRentalXId()}
                        disabled={loadingContactPicker}
                        activeOpacity={0.82}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 15,
                          backgroundColor: theme.accentSoft,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginLeft: 6,
                        }}
                      >
                        {loadingContactPicker ? (
                          <ActivityIndicator size="small" color={theme.accent} />
                        ) : (
                          <Ionicons name="person-add-outline" size={16} color={theme.accent} />
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}

                {loadingContactPicker && !contactPickerContacts.length ? (
                  <View style={{ paddingVertical: 28 }}>
                    <ActivityIndicator color={theme.accent} />
                  </View>
                ) : (
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ gap: 9, paddingBottom: 4 }}
                  >
                    {visibleContactPickerContacts.map((contact) => {
                      const payload = buildContactCardPayload(contact)
                      const loadingContact = contactPickerActionLoadingId === payload.userId
                      const contactIsAdded = Boolean(contact.is_following)
                      const isAdded = contactPickerPurpose === 'add-contact' && contactIsAdded
                      const isForwardSelected = selectedForwardContactIds.includes(payload.userId)
                      const forwardLimitReached =
                        contactPickerPurpose === 'forward-message' &&
                        selectedForwardContactIds.length >= FORWARD_MAX_RECIPIENTS &&
                        !isForwardSelected
                      const contactPickerActionIcon = isScanContactPreview
                        ? (contactIsAdded ? 'chatbubble-ellipses-outline' : 'person-add-outline')
                        : contactPickerPurpose === 'forward-message'
                          ? (isForwardSelected ? 'checkmark-circle' : 'ellipse-outline')
                          : contactPickerPurpose === 'add-contact'
                            ? (isAdded ? 'checkmark-circle' : 'person-add-outline')
                            : 'chatbubble-ellipses-outline'

                      return (
                        <TouchableOpacity
                          key={`message-contact-${payload.userId}`}
                          onPress={() => handleContactPickerSelect(contact)}
                          disabled={Boolean(contactPickerActionLoadingId) || isAdded || forwardingMessage}
                          activeOpacity={0.84}
                          style={{
                            borderRadius: 16,
                            borderWidth: 1,
                            borderColor: isForwardSelected ? theme.accent : theme.border,
                            backgroundColor: isForwardSelected ? theme.accentSoft : theme.surfaceMuted,
                            padding: 11,
                            flexDirection: 'row',
                            alignItems: 'center',
                            opacity:
                              (contactPickerActionLoadingId && !loadingContact) || forwardingMessage || forwardLimitReached
                                ? 0.55
                                : 1,
                          }}
                        >
                          <Avatar profile={contact} name={payload.displayName} size={44} />
                          <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Text
                                numberOfLines={1}
                                style={{ color: theme.text, fontSize: 14, fontWeight: '900', flexShrink: 1 }}
                              >
                                {payload.displayName}
                              </Text>
                              {payload.isVerified ? (
                                <Ionicons
                                  name="checkmark-circle"
                                  size={14}
                                  color={theme.accent}
                                  style={{ marginLeft: 5 }}
                                />
                              ) : null}
                            </View>
                            <Text
                              numberOfLines={1}
                              style={{ color: theme.mutedText, fontSize: 11, marginTop: 3, fontWeight: '800' }}
                            >
                              {payload.rentalXId ? `ID ${payload.rentalXId}` : 'Rental X contact'}
                            </Text>
                          </View>

                          {loadingContact ? (
                            <ActivityIndicator size="small" color={theme.accent} />
                          ) : contactPickerPurpose === 'forward-message' ? (
                            <View
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 14,
                                backgroundColor: isForwardSelected ? theme.accent : theme.surface,
                                borderWidth: 1,
                                borderColor: isForwardSelected ? theme.accent : theme.border,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <Ionicons
                                name={contactPickerActionIcon}
                                size={17}
                                color={isForwardSelected ? '#fff' : theme.mutedText}
                              />
                            </View>
                          ) : isScanContactPreview && !contactIsAdded ? (
                            <View
                              style={{
                                minHeight: 30,
                                borderRadius: 15,
                                backgroundColor: theme.accentSoft,
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingHorizontal: 9,
                                gap: 5,
                              }}
                            >
                              <Text style={{ color: theme.accentStrong, fontSize: 11, fontWeight: '900' }}>
                                Add
                              </Text>
                              <Ionicons name={contactPickerActionIcon} size={16} color={theme.accent} />
                            </View>
                          ) : (
                            <Ionicons
                              name={contactPickerActionIcon}
                              size={19}
                              color={theme.accent}
                            />
                          )}
                        </TouchableOpacity>
                      )
                    })}

                    {!visibleContactPickerContacts.length ? (
                      <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                        <Ionicons name="person-add-outline" size={34} color={theme.mutedText} />
                        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900', marginTop: 10 }}>
                          No contacts found
                        </Text>
                        <Text style={{ color: theme.mutedText, textAlign: 'center', marginTop: 5 }}>
                          Enter a Rental X ID and tap the add icon.
                        </Text>
                      </View>
                    ) : null}
                  </ScrollView>
                )}

                {contactPickerPurpose === 'forward-message' ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      gap: 10,
                      paddingTop: 12,
                    }}
                  >
                    <TouchableOpacity
                      onPress={closeContactPicker}
                      disabled={forwardingMessage}
                      style={{
                        flex: 1,
                        height: 46,
                        borderRadius: 15,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: theme.surfaceMuted,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: forwardingMessage ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ color: theme.text, fontSize: 14, fontWeight: '900' }}>
                        Cancel
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={sendForwardedMessage}
                      disabled={forwardingMessage || selectedForwardContactIds.length === 0}
                      style={{
                        flex: 1,
                        height: 46,
                        borderRadius: 15,
                        backgroundColor: theme.accent,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: forwardingMessage || selectedForwardContactIds.length === 0 ? 0.55 : 1,
                      }}
                    >
                      {forwardingMessage ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '900' }}>
                          Send {selectedForwardContactIds.length ? `(${selectedForwardContactIds.length}/${FORWARD_MAX_RECIPIENTS})` : ''}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}
              </Pressable>
            </Pressable>
          </Modal>

            {activeConversationRows.length ? (
              <View
                style={{
                  backgroundColor: theme.surface,
                paddingTop: 7,
                paddingBottom: 8,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  marginBottom: 6,
                }}
              >
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: '#22c55e',
                    marginRight: 6,
                  }}
                />
                <Text
                  style={{
                    color: theme.mutedText,
                    fontSize: 10,
                    fontWeight: '900',
                    textTransform: 'uppercase',
                  }}
                >
                  Active now
                </Text>
              </View>

              <FlatList
                data={activeConversationRows}
                keyExtractor={(item) => `active-${item.id}`}
                horizontal
                inverted
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 14 }}
                renderItem={({ item }) => {
                  const activeProfile = item.other_profile
                  const activeName = getProfileName(activeProfile, 'User')
                  const firstName = activeName.split(' ')[0] || activeName

                  return (
                    <TouchableOpacity
                      onPress={() =>
                        openConversation({
                          item,
                          profile: item.other_profile,
                          fromList: true,
                        })
                      }
                      style={{
                        width: 54,
                        marginRight: 8,
                        paddingVertical: 6,
                        borderRadius: 16,
                        backgroundColor: theme.surfaceMuted,
                        borderWidth: 1,
                        borderColor: theme.border,
                        alignItems: 'center',
                      }}
                    >
                      <View>
                        <Avatar profile={activeProfile} name={activeName} size={38} />
                        <View
                          style={{
                            position: 'absolute',
                            right: -1,
                            bottom: -1,
                            width: 11,
                            height: 11,
                            borderRadius: 6,
                            backgroundColor: '#22c55e',
                            borderWidth: 2,
                            borderColor: theme.surfaceMuted,
                          }}
                        />
                      </View>

                      <Text
                        style={{
                          color: theme.text,
                          fontSize: 9,
                          fontWeight: '800',
                          marginTop: 4,
                          textAlign: 'center',
                        }}
                        numberOfLines={1}
                      >
                        {firstName}
                      </Text>
                    </TouchableOpacity>
                  )
                }}
                />
              </View>
            ) : null}

            <View
              style={{
                backgroundColor: theme.surface,
                paddingVertical: 9,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 14,
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                {chatFolders.map((folder) => {
                  const selectedFolder = activeChatFolder?.id === folder.id
                  const folderCount = getChatFolderCount(folder.id)

                  return (
                    <TouchableOpacity
                      key={`chat-folder-${folder.id}`}
                      onPress={() => setActiveChatFolderId(folder.id)}
                      activeOpacity={0.84}
                      style={{
                        minHeight: 34,
                        borderRadius: 17,
                        paddingHorizontal: 11,
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: selectedFolder
                          ? folder.color
                          : hexToRgba(folder.color, 0.12),
                        borderWidth: 1,
                        borderColor: selectedFolder
                          ? folder.color
                          : hexToRgba(folder.color, 0.34),
                      }}
                    >
                      <Ionicons
                        name={folder.icon}
                        size={14}
                        color={selectedFolder ? '#fff' : folder.color}
                        style={{ marginRight: 5 }}
                      />
                      <Text
                        style={{
                          color: selectedFolder ? '#fff' : folder.color,
                          fontSize: 12,
                          fontWeight: '900',
                        }}
                        numberOfLines={1}
                      >
                        {folder.title}
                      </Text>
                      <View
                        style={{
                          minWidth: 18,
                          height: 18,
                          borderRadius: 9,
                          paddingHorizontal: 5,
                          backgroundColor: selectedFolder
                            ? 'rgba(255,255,255,0.22)'
                            : hexToRgba(folder.color, 0.16),
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginLeft: 6,
                        }}
                      >
                        <Text
                          style={{
                            color: selectedFolder ? '#fff' : folder.color,
                            fontSize: 10,
                            fontWeight: '900',
                          }}
                        >
                          {folderCount}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )
                })}

                <TouchableOpacity
                  onPress={openChatFolderCreator}
                  activeOpacity={0.84}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: theme.accentSoft,
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Ionicons name="add" size={20} color={theme.accent} />
                </TouchableOpacity>
              </ScrollView>
            </View>

            <FlatList
              data={messageListRows}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <ConversationRow
                item={item}
                currentUserId={currentUser?.id}
                presenceByUserId={presenceByUserId}
                showPreview={messageSettings.showMessagePreviews}
                showUnreadBadge={messageSettings.showUnreadBadges}
                selected={selectedConversationIds.includes(item.id)}
                selectionMode={selectionMode}
                onPress={() => {
                  if (selectionMode) {
                    toggleConversationSelection(item.id)
                    return
                  }

                  openConversation({
                    item,
                    profile: item.other_profile,
                    fromList: true,
                  })
                }}
                onLongPress={() => toggleConversationSelection(item.id)}
              />
            )}
            refreshing={loading}
            onRefresh={() => loadConversationList(currentUser)}
            ListEmptyComponent={
                <View style={{ alignItems: 'center', padding: 34 }}>
                  <Ionicons name="chatbubbles-outline" size={48} color={theme.mutedText} />
                  <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900', marginTop: 12 }}>
                    {conversationSearchQuery
                      ? 'No chats found'
                      : activeChatFolder?.id !== 'all'
                        ? `No chats in ${activeChatFolder?.title || 'this folder'}`
                        : 'No messages yet'}
                  </Text>
                  <Text style={{ color: theme.mutedText, textAlign: 'center', marginTop: 6 }}>
                    {conversationSearchQuery
                      ? 'Tap the add icon to find a user by Rental X ID.'
                      : activeChatFolder?.id !== 'all'
                        ? 'Long press chats, tap the folder icon, then add them here.'
                        : 'Open a property or owner profile and tap Message to start.'}
                  </Text>
                </View>
            }
          />
        </View>

        {!embeddedTabShell ? (
          <BottomNavBar navigation={navigation} activeTab="chat" />
        ) : null}
        </SwipeTabView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView
      edges={embeddedTabShell ? ['top', 'right', 'bottom', 'left'] : ['top', 'right', 'left']}
      style={{ flex: 1, backgroundColor: activeWallpaperPreset.backgroundColor }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        style={{ flex: 1 }}
        onTouchEnd={dismissReactionPickerFromOutside}
      >
        <View
          style={{
            backgroundColor: theme.surface,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            paddingHorizontal: 10,
            paddingVertical: 9,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <TouchableOpacity
            onPress={goBackFromChat}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 4,
            }}
          >
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>

          <Pressable
            onPress={() =>
              !isActiveGroupChat &&
              otherUser?.id &&
              navigation.navigate('OwnerProfile', {
                owner: {
                  id: otherUser.id || otherUser.user_id,
                  email: otherUser.email,
                  name: otherUserName,
                },
              })
            }
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
          >
            {isActiveGroupChat ? (
              <GroupAvatar
                uri={conversation?.group_avatar_url || otherUser?.avatar_url}
                members={groupMembers.length ? groupMembers : conversation?.group_preview_profiles || []}
                size={36}
              />
            ) : (
              <Avatar profile={otherUser} name={otherUserName} />
            )}

            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  style={{ color: theme.text, fontSize: 16, fontWeight: '900', flexShrink: 1 }}
                  numberOfLines={1}
                >
                  {otherUserName}
                </Text>

                {!isActiveGroupChat && otherUser?.is_verified ? (
                  <Ionicons
                    name="checkmark-circle"
                    size={15}
                    color="#1877F2"
                    style={{ marginLeft: 4 }}
                  />
                ) : null}
              </View>
              <Text
                style={{
                  color: chatStatusText === 'Online' ? '#16a34a' : theme.mutedText,
                  fontSize: 12,
                  fontWeight: chatStatusText === 'typing...' ? '800' : '500',
                }}
              >
                {chatStatusText}
              </Text>
            </View>
          </Pressable>

          <TouchableOpacity
            onPress={openChatSettings}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="information-circle-outline" size={23} color={activeColorPreset.accent} />
          </TouchableOpacity>
        </View>

        {conversationProperty?.title ? (
          <View
            style={{
              backgroundColor: theme.surface,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <Text style={{ color: theme.mutedText, fontSize: 12, fontWeight: '700' }}>
              Property
            </Text>
            <Text style={{ color: theme.text, fontWeight: '900' }} numberOfLines={1}>
              {conversationProperty.title}
            </Text>
          </View>
        ) : null}

        <View
          style={{ flex: 1 }}
          onTouchEnd={dismissReactionPickerFromOutside}
        >
          <View
            pointerEvents="none"
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: activeWallpaperPreset.backgroundColor,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 28,
              right: -40,
              width: 220,
              height: 220,
              borderRadius: 999,
              backgroundColor: activeWallpaperPreset.overlay,
              opacity: activeWallpaperPreset.id === 'night' ? 0.22 : 0.45,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: 40,
              left: -30,
              width: 170,
              height: 170,
              borderRadius: 999,
              backgroundColor: activeWallpaperPreset.overlay,
              opacity: activeWallpaperPreset.id === 'night' ? 0.16 : 0.28,
            }}
          />

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => {
              const redPacket = redPacketsByMessageId[item.id]
              const senderProfile =
                item.sender_id === currentUser?.id
                  ? currentUserGroupProfile
                  : groupMemberProfilesById[item.sender_id] || {
                    id: item.sender_id,
                    user_id: item.sender_id,
                    display_name: 'Group member',
                  }

              return (
                <View>
                  <MessageBubble
                    item={item}
                    previousMessage={messages[index - 1]}
                    currentUserId={currentUser?.id}
                    repliedMessage={item.reply_to_message_id ? messageLookup[item.reply_to_message_id] : null}
                    onOpenMedia={openMediaViewer}
                    onReply={handleReplyToMessage}
                    onJumpToMessage={jumpToMessage}
                    onPressCallHistory={handlePressCallHistory}
                    onToggleReaction={toggleMessageReaction}
                    onSetReaction={toggleMessageReaction}
                    reactionPickerOpen={activeReactionMessageId === item.id}
                    onRequestReactionPicker={requestReactionPicker}
                    onDismissReactionPicker={dismissReactionPicker}
                    onReactionInteraction={markReactionInteraction}
                    onLongPressMessage={openMessageActions}
                    redPacket={redPacket}
                    onOpenRedPacket={openRedPacket}
                    onShowRedPacketDetails={showRedPacketDetails}
                    openingRedPacketId={openingRedPacketId}
                    onOpenContactCard={openContactCard}
                    senderProfile={senderProfile}
                    showSenderIdentity={isActiveGroupChat}
                    linkPreview={
                      linkPreviewsEnabled
                        ? linkPreviewsByUrl[extractFirstLink(item.body)]
                        : null
                    }
                    outgoingBubbleColor={activeColorPreset.bubble}
                    outgoingAccentColor={activeColorPreset.accent}
                    highlighted={highlightedMessageId === item.id}
                  />
                  {renderRedPacketOpenedActivity(item, redPacket)}
                </View>
              )
            }}
            contentContainerStyle={{ paddingTop: 10, paddingBottom: 16 }}
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            keyboardShouldPersistTaps="handled"
            onTouchEnd={dismissReactionPickerFromOutside}
            onScrollBeginDrag={dismissReactionPicker}
            onContentSizeChange={() => scrollToBottom(true)}
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                  index: info.index,
                  animated: true,
                  viewPosition: 0.35,
                })
              }, 350)
            }}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 80 }}>
                <Ionicons name="chatbubble-ellipses-outline" size={48} color={theme.mutedText} />
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: '900', marginTop: 12 }}>
                  Start chatting
                </Text>
                <Text style={{ color: theme.mutedText, textAlign: 'center', marginTop: 6 }}>
                  Send a message, photo, video, or voice note.
                </Text>
              </View>
            }
          />
        </View>

        {recorderState?.isRecording ? (
          <View
            style={{
              marginHorizontal: 12,
              marginBottom: 8,
              backgroundColor: '#fee2e2',
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 9,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Animated.View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: '#dc2626',
                transform: [
                  {
                    scale: recordingPulseAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.28],
                    }),
                  },
                ],
                opacity: recordingPulseAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.88, 0.36],
                }),
              }}
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ color: '#991b1b', fontWeight: '900' }}>
                Recording {formatDuration(recorderState.durationMillis)}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 5 }}>
                {(recordingWaveform.length ? recordingWaveform : [0.18, 0.24, 0.2, 0.3, 0.16, 0.22]).map((level, index, items) => {
                  const barHeight = 8 + Math.round(level * 20)

                  return (
                    <View
                      key={`recording-bar-${index}`}
                      style={{
                        width: 5,
                        height: barHeight,
                        borderRadius: 999,
                        marginRight: index === items.length - 1 ? 0 : 3,
                        backgroundColor: '#ef4444',
                        opacity: 0.9,
                      }}
                    />
                  )
                })}
              </View>
            </View>
            <Text style={{ color: '#991b1b', marginLeft: 10, fontWeight: '700' }}>
              Tap stop to review
            </Text>
          </View>
        ) : null}

        {pendingVoiceNote?.uri && !recorderState?.isRecording ? (
          <View
            style={{
              marginHorizontal: 12,
              marginBottom: 8,
              backgroundColor: '#eff6ff',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                onPress={toggleVoicePreviewPlayback}
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: '#1877F2',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons
                  name={voicePreviewStatus?.playing ? 'pause' : 'play'}
                  size={18}
                  color="#fff"
                />
              </TouchableOpacity>

              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ color: theme.text, fontWeight: '900' }}>
                  Review your voice message
                </Text>
                <Text style={{ color: theme.mutedText, marginTop: 3, fontSize: 12 }}>
                  {formatDuration(Math.floor((voicePreviewStatus?.currentTime || 0) * 1000))} / {formatDuration(pendingVoiceNote.durationMillis)}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 10 }}>
              {(pendingVoiceNote.waveformLevels || []).map((level, index, items) => {
                const ratio =
                  pendingVoiceNote.durationMillis > 0
                    ? Math.min(
                      Math.floor((voicePreviewStatus?.currentTime || 0) * 1000) / pendingVoiceNote.durationMillis,
                      1
                    )
                    : 0
                const active = ratio >= (index + 1) / items.length
                const barHeight = 8 + Math.round(level * 20)

                return (
                  <View
                    key={`preview-bar-${index}`}
                    style={{
                      width: 6,
                      height: barHeight,
                      borderRadius: 999,
                      marginRight: index === items.length - 1 ? 0 : 4,
                      backgroundColor: active ? '#1877F2' : '#bfdbfe',
                    }}
                  />
                )
              })}
            </View>

            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <TouchableOpacity
                onPress={discardPendingVoiceNote}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  backgroundColor: theme.surface,
                  borderWidth: 1,
                  borderColor: theme.border,
                  paddingVertical: 10,
                  alignItems: 'center',
                  marginRight: 8,
                }}
              >
                <Text style={{ color: theme.text, fontWeight: '800' }}>Delete</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={sendPendingVoiceNote}
                disabled={uploading || sending}
                style={{
                  flex: 1,
                  borderRadius: 12,
                  backgroundColor: activeColorPreset.accent,
                  paddingVertical: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: uploading || sending ? 0.6 : 1,
                }}
              >
                {uploading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '900' }}>Send voice</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <View
          style={{
            backgroundColor: theme.surface,
            paddingHorizontal: 10,
            paddingTop: 8,
            paddingBottom: composerTrayVisible ? 8 : embeddedTabShell ? Math.max(insets.bottom, 10) : 0,
            borderTopWidth: 1,
            borderTopColor: theme.border,
          }}
        >
          {replyTarget ? (
            <View
              style={{
                marginBottom: 8,
                borderRadius: 14,
                backgroundColor: '#eff6ff',
                borderWidth: 1,
                borderColor: '#bfdbfe',
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: 'row',
                alignItems: 'flex-start',
              }}
            >
              <Pressable
                onPress={() => jumpToMessage(replyTarget.id)}
                style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start' }}
              >
                {replyTarget.message_type === 'image' && replyTarget.media_url ? (
                  <Image
                    source={{ uri: replyTarget.media_url }}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      marginRight: 10,
                      flexShrink: 0,
                      backgroundColor: theme.accentSoft,
                    }}
                    resizeMode="cover"
                  />
                ) : replyTarget.message_type === 'video' ? (
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      marginRight: 10,
                      flexShrink: 0,
                      backgroundColor: theme.accentSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="videocam" size={18} color="#1877F2" />
                  </View>
                ) : replyTarget.message_type === 'voice' ? (
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      marginRight: 10,
                      flexShrink: 0,
                      backgroundColor: theme.accentSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="mic" size={18} color="#1877F2" />
                  </View>
                ) : replyTarget.message_type === 'call' ? (
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      marginRight: 10,
                      flexShrink: 0,
                      backgroundColor: theme.accentSoft,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="call" size={17} color="#1877F2" />
                  </View>
                ) : isLocationMessage(replyTarget) ? (
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      marginRight: 10,
                      flexShrink: 0,
                      backgroundColor: '#dcfce7',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="location" size={18} color="#16a34a" />
                  </View>
                ) : isRedPacketMessage(replyTarget) ? (
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      marginRight: 10,
                      flexShrink: 0,
                      backgroundColor: '#fee2e2',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="gift" size={18} color="#dc2626" />
                  </View>
                ) : isContactCardMessage(replyTarget) ? (
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      marginRight: 10,
                      flexShrink: 0,
                      backgroundColor: '#dcfce7',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="id-card" size={18} color="#16a34a" />
                  </View>
                ) : null}

                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{ color: '#1877F2', fontWeight: '900', fontSize: 12 }}
                    numberOfLines={1}
                  >
                    Replying to {replyTarget.sender_id === currentUser?.id ? 'yourself' : otherUserName}
                  </Text>
                  <Text
                    style={{ color: theme.text, marginTop: 4, fontSize: 12, lineHeight: 17 }}
                    numberOfLines={2}
                  >
                    {getReplySnippet(replyTarget)}
                  </Text>
                </View>
              </Pressable>

              <TouchableOpacity
                onPress={() => setReplyTarget(null)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 8,
                }}
                >
                  <Ionicons name="close" size={20} color={theme.mutedText} />
                </TouchableOpacity>
              </View>
            ) : null}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-end',
                overflow: 'visible',
              }}
            >
              <Animated.View
                style={{
                  width: leftAccessoryWidth,
                  height: 42,
                  marginRight: accessorySpacing,
                  opacity: accessoryOpacity,
                  overflow: recorderState?.isRecording ? 'visible' : 'hidden',
                  zIndex: recorderState?.isRecording ? 20 : 1,
                  elevation: recorderState?.isRecording ? 20 : 0,
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'visible',
                  }}
                >
                  {recorderState?.isRecording
                    ? Array.from({ length: 10 }).map((_, index) => {
                      const active = index < recordingAuraCount
                      const size = recordingAuraMinSize + index * recordingAuraStep
                      const opacityBase = active
                        ? Math.max(0.08, currentRecordingLevel * (0.85 - index * 0.055))
                        : 0.03
                      const rotation = `${(index % 4) * 90}deg`

                      return (
                        <Animated.View
                          key={`recording-aura-${index}`}
                          pointerEvents="none"
                          style={{
                            position: 'absolute',
                            left: 21 - size / 2,
                            top: 21 - size / 2,
                            width: size,
                            height: size,
                            borderTopWidth: 4,
                            borderRightWidth: 4,
                            borderTopColor: hexToRgba(activeColorPreset.accent, opacityBase),
                            borderRightColor: hexToRgba(activeColorPreset.accent, opacityBase),
                            borderLeftColor: 'transparent',
                            borderBottomColor: 'transparent',
                            borderTopLeftRadius: size / 2,
                            borderTopRightRadius: size / 2,
                            borderBottomRightRadius: size / 2,
                            borderBottomLeftRadius: size / 2,
                            transform: [
                              { rotate: rotation },
                              {
                                scale: recordingPulseAnim.interpolate({
                                  inputRange: [0, 1],
                                  outputRange: [0.96, 1.03 + currentRecordingLevel * 0.06],
                                }),
                              },
                            ],
                          }}
                        />
                      )
                    })
                    : null}

                  <TouchableOpacity
                    onPress={() => {
                      if (skipNextMicTapRef.current) {
                        skipNextMicTapRef.current = false
                        return
                      }

                      toggleRecording()
                    }}
                    onLongPress={async () => {
                      skipNextMicTapRef.current = true
                      longPressRecordingRef.current = true

                      if (!recorderState?.isRecording) {
                        const didStart = await startRecording()

                        if (!didStart) {
                          longPressRecordingRef.current = false
                          skipNextMicTapRef.current = false
                        }
                      }
                    }}
                    onPressOut={() => {
                      if (longPressRecordingRef.current && recorderState?.isRecording) {
                        stopAndSendRecordingDirectly()
                      }
                    }}
                    delayLongPress={160}
                    disabled={uploading || sending || !canSend}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 21,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: activeColorPreset.accent,
                      opacity: uploading || sending || !canSend ? 0.55 : 1,
                    }}
                  >
                    {uploading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Ionicons
                        name={recorderState?.isRecording ? 'stop' : 'mic'}
                        size={20}
                        color="#fff"
                      />
                    )}
                  </TouchableOpacity>
                </View>
              </Animated.View>

              <Animated.View
                style={{
                  flex: 1,
                  height: composerInputHeight,
                  minHeight: COMPOSER_INPUT_MIN_HEIGHT,
                  maxHeight: COMPOSER_INPUT_MAX_HEIGHT,
                  borderRadius: inputRadius,
                  backgroundColor: inputBackground,
                }}
              >
                <TextInput
                  ref={messageInputRef}
                  value={messageText}
                  onFocus={() => {
                    setAttachmentPickerVisible(false)
                    setComposerFocused(true)
                    scheduleKeyboardAwareScroll(40)
                  }}
                  onBlur={() => setComposerFocused(false)}
                  onChangeText={(text) => {
                    setMessageText(text)

                    if (!conversation?.id || (!isActiveGroupChat && !otherUser?.id)) return

                    updateMyPresence({ online: true, typing: text.trim().length > 0 })

                    if (typingTimeoutRef.current) {
                      clearTimeout(typingTimeoutRef.current)
                    }

                    typingTimeoutRef.current = setTimeout(() => {
                      updateMyPresence({ online: true, typing: false })
                    }, 2500)
                  }}
                  placeholder={
                    isActiveGroupChat && !groupCanSend
                      ? 'Only admins can send messages'
                      : 'Type a message'
                  }
                  placeholderTextColor="#94a3b8"
                  multiline
                  onContentSizeChange={handleComposerContentSizeChange}
                  scrollEnabled={composerInputHeight >= COMPOSER_INPUT_MAX_HEIGHT}
                  editable={!isActiveGroupChat || groupCanSend}
                  style={{
                    height: composerInputHeight,
                    minHeight: COMPOSER_INPUT_MIN_HEIGHT,
                    maxHeight: COMPOSER_INPUT_MAX_HEIGHT,
                    paddingHorizontal: 15,
                    paddingTop: 10,
                    paddingBottom: 10,
                    textAlignVertical: 'top',
                    color: theme.text,
                    fontSize: 15,
                    lineHeight: 20,
                  }}
                />
              </Animated.View>

              <TouchableOpacity
                onPress={openAttachmentPicker}
                disabled={uploading || sending || !canSend}
                activeOpacity={0.82}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 2,
                  backgroundColor: attachmentPickerVisible ? hexToRgba(activeColorPreset.accent, 0.14) : 'transparent',
                  opacity: uploading || sending || !canSend ? 0.55 : 1,
                }}
              >
                <Ionicons name="add-circle-outline" size={23} color={activeColorPreset.accent} />
              </TouchableOpacity>

              {messageText.trim() ? (
                <TouchableOpacity
                  onPress={sendTextMessage}
                  disabled={sending}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 21,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: activeColorPreset.accent,
                    marginLeft: 8,
                    opacity: sending ? 0.55 : 1,
                  }}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="send" size={18} color="#fff" />
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {attachmentPickerVisible ? (
            <View
              style={{
                backgroundColor: theme.surface,
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                borderTopWidth: 1,
                borderTopColor: theme.border,
                paddingHorizontal: 16,
                paddingTop: 12,
                paddingBottom: Math.max(insets.bottom, 10) + 12,
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: theme.border,
                  alignSelf: 'center',
                  marginBottom: 12,
                }}
              />

              <ScrollView
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                decelerationRate="fast"
                onMomentumScrollEnd={(event) => {
                  const nextIndex = Math.round(
                    event.nativeEvent.contentOffset.x / Math.max(attachmentPageWidth, 1)
                  )
                  setAttachmentPageIndex(nextIndex)
                }}
              >
                {attachmentActionPages.map((pageActions, pageIndex) => (
                  <View
                    key={`attachment-page-${pageIndex}`}
                    style={{
                      width: attachmentPageWidth,
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: 10,
                      justifyContent: 'space-between',
                      paddingRight: pageIndex === attachmentActionPages.length - 1 ? 0 : 8,
                    }}
                  >
                    {pageActions.map((action) => (
                      <TouchableOpacity
                        key={action.key}
                        onPress={() => handleAttachmentAction(action.key)}
                        activeOpacity={0.84}
                        disabled={uploading || sending}
                        style={{
                          width: attachmentTileWidth,
                          minHeight: 68,
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingVertical: 6,
                          opacity: uploading || sending ? 0.55 : 1,
                        }}
                      >
                        <View
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 19,
                            backgroundColor: hexToRgba(action.color, 0.16),
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: 5,
                          }}
                        >
                          <Ionicons name={action.icon} size={19} color={action.color} />
                        </View>
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 10,
                            fontWeight: '900',
                            textAlign: 'center',
                          }}
                          numberOfLines={1}
                        >
                          {action.title}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </ScrollView>

              <View
                pointerEvents="none"
                style={{
                  flexDirection: 'row',
                  alignSelf: 'center',
                  gap: 5,
                  marginTop: 8,
                }}
              >
                {attachmentActionPages.map((_, pageIndex) => (
                  <View
                    key={`attachment-dot-${pageIndex}`}
                    style={{
                      width: pageIndex === attachmentPageIndex ? 14 : 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: pageIndex === attachmentPageIndex ? activeColorPreset.accent : theme.border,
                    }}
                  />
                ))}
              </View>
            </View>
          ) : null}
      </KeyboardAvoidingView>

      <Modal
        visible={contactPickerVisible && ['share', 'forward-message'].includes(contactPickerPurpose)}
        transparent
        animationType="slide"
        onRequestClose={() => {
          closeContactPicker()
        }}
      >
        <Pressable
          onPress={() => {
            closeContactPicker()
          }}
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(15, 23, 42, 0.32)',
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              maxHeight: Math.min(windowHeight * 0.7, 560),
              backgroundColor: theme.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              borderColor: theme.border,
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: Math.max(insets.bottom, 10) + 14,
            }}
          >
            <View
              style={{
                width: 42,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.border,
                alignSelf: 'center',
                marginBottom: 12,
              }}
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: theme.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}
              >
                <Ionicons
                  name={contactPickerPurpose === 'forward-message' ? 'return-down-forward-outline' : 'id-card-outline'}
                  size={21}
                  color={theme.accent}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }} numberOfLines={1}>
                  {contactPickerPurpose === 'forward-message' ? 'Forward to' : 'Share contact'}
                </Text>
                {contactPickerPurpose === 'forward-message' ? (
                  <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '800', marginTop: 2 }}>
                    Select people. {selectedForwardContactIds.length}/{FORWARD_MAX_RECIPIENTS}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={closeContactPicker}
                disabled={sendingContactCard || forwardingMessage}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: sendingContactCard || forwardingMessage ? 0.5 : 1,
                }}
              >
                <Ionicons name="close" size={20} color={theme.mutedText} />
              </TouchableOpacity>
            </View>

            <View
              style={{
                minHeight: 44,
                borderRadius: 15,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.surfaceMuted,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 12,
                marginBottom: 12,
              }}
            >
              <Ionicons name="search" size={17} color={theme.mutedText} />
              <TextInput
                value={contactPickerSearchQuery}
                onChangeText={setContactPickerSearchQuery}
                placeholder="Search or enter Rental X ID"
                placeholderTextColor={theme.mutedText}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => findContactByRentalXId()}
                style={{
                  flex: 1,
                  color: theme.text,
                  fontSize: 13,
                  marginLeft: 8,
                  paddingVertical: 4,
                }}
              />
              {contactPickerSearchQuery ? (
                <TouchableOpacity
                  onPress={() => findContactByRentalXId()}
                  disabled={loadingContactPicker}
                  activeOpacity={0.82}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: theme.accentSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: 6,
                  }}
                >
                  {loadingContactPicker ? (
                    <ActivityIndicator size="small" color={theme.accent} />
                  ) : (
                    <Ionicons name="person-add-outline" size={16} color={theme.accent} />
                  )}
                </TouchableOpacity>
              ) : null}
            </View>

            {loadingContactPicker && !contactPickerContacts.length ? (
              <View style={{ paddingVertical: 28 }}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ gap: 9, paddingBottom: 4 }}
              >
                {visibleContactPickerContacts.map((contact) => {
                  const payload = buildContactCardPayload(contact)
                  const isMe = payload.userId === currentUser?.id
                  const initial = payload.displayName.charAt(0).toUpperCase()
                  const isForwardMode = contactPickerPurpose === 'forward-message'
                  const isForwardSelected = selectedForwardContactIds.includes(payload.userId)
                  const forwardLimitReached =
                    isForwardMode &&
                    selectedForwardContactIds.length >= FORWARD_MAX_RECIPIENTS &&
                    !isForwardSelected

                  return (
                    <TouchableOpacity
                      key={`contact-share-${contactPickerPurpose}-${payload.userId}`}
                      onPress={() => handleContactPickerSelect(contact)}
                      disabled={
                        sendingContactCard ||
                        forwardingMessage ||
                        Boolean(contactPickerActionLoadingId) ||
                        forwardLimitReached
                      }
                      activeOpacity={0.84}
                      style={{
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: isForwardSelected ? theme.accent : theme.border,
                        backgroundColor: isForwardSelected ? theme.accentSoft : theme.surfaceMuted,
                        padding: 11,
                        flexDirection: 'row',
                        alignItems: 'center',
                        opacity:
                          sendingContactCard ||
                          forwardingMessage ||
                          contactPickerActionLoadingId ||
                          forwardLimitReached
                            ? 0.65
                            : 1,
                      }}
                    >
                      {payload.avatarUrl ? (
                        <Image
                          source={{ uri: payload.avatarUrl }}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: theme.surface,
                          }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            backgroundColor: theme.accentSoft,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ color: theme.accentStrong, fontSize: 16, fontWeight: '900' }}>
                            {initial}
                          </Text>
                        </View>
                      )}

                      <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text
                            numberOfLines={1}
                            style={{ color: theme.text, fontSize: 14, fontWeight: '900', flexShrink: 1 }}
                          >
                            {isMe ? 'My contact' : payload.displayName}
                          </Text>
                          {payload.isVerified ? (
                            <Ionicons
                              name="checkmark-circle"
                              size={14}
                              color={theme.accent}
                              style={{ marginLeft: 5 }}
                            />
                          ) : null}
                        </View>
                        <Text
                          numberOfLines={1}
                          style={{ color: theme.mutedText, fontSize: 11, marginTop: 3, fontWeight: '800' }}
                        >
                          {payload.rentalXId ? `ID ${payload.rentalXId}` : 'Rental X contact'}
                        </Text>
                      </View>

                      {sendingContactCard || contactPickerActionLoadingId === payload.userId ? (
                        <ActivityIndicator size="small" color={theme.accent} />
                      ) : isForwardMode ? (
                        <View
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            backgroundColor: isForwardSelected ? theme.accent : theme.surface,
                            borderWidth: 1,
                            borderColor: isForwardSelected ? theme.accent : theme.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons
                            name={isForwardSelected ? 'checkmark-circle' : 'ellipse-outline'}
                            size={17}
                            color={isForwardSelected ? '#fff' : theme.mutedText}
                          />
                        </View>
                      ) : (
                        <Ionicons
                          name={
                            contactPickerPurpose === 'new-chat'
                              ? 'chatbubble-ellipses-outline'
                              : contactPickerPurpose === 'add-contact'
                                ? (contact.is_following ? 'checkmark-circle' : 'person-add-outline')
                                : 'send-outline'
                          }
                          size={18}
                          color={theme.accent}
                        />
                      )}
                    </TouchableOpacity>
                  )
                })}

                {!visibleContactPickerContacts.length ? (
                  <View style={{ alignItems: 'center', paddingVertical: 28 }}>
                    <Ionicons name="id-card-outline" size={34} color={theme.mutedText} />
                    <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900', marginTop: 10 }}>
                      No contacts found
                    </Text>
                    <Text style={{ color: theme.mutedText, textAlign: 'center', marginTop: 5 }}>
                      Enter a Rental X ID and tap the add icon.
                    </Text>
                  </View>
                ) : null}
              </ScrollView>
            )}

            {contactPickerPurpose === 'forward-message' ? (
              <View
                style={{
                  flexDirection: 'row',
                  gap: 10,
                  paddingTop: 12,
                }}
              >
                <TouchableOpacity
                  onPress={closeContactPicker}
                  disabled={forwardingMessage}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: 15,
                    borderWidth: 1,
                    borderColor: theme.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: forwardingMessage ? 0.55 : 1,
                  }}
                >
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={sendForwardedMessage}
                  disabled={forwardingMessage || selectedForwardContactIds.length === 0}
                  style={{
                    flex: 1.4,
                    minHeight: 44,
                    borderRadius: 15,
                    backgroundColor: theme.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 7,
                    opacity: forwardingMessage || selectedForwardContactIds.length === 0 ? 0.55 : 1,
                  }}
                >
                  {forwardingMessage ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="return-down-forward-outline" size={17} color="#fff" />
                  )}
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '900' }}>
                    Send {selectedForwardContactIds.length ? `(${selectedForwardContactIds.length}/${FORWARD_MAX_RECIPIENTS})` : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={redPacketComposerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!sendingRedPacket) {
            setRedPacketComposerVisible(false)
          }
        }}
      >
        <Pressable
          onPress={() => {
            if (!sendingRedPacket) {
              setRedPacketComposerVisible(false)
            }
          }}
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(15, 23, 42, 0.32)',
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.top}
          >
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: theme.surface,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                borderWidth: 1,
                borderColor: theme.border,
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: Math.max(insets.bottom, 10) + 14,
              }}
            >
              <View
                style={{
                  width: 42,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: theme.border,
                  alignSelf: 'center',
                  marginBottom: 12,
                }}
              />

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: '#fee2e2',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                  }}
                >
                  <Ionicons name="gift" size={20} color="#dc2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>
                    Send red packet
                  </Text>
                  <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 2 }}>
                    {isActiveGroupChat
                      ? 'Choose all group members or selected members.'
                      : 'A gift the receiver can open once.'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setRedPacketComposerVisible(false)}
                  disabled={sendingRedPacket}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: sendingRedPacket ? 0.5 : 1,
                  }}
                >
                  <Ionicons name="close" size={20} color={theme.mutedText} />
                </TouchableOpacity>
              </View>

              {isActiveGroupChat ? (
                <View
                  style={{
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surfaceMuted,
                    padding: 10,
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {[
                      {
                        key: 'group_all',
                        label: `All ${eligibleRedPacketMembers.length}`,
                        icon: 'people-outline',
                      },
                      {
                        key: 'group_selected',
                        label: `Selected ${selectedRedPacketMemberIds.length}`,
                        icon: 'checkmark-circle-outline',
                      },
                    ].map((option) => {
                      const active = option.key === 'group_selected'
                        ? redPacketTargetMode === 'group_selected'
                        : redPacketTargetMode !== 'group_selected'

                      return (
                        <TouchableOpacity
                          key={`red-packet-target-${option.key}`}
                          onPress={() => {
                            setRedPacketTargetMode(option.key)
                            if (option.key === 'group_all') {
                              setSelectedRedPacketMemberIds([])
                            }
                          }}
                          disabled={sendingRedPacket}
                          activeOpacity={0.84}
                          style={{
                            flex: 1,
                            minHeight: 38,
                            borderRadius: 14,
                            backgroundColor: active ? '#dc2626' : theme.surface,
                            borderWidth: 1,
                            borderColor: active ? '#dc2626' : theme.border,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                          }}
                        >
                          <Ionicons
                            name={option.icon}
                            size={16}
                            color={active ? '#fff' : theme.mutedText}
                          />
                          <Text
                            style={{
                              color: active ? '#fff' : theme.text,
                              fontSize: 12,
                              fontWeight: '900',
                            }}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>

                  {redPacketTargetMode === 'group_selected' ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 8, paddingTop: 10 }}
                    >
                      {eligibleRedPacketMembers.map((member) => {
                        const selected = selectedRedPacketMemberIds.includes(member.user_id)
                        const memberName = getProfileName(member.profile, 'User').split(' ')[0] || 'User'

                        return (
                          <TouchableOpacity
                            key={`red-packet-member-${member.user_id}`}
                            onPress={() => toggleRedPacketMemberSelection(member.user_id)}
                            disabled={sendingRedPacket}
                            activeOpacity={0.84}
                            style={{
                              width: 68,
                              borderRadius: 16,
                              borderWidth: 1,
                              borderColor: selected ? '#dc2626' : theme.border,
                              backgroundColor: selected ? '#fee2e2' : theme.surface,
                              paddingVertical: 7,
                              alignItems: 'center',
                            }}
                          >
                            <View>
                              <Avatar profile={member.profile} name={memberName} size={34} />
                              <View
                                style={{
                                  position: 'absolute',
                                  right: -3,
                                  bottom: -3,
                                  width: 17,
                                  height: 17,
                                  borderRadius: 9,
                                  backgroundColor: selected ? '#dc2626' : theme.surfaceMuted,
                                  borderWidth: 1,
                                  borderColor: theme.surface,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Ionicons
                                  name={selected ? 'checkmark' : 'add'}
                                  size={11}
                                  color={selected ? '#fff' : theme.mutedText}
                                />
                              </View>
                            </View>
                            <Text
                              numberOfLines={1}
                              style={{
                                color: selected ? '#991b1b' : theme.text,
                                fontSize: 10,
                                fontWeight: '900',
                                marginTop: 5,
                              }}
                            >
                              {memberName}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </ScrollView>
                  ) : null}
                </View>
              ) : null}

              <View
                style={{
                  borderRadius: 20,
                  backgroundColor: '#b91c1c',
                  overflow: 'hidden',
                  marginBottom: 14,
                }}
              >
                <View
                  style={{
                    backgroundColor: '#dc2626',
                    padding: 14,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TouchableOpacity
                      onPress={pickRedPacketPhoto}
                      disabled={sendingRedPacket}
                      activeOpacity={0.82}
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 16,
                        backgroundColor: 'rgba(255,255,255,0.18)',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        marginRight: 12,
                      }}
                    >
                      {redPacketPhotoAsset?.uri ? (
                        <Image
                          source={{ uri: redPacketPhotoAsset.uri }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                      ) : (
                        <Ionicons name="image-outline" size={24} color="#fff7ed" />
                      )}
                    </TouchableOpacity>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: '#fff7ed', fontSize: 14, fontWeight: '900' }}>
                        Red packet preview
                      </Text>
                      <Text
                        style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, marginTop: 3 }}
                        numberOfLines={2}
                      >
                        {redPacketWish.trim() || 'Best wishes'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View
                  style={{
                    alignItems: 'center',
                    paddingVertical: 14,
                    paddingHorizontal: 14,
                    backgroundColor: '#991b1b',
                  }}
                >
                  <View
                    style={{
                      width: 74,
                      height: 74,
                      borderRadius: 37,
                      backgroundColor: '#facc15',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: '#7f1d1d', fontWeight: '900' }}>Open</Text>
                  </View>
                  <Text style={{ color: '#fde68a', fontSize: 19, fontWeight: '900' }}>
                    {parseRedPacketAmountInput(redPacketAmount) > 0
                      ? formatCurrencyAmount(parseRedPacketAmountInput(redPacketAmount), 'BDT')
                      : '৳ 0'}
                  </Text>
                  {isActiveGroupChat ? (
                    <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, marginTop: 3 }}>
                      {redPacketTargetMode === 'group_selected'
                        ? `${selectedRedPacketMemberIds.length || 0} selected members`
                        : `${eligibleRedPacketMembers.length} members, random split`}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={{ gap: 10 }}>
                <View
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surfaceMuted,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '800', marginBottom: 4 }}>
                    Amount
                  </Text>
                  <TextInput
                    value={redPacketAmount}
                    onChangeText={setRedPacketAmount}
                    keyboardType="decimal-pad"
                    placeholder="Enter gift amount"
                    placeholderTextColor={theme.mutedText}
                    editable={!sendingRedPacket}
                    style={{ color: theme.text, fontSize: 18, fontWeight: '900', paddingVertical: 3 }}
                  />
                </View>

                <View
                  style={{
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: theme.border,
                    backgroundColor: theme.surfaceMuted,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '800', marginBottom: 4 }}>
                    Best wishes
                  </Text>
                  <TextInput
                    value={redPacketWish}
                    onChangeText={setRedPacketWish}
                    placeholder="Write your wish"
                    placeholderTextColor={theme.mutedText}
                    editable={!sendingRedPacket}
                    multiline
                    maxLength={160}
                    style={{ color: theme.text, fontSize: 14, minHeight: 44, textAlignVertical: 'top' }}
                  />
                </View>
              </View>

              <TouchableOpacity
                onPress={sendRedPacket}
                disabled={sendingRedPacket || sending}
                style={{
                  height: 50,
                  borderRadius: 16,
                  backgroundColor: '#dc2626',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 14,
                  opacity: sendingRedPacket || sending ? 0.6 : 1,
                }}
              >
                {sendingRedPacket ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>
                    Send red packet
                  </Text>
                )}
              </TouchableOpacity>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal
        visible={Boolean(activeRedPacketDetails)}
        transparent
        animationType="fade"
        onRequestClose={() => setRedPacketDetailsId(null)}
      >
        <Pressable
          onPress={() => setRedPacketDetailsId(null)}
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: 18,
            backgroundColor: 'rgba(15, 23, 42, 0.38)',
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              maxHeight: Math.min(windowHeight * 0.72, 560),
              borderRadius: 24,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.surface,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                backgroundColor: '#dc2626',
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: 14,
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
                  <Text style={{ color: '#fff7ed', fontSize: 17, fontWeight: '900' }}>
                    Red packet details
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ color: 'rgba(255,255,255,0.82)', fontSize: 12, marginTop: 2, fontWeight: '800' }}
                  >
                    {activeRedPacketDetails?.openedCount || 0}/{activeRedPacketDetails?.recipientCount || 1} opened
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setRedPacketDetailsId(null)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: 'rgba(255,255,255,0.18)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="close" size={20} color="#fff7ed" />
                </TouchableOpacity>
              </View>

              <Text style={{ color: '#fde68a', fontSize: 22, fontWeight: '900', marginTop: 14 }}>
                {activeRedPacketDetails
                  ? formatCurrencyAmount(activeRedPacketDetails.amount, activeRedPacketDetails.currency || 'BDT')
                  : ''}
              </Text>
              {activeRedPacketDetails?.wish ? (
                <Text
                  numberOfLines={2}
                  style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 3 }}
                >
                  {activeRedPacketDetails.wish}
                </Text>
              ) : null}
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 14, gap: 9 }}
            >
              {activeRedPacketDetails?.openedRecipients?.length ? (
                activeRedPacketDetails.openedRecipients.map((recipient) => {
                  const name = getProfileName(recipient.profile, 'Member')

                  return (
                    <View
                      key={`red-packet-details-${activeRedPacketDetails.id}-${recipient.user_id}`}
                      style={{
                        minHeight: 54,
                        borderRadius: 17,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: theme.surfaceMuted,
                        paddingHorizontal: 11,
                        paddingVertical: 9,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <Avatar profile={recipient.profile} name={name} size={34} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          numberOfLines={1}
                          style={{ color: theme.text, fontSize: 13, fontWeight: '900' }}
                        >
                          {name}
                        </Text>
                        <Text style={{ color: theme.mutedText, fontSize: 10, fontWeight: '800', marginTop: 2 }}>
                          Opened red packet
                        </Text>
                      </View>
                      <Text style={{ color: '#dc2626', fontSize: 13, fontWeight: '900' }}>
                        {formatCurrencyAmount(recipient.amount, recipient.currency || activeRedPacketDetails.currency || 'BDT')}
                      </Text>
                    </View>
                  )
                })
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Ionicons name="gift-outline" size={34} color={theme.mutedText} />
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: '900', marginTop: 8 }}>
                    No one opened yet
                  </Text>
                </View>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={locationPreviewLoading || Boolean(locationPreview)}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!locationPreviewLoading) {
            setLocationPreview(null)
          }
        }}
      >
        <Pressable
          onPress={() => {
            if (!locationPreviewLoading) {
              setLocationPreview(null)
            }
          }}
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(15, 23, 42, 0.28)',
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: theme.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              borderWidth: 1,
              borderColor: theme.border,
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: Math.max(insets.bottom, 10) + 14,
            }}
          >
            <View
              style={{
                width: 42,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.border,
                alignSelf: 'center',
                marginBottom: 12,
              }}
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  backgroundColor: theme.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}
              >
                <Ionicons name="location" size={19} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>
                  Share location
                </Text>
                <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 2 }}>
                  Preview before sending
                </Text>
              </View>
              {!locationPreviewLoading ? (
                <TouchableOpacity
                  onPress={() => setLocationPreview(null)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="close" size={20} color={theme.mutedText} />
                </TouchableOpacity>
              ) : null}
            </View>

            <View
              style={{
                height: 190,
                borderRadius: 18,
                overflow: 'hidden',
                backgroundColor: theme.surfaceMuted,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              {locationPreviewLoading ? (
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 18,
                  }}
                >
                  <ActivityIndicator color={theme.accent} />
                  <Text style={{ color: theme.text, fontWeight: '900', marginTop: 12 }}>
                    Detecting your location
                  </Text>
                  <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                    Please wait while we prepare the map preview.
                  </Text>
                </View>
              ) : locationPreview && HAS_ANDROID_GOOGLE_MAPS_KEY ? (
                <MapView
                  pointerEvents="none"
                  style={{ flex: 1 }}
                  region={{
                    latitude: locationPreview.latitude,
                    longitude: locationPreview.longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                  }}
                >
                  <Marker
                    coordinate={{
                      latitude: locationPreview.latitude,
                      longitude: locationPreview.longitude,
                    }}
                  />
                </MapView>
              ) : locationPreview ? (
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 18,
                  }}
                >
                  <Ionicons name="map-outline" size={40} color={theme.accent} />
                  <Text style={{ color: theme.text, fontWeight: '900', marginTop: 10 }}>
                    Map preview unavailable
                  </Text>
                  <Text style={{ color: theme.mutedText, fontSize: 12, textAlign: 'center', marginTop: 5 }}>
                    The location will still open in Google Maps after sending.
                  </Text>
                </View>
              ) : null}
            </View>

            {locationPreview ? (
              <View
                style={{
                  marginTop: 12,
                  backgroundColor: theme.surfaceMuted,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.border,
                  padding: 12,
                }}
              >
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '900' }} numberOfLines={1}>
                  {locationPreview.label || 'Current location'}
                </Text>
                <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 4 }}>
                  {locationPreview.latitude.toFixed(5)}, {locationPreview.longitude.toFixed(5)}
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                onPress={() => setLocationPreview(null)}
                disabled={locationPreviewLoading || sending}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.surfaceMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: locationPreviewLoading || sending ? 0.55 : 1,
                }}
              >
                <Text style={{ color: theme.text, fontWeight: '900' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={sendLocationPreview}
                disabled={!locationPreview || locationPreviewLoading || sending}
                style={{
                  flex: 1,
                  height: 48,
                  borderRadius: 16,
                  backgroundColor: activeColorPreset.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: !locationPreview || locationPreviewLoading || sending ? 0.55 : 1,
                }}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '900' }}>Send location</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <MediaViewer
        visible={mediaViewer.visible}
        media={mediaViewer.media}
        initialIndex={mediaViewer.index}
        onClose={closeMediaViewer}
      />

      <MediaComposerModal
        visible={selectedMediaAssets.length > 0}
        assets={selectedMediaAssets}
        onClose={() => setSelectedMediaAssets([])}
        onChangeAssets={setSelectedMediaAssets}
        onSend={sendSelectedMediaBatch}
        sending={uploading}
      />

      <ActionSheetModal
        visible={Boolean(messageActionTarget)}
        title="Message options"
        subtitle={messageActionTarget ? getReplySnippet(messageActionTarget) : ''}
        actions={messageActionItems}
        onClose={() => setMessageActionTarget(null)}
        closeLabel="Done"
      />

      {!embeddedTabShell ? (
        <BottomNavBar navigation={navigation} activeTab="chat" compactTop />
      ) : null}
    </SafeAreaView>
  )
}
