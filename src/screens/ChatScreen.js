import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { VideoView, useVideoPlayer } from 'expo-video'
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
import { createNotification } from '../lib/notifications'

const CHAT_BUCKET = 'chat-media'
const EMPTY_ROUTE_PARAMS = {}

function displayNameFromEmail(email) {
  if (!email) return 'Rental X member'

  return email.split('@')[0]
}

function getProfileName(profile, fallback = 'Rental X member') {
  return (
    profile?.display_name ||
    profile?.name ||
    displayNameFromEmail(profile?.email) ||
    fallback
  )
}

function getAvatarSource(profile) {
  return profile?.avatar_url || profile?.photo_url || profile?.picture || null
}

function Avatar({ profile, name, size = 44 }) {
  const resolvedName = name || getProfileName(profile)
  const uri = getAvatarSource(profile)
  const initial = resolvedName?.trim()?.charAt(0)?.toUpperCase() || 'U'

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#e5e7eb',
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
        backgroundColor: '#dbeafe',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#1d4ed8', fontWeight: '900', fontSize: size * 0.38 }}>
        {initial}
      </Text>
    </View>
  )
}

function formatClock(date) {
  if (!date) return ''

  return new Date(date).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDayLabel(date) {
  if (!date) return ''

  const value = new Date(date)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (value.toDateString() === today.toDateString()) return 'Today'
  if (value.toDateString() === yesterday.toDateString()) return 'Yesterday'

  return value.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function isSameDay(firstDate, secondDate) {
  if (!firstDate || !secondDate) return false

  return new Date(firstDate).toDateString() === new Date(secondDate).toDateString()
}

function formatDuration(milliseconds = 0) {
  const totalSeconds = Math.max(Math.floor(milliseconds / 1000), 0)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function mediaLabel(type) {
  if (type === 'image') return 'Photo'
  if (type === 'video') return 'Video'
  if (type === 'voice') return 'Voice message'
  return 'Message'
}

function getFileExtension(uri, mimeType, type) {
  const uriExtension = uri?.split('?')?.[0]?.split('.')?.pop()?.toLowerCase()

  if (uriExtension && uriExtension.length <= 5) return uriExtension
  if (mimeType?.includes('png')) return 'png'
  if (mimeType?.includes('webp')) return 'webp'
  if (mimeType?.includes('jpeg')) return 'jpg'
  if (mimeType?.includes('jpg')) return 'jpg'
  if (mimeType?.includes('quicktime')) return 'mov'
  if (mimeType?.includes('video')) return 'mp4'
  if (mimeType?.includes('mpeg')) return 'mp3'
  if (mimeType?.includes('webm')) return 'webm'
  if (type === 'voice') return 'm4a'

  return 'jpg'
}

function fallbackMimeType(type, extension) {
  if (type === 'video') return extension === 'mov' ? 'video/quicktime' : 'video/mp4'
  if (type === 'voice') return 'audio/mp4'
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'

  return 'image/jpeg'
}

function getPropertyId(property) {
  if (!property?.id) return null

  return String(property.id)
}

function getDirectTarget(routeParams) {
  const owner = routeParams?.owner
  const profile = routeParams?.profile
  const property = routeParams?.property

  if (owner?.id) {
    return {
      id: owner.id,
      email: owner.email || profile?.email,
      display_name: profile?.display_name || owner.name,
      avatar_url: profile?.avatar_url,
      is_verified: profile?.is_verified,
    }
  }

  if (property?.owner_id) {
    const ownerProfile = property.owner_profile || {}

    return {
      id: property.owner_id,
      email: ownerProfile.email || property.owner_email,
      display_name: ownerProfile.display_name || property.owner_name,
      avatar_url: ownerProfile.avatar_url,
      is_verified: ownerProfile.is_verified,
    }
  }

  if (routeParams?.participant?.id) {
    return routeParams.participant
  }

  return null
}

async function fetchProfiles(userIds) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))]

  if (uniqueIds.length === 0) return {}

  const { data } = await supabase
    .from('user_profiles')
    .select('user_id, email, display_name, avatar_url, is_verified')
    .in('user_id', uniqueIds)

  return (data || []).reduce((profilesById, profile) => {
    profilesById[profile.user_id] = profile
    return profilesById
  }, {})
}

