import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
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
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio'
import { supabase } from '../lib/supabase'
import { createNotification } from '../lib/notifications'
import Avatar from '../components/common/Avatar'
import MediaViewer from '../components/common/MediaViewer'
import ConversationRow from '../components/chat/ConversationRow'
import MessageBubble from '../components/chat/MessageBubble'
import useChatPresence from '../hooks/useChatPresence'
import { CHAT_MEDIA_BUCKET, uploadMediaAsset } from '../lib/media'
import {
  formatDuration,
  getDirectTarget,
  getPropertyId,
  mediaLabel,
} from '../lib/chatUtils'
import { displayNameFromEmail, getProfileName } from '../lib/userDisplay'

const EMPTY_ROUTE_PARAMS = {}

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
  const field = getConversationDeletionField(conversation, userId)
  return field ? conversation?.[field] || null : null
}

function isConversationVisibleForUser(conversation, userId) {
  const deletedAt = getConversationDeletedAt(conversation, userId)

  if (!deletedAt) return true

  const lastActivityAt =
    conversation.last_message_at ||
    conversation.updated_at ||
    conversation.created_at

  if (!lastActivityAt) return false

  return new Date(lastActivityAt).getTime() > new Date(deletedAt).getTime()
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
  const [uploading, setUploading] = useState(false)
  const [openedFromList, setOpenedFromList] = useState(false)
  const [selectedConversationIds, setSelectedConversationIds] = useState([])
  const [mediaViewer, setMediaViewer] = useState({
    visible: false,
    media: [],
    index: 0,
  })
  const typingTimeoutRef = useRef(null)

  const otherUserName = getProfileName(otherUser, 'Rental X member')
  const canSend = Boolean(currentUser?.id && otherUser?.id && conversation?.id)
  const {
    presenceByUserId,
    setPresenceByUserId,
    updateMyPresence,
    getChatStatusText,
  } = useChatPresence({
    currentUserId: currentUser?.id,
    mode,
    conversationId: conversation?.id,
    otherUserId: otherUser?.id,
  })

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
    const visibleMessages = deletedAt
      ? (data || []).filter(
        (item) => new Date(item.created_at).getTime() > new Date(deletedAt).getTime()
      )
      : (data || [])

    setMessages(visibleMessages)

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
      const { data: presenceRows, error: presenceError } = await supabase
        .from('user_presence')
        .select('user_id, is_online, last_seen_at')
        .in('user_id', otherIds)

      if (!presenceError) {
        presenceById = (presenceRows || []).reduce((acc, row) => {
          acc[row.user_id] = row
          return acc
        }, {})

        setPresenceByUserId(presenceById)
      }
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

    const visibleRows = (data || []).filter((item) => isConversationVisibleForUser(item, user.id))

    setConversationRows(
      visibleRows.map((item) => {
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
    setSelectedConversationIds((current) =>
      current.filter((id) => visibleRows.some((item) => item.id === id))
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
    setSelectedConversationIds([])
    setOpenedFromList(fromList)
    setMode('chat')
    setConversation(item)
    setOtherUser(profile)
    setConversationProperty(null)
    await loadMessages(item.id, currentUser?.id, true, item)
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
  ])

  useEffect(() => {
    initializeChat()
  }, [initializeChat])

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

      const uploadResult = await uploadMediaAsset({
        uri: asset.uri,
        type: messageType,
        mimeType: asset.mimeType,
        userId: currentUser.id,
        bucket: CHAT_MEDIA_BUCKET,
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
            const groups = targetRows.reduce((acc, item) => {
              const field = getConversationDeletionField(item, currentUser.id)

              if (!field) return acc

              if (!acc[field]) {
                acc[field] = []
              }

              acc[field].push(item.id)
              return acc
            }, {})

            const groupEntries = Object.entries(groups)

            if (groupEntries.length === 0) {
              Alert.alert('Delete unavailable', 'Unable to identify your chat records right now.')
              return
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
            await loadConversationList(currentUser)
          },
        },
      ]
    )
  }, [
    clearConversationSelection,
    conversationRows,
    currentUser,
    loadConversationList,
    selectedConversationIds,
  ])

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
    if (mode !== 'list' || !selectionMode) return undefined

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      clearConversationSelection()
      return true
    })

    return () => {
      subscription.remove()
    }
  }, [clearConversationSelection, mode, selectionMode])

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

  const chatStatusText = getChatStatusText()

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
                <Ionicons name="close" size={24} color="#111827" />
              </TouchableOpacity>

              <View style={{ flex: 1 }}>
                <Text style={{ color: '#111827', fontSize: 24, fontWeight: '900' }}>
                  {selectedConversationIds.length} selected
                </Text>
                <Text style={{ color: '#64748b', marginTop: 3 }}>
                  Choose chats to remove from your list
                </Text>
              </View>

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
              <Text style={{ color: '#111827', fontSize: 26, fontWeight: '900' }}>
                Messages
              </Text>
              <Text style={{ color: '#64748b', marginTop: 3 }}>
                Chat with property owners and renters
              </Text>
            </>
          )}
        </View>

        <FlatList
          data={conversationRows}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationRow
              item={item}
              currentUserId={currentUser?.id}
              presenceByUserId={presenceByUserId}
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
                  color: chatStatusText === 'Online' ? '#16a34a' : '#64748b',
                  fontSize: 12,
                  fontWeight: chatStatusText === 'typing...' ? '800' : '500',
                }}
              >
                {chatStatusText}
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
          renderItem={({ item, index }) => (
            <MessageBubble
              item={item}
              previousMessage={messages[index - 1]}
              currentUserId={currentUser?.id}
              onOpenMedia={openMediaViewer}
            />
          )}
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

      <MediaViewer
        visible={mediaViewer.visible}
        media={mediaViewer.media}
        initialIndex={mediaViewer.index}
        onClose={closeMediaViewer}
      />
    </SafeAreaView>
  )
}