async function uploadChatAsset({ uri, type, mimeType, userId }) {
  const extension = getFileExtension(uri, mimeType, type)
  const contentType = mimeType || fallbackMimeType(type, extension)
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`
  const path = `${userId}/${safeName}`
  const response = await fetch(uri)
  const arrayBuffer = await response.arrayBuffer()

  const { data, error } = await supabase.storage
    .from(CHAT_BUCKET)
    .upload(path, arrayBuffer, {
      contentType,
      upsert: false,
    })

  if (error) throw error

  const { data: publicUrlData } = supabase.storage.from(CHAT_BUCKET).getPublicUrl(data.path)

  return {
    mediaUrl: publicUrlData.publicUrl,
    mediaMimeType: contentType,
  }
}

function ChatVideo({ uri }) {
  const player = useVideoPlayer(uri, (videoPlayer) => {
    videoPlayer.loop = false
  })

  return (
    <View
      style={{
        width: 232,
        height: 154,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#000',
      }}
    >
      <VideoView
        player={player}
        style={{ width: '100%', height: '100%' }}
        nativeControls
        contentFit="cover"
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
        surfaceType="textureView"
      />
    </View>
  )
}

function VoiceMessage({ message, isMine }) {
  const player = useAudioPlayer(message.media_url, { updateInterval: 500 })
  const status = useAudioPlayerStatus(player)
  const isPlaying = Boolean(status?.playing)
  const positionMillis = Math.floor((status?.currentTime || 0) * 1000)
  const durationMillis =
    message.audio_duration_ms || Math.floor((status?.duration || 0) * 1000)

  function togglePlayback() {
    try {
      if (isPlaying) {
        player.pause()
      } else {
        player.play()
      }
    } catch {
      Alert.alert('Audio unavailable', 'This voice message could not be played.')
    }
  }

  return (
    <TouchableOpacity
      onPress={togglePlayback}
      activeOpacity={0.82}
      style={{
        width: 220,
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: isMine ? 'rgba(255,255,255,0.28)' : '#dbeafe',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name={isPlaying ? 'pause' : 'play'}
          size={18}
          color={isMine ? '#fff' : '#1877F2'}
        />
      </View>

      <View style={{ flex: 1, marginLeft: 10 }}>
        <View
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: isMine ? 'rgba(255,255,255,0.28)' : '#cbd5e1',
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: durationMillis
                ? `${Math.min((positionMillis / durationMillis) * 100, 100)}%`
                : '0%',
              height: '100%',
              backgroundColor: isMine ? '#fff' : '#1877F2',
            }}
          />
        </View>

        <Text
          style={{
            color: isMine ? 'rgba(255,255,255,0.86)' : '#64748b',
            fontSize: 11,
            fontWeight: '700',
            marginTop: 5,
          }}
        >
          {formatDuration(durationMillis || positionMillis)}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

export default function ChatScreen({ route, navigation }) {
  const flatListRef = useRef(null)
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const recorderState = useAudioRecorderState(audioRecorder)
  const routeParams = route.params || EMPTY_ROUTE_PARAMS
  const directTarget = useMemo(() => getDirectTarget(routeParams), [routeParams])
  const directProperty = routeParams?.property || null

  const [currentUser, setCurrentUser] = useState(null)
  const [mode, setMode] = useState(directTarget ? 'chat' : 'list')
  const [conversation, setConversation] = useState(null)
  const [otherUser, setOtherUser] = useState(directTarget)
  const [conversationProperty, setConversationProperty] = useState(directProperty)
  const [messages, setMessages] = useState([])
  const [conversationRows, setConversationRows] = useState([])
  const [messageText, setMessageText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploading, setUpFloading] = useState(false)
  const [openedFromList, setOpenedFromList] = useState(false)
  const [otherPresence, setOtherPresence] = useState(null)
  const [isTyping, setIsTyping] = useState(false)
  const typingTimeoutRef = useRef(null)
  const [presenceByUserId, setPresenceByUserId] = useState({})

  const otherUserName = getProfileName(otherUser, 'Rental X member')
  const canSend = Boolean(currentUser?.id && otherUser?.id && conversation?.id)

  const loadMessages = useCallback(async (conversationId, currentUserId, showLoader = false) => {
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

    setMessages(data || [])

    if (currentUserId) {
      await supabase
        .from('chat_messages')
        .update({ seen_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('receiver_id', currentUserId)
        .is('seen_at', null)
    }

    if (showLoader) {
      setLoading(false)
    }
  }, [])

  const loadConversationList = useCallback(async (user) => {
    if (!user?.id) {
      setConversationRows([])
      setLoading(false)
      return
    }

    setLoading(true)

    const { data, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .or(`participant_one_id.eq.${user.id},participant_two_id.eq.${user.id}`)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (error) {
      Alert.alert('Database update needed', error.message)
      setLoading(false)
      return
    }

    const otherIds = (data || []).map((item) =>
      item.participant_one_id === user.id
        ? item.participant_two_id
        : item.participant_one_id
    )
    const profilesById = await fetchProfiles(otherIds)
    let presenceById = {}

    if (otherIds.length > 0) {
      const { data: presenceRows } = await supabase
        .from('user_presence')
        .select('user_id, is_online, last_seen_at')
        .in('user_id', otherIds)

      presenceById = (presenceRows || []).reduce((acc, row) => {
        acc[row.user_id] = row
        return acc
      }, {})

      setPresenceByUserId(presenceById)
    }
    const unreadCountsByConversation = {}

    if ((data || []).length > 0) {
      const { data: unreadMessages } = await supabase
        .from('chat_messages')
        .select('conversation_id')
        .eq('receiver_id', user.id)
        .is('seen_at', null)

        ; (unreadMessages || []).forEach((message) => {
          unreadCountsByConversation[message.conversation_id] =
            (unreadCountsByConversation[message.conversation_id] || 0) + 1
        })
    }

    setConversationRows(
      (data || []).map((item) => {
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
    )
    setLoading(false)
  }, [])

  const getOrCreateConversation = useCallback(async (user, targetUser, property) => {
    if (!user?.id || !targetUser?.id) return null

    const participantIds = [user.id, targetUser.id].sort()
    const propertyId = getPropertyId(property)
    let query = supabase
      .from('chat_conversations')
      .select('*')
      .eq('participant_one_id', participantIds[0])
      .eq('participant_two_id', participantIds[1])

    query = propertyId ? query.eq('property_id', propertyId) : query.is('property_id', null)

    const { data: existingConversation, error: lookupError } = await query.maybeSingle()

    if (lookupError) throw lookupError
    if (existingConversation) return existingConversation

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
    setOpenedFromList(fromList)
    setMode('chat')
    setConversation(item)
    setOtherUser(profile)
    setConversationProperty(null)
    await loadMessages(item.id, currentUser?.id, true)
  }, [currentUser?.id, loadMessages])

  const initializeChat = useCallback(async () => {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    setCurrentUser(user)

    if (!user) {
      setLoading(false)
      return
    }

    if (!directTarget?.id) {
      setMode('list')
      setConversation(null)
      setOtherUser(null)
      await loadConversationList(user)
      return
    }

    if (directTarget.id === user.id) {
      setMode('list')
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
      await loadMessages(nextConversation.id, user.id, true)
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
  ])

  useEffect(() => {
    initializeChat()
  }, [initializeChat])

  useEffect(() => {
    if (mode !== 'chat' || !conversation?.id || !currentUser?.id) return undefined

    const refreshMessages = () => {
      loadMessages(conversation.id, currentUser.id, false)
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
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80)
    }
  }, [messages.length, mode])

  useEffect(() => {
    if (mode !== 'list' || !currentUser?.id) return undefined

    const channel = supabase
      .channel(`message-list-presence-${currentUser.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
        },
        (payload) => {
          const row = payload.new
          if (!row?.user_id) return

          setPresenceByUserId((previous) => ({
            ...previous,
            [row.user_id]: row,
          }))

          setConversationRows((previousRows) =>
            previousRows.map((conversationItem) =>
              conversationItem.other_user_id === row.user_id
                ? { ...conversationItem, presence: row }
                : conversationItem
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUser?.id, mode])

  async function updateMyPresence({ online = true, typing = false } = {}) {
    if (!currentUser?.id) return

    await supabase.from('user_presence').upsert({
      user_id: currentUser.id,
      is_online: online,
      last_seen_at: new Date().toISOString(),
      typing_conversation_id: typing ? conversation?.id : null,
      typing_to_user_id: typing ? otherUser?.id : null,
      typing_updated_at: typing ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
  }

  function formatLastSeen(date) {
    if (!date) return 'Offline'

    const diffMs = Date.now() - new Date(date).getTime()
    const diffMinutes = Math.floor(diffMs / 60000)

    if (diffMinutes < 1) return 'Last seen just now'
    if (diffMinutes < 60) return `Last seen ${diffMinutes} min ago`

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `Last seen ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`

    return `Last seen ${new Date(date).toLocaleDateString()}`
  }

  function getChatStatusText() {
    const typingFresh =
      otherPresence?.typing_conversation_id === conversation?.id &&
      otherPresence?.typing_to_user_id === currentUser?.id &&
      otherPresence?.typing_updated_at &&
      Date.now() - new Date(otherPresence.typing_updated_at).getTime() < 5000

    if (typingFresh) return 'typing...'
    if (otherPresence?.is_online) return 'Online'

    return formatLastSeen(otherPresence?.last_seen_at)
  }

  async function sendMessage({
    body = '',
    messageType = 'text',
    mediaUrl = null,
    mediaMimeType = null,
    audioDurationMs = null,
  } = {}) {
    if (!canSend || sending) return

    const cleanBody = body.trim()

    if (!cleanBody && !mediaUrl) return

    setSending(true)

    const createdAt = new Date().toISOString()
    const lastMessage =
      messageType === 'text' ? cleanBody : mediaLabel(messageType)

    const { error } = await supabase.from('chat_messages').insert({
      conversation_id: conversation.id,
      sender_id: currentUser.id,
      receiver_id: otherUser.id,
      body: cleanBody || null,
      message_type: messageType,
      media_url: mediaUrl,
      media_mime_type: mediaMimeType,
      audio_duration_ms: audioDurationMs,
      created_at: createdAt,
    })

    if (error) {
      Alert.alert('Message failed', error.message)
      setSending(false)
      return
    }

    await supabase
      .from('chat_conversations')
      .update({
        last_message: lastMessage,
        last_message_type: messageType,
        last_message_at: createdAt,
        last_sender_id: currentUser.id,
        updated_at: createdAt,
      })
      .eq('id', conversation.id)

    await createNotification({
      recipientId: otherUser.id,
      actorId: currentUser.id,
      type: 'chat_message',
      propertyId: conversation.property_id || getPropertyId(conversationProperty),
      title: 'New message',
      body: messageType === 'text'
        ? cleanBody.slice(0, 90)
        : `sent a ${mediaLabel(messageType).toLowerCase()}`,
      eventKey: `chat_message:${conversation.id}:${createdAt}`,
    })

    await updateMyPresence({ online: true, typing: false })
    setMessageText('')
    setSending(false)
  }

  async function sendTextMessage() {
    await sendMessage({ body: messageText })
  }

  async function pickMedia() {
    if (!currentUser?.id || uploading) return

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: false,
      quality: 0.82,
    })

    if (result.canceled || !result.assets?.[0]) return

    const asset = result.assets[0]
    const messageType = asset.type === 'video' ? 'video' : 'image'

    try {
      setUploading(true)

      const uploadResult = await uploadChatAsset({
        uri: asset.uri,
        type: messageType,
        mimeType: asset.mimeType,
        userId: currentUser.id,
      })

      await sendMessage({
        messageType,
        mediaUrl: uploadResult.mediaUrl,
        mediaMimeType: uploadResult.mediaMimeType,
      })
    } catch (error) {
      Alert.alert('Media upload failed', error.message)
    } finally {
      setUploading(false)
    }
  }

  async function startRecording() {
    if (!currentUser?.id || recorderState?.isRecording) return

    const permission = await requestRecordingPermissionsAsync()

    if (!permission.granted) {
      Alert.alert('Microphone needed', 'Please allow microphone access to send voice messages.')
      return
    }

    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      })
      await audioRecorder.prepareToRecordAsync()
      audioRecorder.record()
    } catch (error) {
      Alert.alert('Recording failed', error.message)
    }
  }

  async function stopAndSendRecording() {
    if (!recorderState?.isRecording || uploading) return

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

      const uploadResult = await uploadChatAsset({
        uri,
        type: 'voice',
        mimeType: 'audio/mp4',
        userId: currentUser.id,
      })

      await sendMessage({
        messageType: 'voice',
        mediaUrl: uploadResult.mediaUrl,
        mediaMimeType: uploadResult.mediaMimeType,
        audioDurationMs: durationMillis,
      })
    } catch (error) {
      Alert.alert('Voice message failed', error.message)
    } finally {
      setUploading(false)
    }
  }

  function toggleRecording() {
    if (recorderState?.isRecording) {
      stopAndSendRecording()
    } else {
      startRecording()
    }
  }

  function showComingSoon(type) {
    Alert.alert('Coming soon', `${type} calling will be available soon.`)
  }

  const goBackFromChat = useCallback(() => {
    if (openedFromList) {
      setMode('list')
      setConversation(null)
      setMessages([])
      loadConversationList(currentUser)
      return
    }

    navigation.goBack()
  }, [currentUser, loadConversationList, navigation, openedFromList])

  useEffect(() => {
    if (mode !== 'chat') return undefined

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      goBackFromChat()
      return true
    })

    return () => {
      subscription.remove()
    }
  }, [goBackFromChat, mode])

  useEffect(() => {
    if (!currentUser?.id) return undefined

    updateMyPresence({ online: true })

    const interval = setInterval(() => {
      updateMyPresence({ online: true })
    }, 30000)

    return () => {
      clearInterval(interval)
      updateMyPresence({ online: false, typing: false })
    }
  }, [currentUser?.id])

  useEffect(() => {
    if (!otherUser?.id || mode !== 'chat') return undefined

    const loadOtherPresence = async () => {
      const { data } = await supabase
        .from('user_presence')
        .select('*')
        .eq('user_id', otherUser.id)
        .maybeSingle()

      setOtherPresence(data)
    }

    loadOtherPresence()

    const channel = supabase
      .channel(`presence-${otherUser.id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
          filter: `user_id=eq.${otherUser.id}`,
        },
        (payload) => {
          setOtherPresence(payload.new)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [otherUser?.id, mode])

  function renderConversation({ item }) {
    const profile = item.other_profile
    const name = getProfileName(profile)
    const isLastMine = item.last_sender_id === currentUser?.id

    return (
      <TouchableOpacity
        onPress={() => openConversation({ item, profile, fromList: true })}
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

          {(item.presence?.is_online || presenceByUserId[item.other_user_id]?.is_online) ? (
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

  function renderMessageContent(item, isMine) {
    if (item.message_type === 'image' && item.media_url) {
      return (
        <Image
          source={{ uri: item.media_url }}
          style={{
            width: 232,
            height: 188,
            borderRadius: 14,
            backgroundColor: isMine ? '#0f5fbf' : '#e5e7eb',
          }}
          resizeMode="cover"
        />
      )
    }

    if (item.message_type === 'video' && item.media_url) {
      return <ChatVideo uri={item.media_url} />
    }

    if (item.message_type === 'voice' && item.media_url) {
      return <VoiceMessage message={item} isMine={isMine} />
    }

    return (
      <Text
        style={{
          color: isMine ? '#fff' : '#111827',
          fontSize: 15,
          lineHeight: 21,
        }}
      >
        {item.body}
      </Text>
    )
  }

  function renderMessage({ item, index }) {
    const previousMessage = messages[index - 1]
    const shouldShowDay = !isSameDay(item.created_at, previousMessage?.created_at)
    const isMine = item.sender_id === currentUser?.id

    return (
      <>
        {shouldShowDay ? (
          <View style={{ alignItems: 'center', marginVertical: 10 }}>
            <View
              style={{
                backgroundColor: '#e2e8f0',
                borderRadius: 12,
                paddingHorizontal: 10,
                paddingVertical: 5,
              }}
            >
              <Text style={{ color: '#475569', fontSize: 12, fontWeight: '800' }}>
                {formatDayLabel(item.created_at)}
              </Text>
            </View>
          </View>
        ) : null}

        <View
          style={{
            alignItems: isMine ? 'flex-end' : 'flex-start',
            paddingHorizontal: 12,
            marginBottom: 8,
          }}
        >
          <View
            style={{
              maxWidth: '82%',
              backgroundColor: isMine ? '#1877F2' : '#fff',
              borderRadius: 18,
              borderBottomRightRadius: isMine ? 5 : 18,
              borderBottomLeftRadius: isMine ? 18 : 5,
              padding: item.message_type === 'text' ? 11 : 5,
              borderWidth: isMine ? 0 : 1,
              borderColor: '#e5e7eb',
              shadowColor: '#0f172a',
              shadowOpacity: 0.05,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
              elevation: 1,
            }}
          >
            {renderMessageContent(item, isMine)}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'flex-end',
                marginTop: item.message_type === 'text' ? 4 : 6,
                paddingHorizontal: item.message_type === 'text' ? 0 : 5,
              }}
            >
              <Text
                style={{
                  color: isMine ? 'rgba(255,255,255,0.78)' : '#64748b',
                  fontSize: 10,
                  fontWeight: '700',
                }}
              >
                {formatClock(item.created_at)}
              </Text>

              {isMine ? (
                <Text
                  style={{
                    color: item.seen_at ? '#9be7ff' : 'rgba(255,255,255,0.78)',
                    marginLeft: 4,
                    fontSize: 12,
                    fontWeight: '900',
                  }}
                >
                  {item.seen_at ? '✓✓' : '✓'}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </>
    )
  }

  if (loading && !conversation && conversationRows.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f0f2f5', justifyContent: 'center' }}>
        <ActivityIndicator />
      </SafeAreaView>
    )
  }

  if (!currentUser) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: '#f0f2f5',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Ionicons name="lock-closed-outline" size={42} color="#64748b" />
        <Text style={{ color: '#111827', fontSize: 18, fontWeight: '900', marginTop: 12 }}>
          Sign in required
        </Text>
        <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 6 }}>
          Please login again to use Rental X messaging.
        </Text>
      </SafeAreaView>
    )
  }

  if (mode === 'list') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
        <View
          style={{
            backgroundColor: '#fff',
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: '#e5e7eb',
          }}
        >
          <Text style={{ color: '#111827', fontSize: 26, fontWeight: '900' }}>
            Messages
          </Text>
          <Text style={{ color: '#64748b', marginTop: 3 }}>
            Chat with property owners and renters
          </Text>
        </View>

        <FlatList
          data={conversationRows}
          keyExtractor={(item) => item.id}
          renderItem={renderConversation}
          refreshing={loading}
          onRefresh={() => loadConversationList(currentUser)}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: 34 }}>
              <Ionicons name="chatbubbles-outline" size={48} color="#94a3b8" />
              <Text style={{ color: '#111827', fontSize: 18, fontWeight: '900', marginTop: 12 }}>
                No messages yet
              </Text>
              <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 6 }}>
                Open a property or owner profile and tap Message to start.
              </Text>
            </View>
          }
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#e9eef5' }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderBottomWidth: 1,
            borderBottomColor: '#e5e7eb',
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
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>

          <Pressable
            onPress={() =>
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
            <Avatar profile={otherUser} name={otherUserName} />

            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  style={{ color: '#111827', fontSize: 16, fontWeight: '900', flexShrink: 1 }}
                  numberOfLines={1}
                >
                  {otherUserName}
                </Text>

                {otherUser?.is_verified ? (
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
                  color: getChatStatusText() === 'Online' ? '#16a34a' : '#64748b',
                  fontSize: 12,
                  fontWeight: getChatStatusText() === 'typing...' ? '800' : '500',
                }}
              >
                {getChatStatusText()}
              </Text>
            </View>
          </Pressable>

          <TouchableOpacity
            onPress={() => showComingSoon('Voice')}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="call-outline" size={22} color="#1877F2" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => showComingSoon('Video')}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="videocam-outline" size={23} color="#1877F2" />
          </TouchableOpacity>
        </View>

        {conversationProperty?.title ? (
          <View
            style={{
              backgroundColor: '#fff',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderBottomColor: '#e5e7eb',
            }}
          >
            <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '700' }}>
              Property
            </Text>
            <Text style={{ color: '#111827', fontWeight: '900' }} numberOfLines={1}>
              {conversationProperty.title}
            </Text>
          </View>
        ) : null}

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={{ paddingTop: 10, paddingBottom: 8 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 80 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color="#94a3b8" />
              <Text style={{ color: '#111827', fontSize: 18, fontWeight: '900', marginTop: 12 }}>
                Start chatting
              </Text>
              <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 6 }}>
                Send a message, photo, video, or voice note.
              </Text>
            </View>
          }
        />

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
            <Ionicons name="radio-button-on" size={18} color="#dc2626" />
            <Text style={{ color: '#991b1b', fontWeight: '900', marginLeft: 8 }}>
              Recording {formatDuration(recorderState.durationMillis)}
            </Text>
            <Text style={{ color: '#991b1b', marginLeft: 'auto', fontWeight: '700' }}>
              Tap stop to send
            </Text>
          </View>
        ) : null}

        <View
          style={{
            backgroundColor: '#fff',
            paddingHorizontal: 10,
            paddingTop: 8,
            paddingBottom: 10,
            borderTopWidth: 1,
            borderTopColor: '#e5e7eb',
            flexDirection: 'row',
            alignItems: 'flex-end',
          }}
        >
          <TouchableOpacity
            onPress={pickMedia}
            disabled={uploading || sending}
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#eef6ff',
              marginRight: 8,
              opacity: uploading || sending ? 0.5 : 1,
            }}
          >
            <Ionicons name="attach-outline" size={24} color="#1877F2" />
          </TouchableOpacity>

          <TextInput
            value={messageText}
            onChangeText={(text) => {
              setMessageText(text)

              if (!conversation?.id || !otherUser?.id) return

              updateMyPresence({ online: true, typing: text.trim().length > 0 })

              if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current)
              }

              typingTimeoutRef.current = setTimeout(() => {
                updateMyPresence({ online: true, typing: false })
              }, 2500)
            }}
            placeholder="Message"
            placeholderTextColor="#94a3b8"
            multiline
            style={{
              flex: 1,
              minHeight: 42,
              maxHeight: 116,
              borderRadius: 21,
              backgroundColor: '#f1f5f9',
              paddingHorizontal: 15,
              paddingTop: 10,
              paddingBottom: 10,
              color: '#111827',
              fontSize: 15,
            }}
          />

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
                backgroundColor: '#1877F2',
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
          ) : (
            <TouchableOpacity
              onPress={toggleRecording}
              disabled={uploading}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: recorderState?.isRecording ? '#dc2626' : '#1877F2',
                marginLeft: 8,
                opacity: uploading ? 0.55 : 1,
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
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
