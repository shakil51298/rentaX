import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import MediaViewer from '../components/common/MediaViewer'
import { supabase } from '../lib/supabase'
import { useAppSettings } from '../lib/appSettings'
import {
  formatDayLabel,
  isContactCardMessage,
  isLocationMessage,
  isRedPacketMessage,
  parseContactCardPayload,
} from '../lib/chatUtils'

function isLinkMessage(message) {
  return /https?:\/\/\S+/i.test(String(message.body || ''))
}

function getFirstLink(message) {
  const match = String(message.body || '').match(/https?:\/\/\S+/i)
  return match?.[0] || null
}

function getDocLabel(message) {
  if (message.media_name) return message.media_name
  if (message.body) return message.body
  if (message.media_mime_type) return message.media_mime_type
  return 'File'
}

function getRowTitle(message) {
  if (isContactCardMessage(message)) {
    const contact = parseContactCardPayload(message)
    return contact.displayName ? `Contact: ${contact.displayName}` : 'Contact card'
  }

  if (isRedPacketMessage(message)) return 'Red packet'
  if (isLocationMessage(message)) return message.media_name || 'Location'
  if (message.message_type === 'voice') return message.media_name || 'Audio'
  if (message.message_type === 'video') return 'Video'
  if (message.message_type === 'image') return 'Photo'
  return getDocLabel(message)
}

function getRowSubtitle(message) {
  if (isContactCardMessage(message)) {
    const contact = parseContactCardPayload(message)
    return contact.rentalXId ? `Rental X ID: ${contact.rentalXId}` : 'Contact card'
  }

  if (isRedPacketMessage(message)) return message.body || 'Transaction'
  if (isLinkMessage(message)) return message.body || message.media_url || 'Link'
  return message.media_mime_type || message.body || formatDayLabel(message.created_at)
}

function getRowIcon(message, category) {
  if (category === 'links') return 'link-outline'
  if (category === 'transactions') return 'gift-outline'
  if (category === 'contacts') return 'id-card-outline'
  if (category === 'audio') return 'musical-notes-outline'
  return 'document-text-outline'
}

function filterByCategory(message, category) {
  if (message.deleted_for_everyone_at) return false

  if (category === 'media') {
    return ['image', 'video'].includes(message.message_type) && Boolean(message.media_url)
  }

  if (category === 'files') {
    return Boolean(message.media_url)
      && !['image', 'video', 'voice', 'call'].includes(message.message_type)
      && !String(message.media_mime_type || '').startsWith('audio/')
      && !isLocationMessage(message)
      && !isRedPacketMessage(message)
      && !isContactCardMessage(message)
  }

  if (category === 'links') return isLinkMessage(message)
  if (category === 'audio') {
    return message.message_type === 'voice'
      || String(message.media_mime_type || '').startsWith('audio/')
  }
  if (category === 'transactions') return isRedPacketMessage(message)
  if (category === 'contacts') return isContactCardMessage(message)

  return false
}

export default function ChatHistoryCategoryScreen({ route }) {
  const conversationId = route?.params?.conversationId
  const category = route?.params?.category || 'media'
  const { theme } = useAppSettings()
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState([])
  const [searchText, setSearchText] = useState('')
  const [mediaViewer, setMediaViewer] = useState({ visible: false, media: [], index: 0 })

  const loadMessages = useCallback(async () => {
    if (!conversationId) {
      setLoading(false)
      return
    }

    setLoading(true)
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(500)

    setMessages(data || [])
    setLoading(false)
  }, [conversationId])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  const results = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    const categoryItems = messages.filter((message) => filterByCategory(message, category))

    if (!query) return categoryItems

    return categoryItems.filter((message) =>
      [
        message.body,
        message.media_name,
        message.media_mime_type,
        getRowTitle(message),
        getRowSubtitle(message),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    )
  }, [category, messages, searchText])

  function openMedia(item) {
    const mediaItems = results
      .filter((message) => ['image', 'video'].includes(message.message_type) && message.media_url)
      .map((message) => ({ uri: message.media_url, type: message.message_type }))
    const index = Math.max(
      mediaItems.findIndex((message) => message.uri === item.media_url),
      0
    )

    setMediaViewer({ visible: true, media: mediaItems, index })
  }

  async function openItem(item) {
    if (category === 'media') {
      openMedia(item)
      return
    }

    const targetUrl = category === 'links' ? getFirstLink(item) : item.media_url

    if (!targetUrl) return

    try {
      await Linking.openURL(targetUrl)
    } catch {
      // The item can still be reviewed in the list.
    }
  }

  const isMediaCategory = category === 'media'

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['left', 'right', 'bottom']}>
      <View
        style={{
          padding: 14,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          backgroundColor: theme.surface,
        }}
      >
        <View
          style={{
            borderRadius: 14,
            backgroundColor: theme.surfaceMuted,
            borderWidth: 1,
            borderColor: theme.border,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Ionicons name="search-outline" size={18} color={theme.mutedText} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search"
            placeholderTextColor={theme.mutedText}
            style={{
              flex: 1,
              color: theme.text,
              paddingVertical: 11,
              paddingHorizontal: 8,
            }}
          />
          {searchText ? (
            <Pressable onPress={() => setSearchText('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={theme.mutedText} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : isMediaCategory ? (
        <FlatList
          data={results}
          numColumns={3}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 8, paddingBottom: 28 }}
          ListEmptyComponent={(
            <View style={{ paddingVertical: 42, alignItems: 'center' }}>
              <Ionicons name="images-outline" size={30} color={theme.mutedText} />
              <Text style={{ color: theme.mutedText, marginTop: 8, fontWeight: '800' }}>
                No items
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openItem(item)}
              style={{
                flex: 1,
                aspectRatio: 1,
                margin: 4,
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: theme.surfaceMuted,
              }}
            >
              <Image source={{ uri: item.media_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              {item.message_type === 'video' ? (
                <View
                  style={{
                    position: 'absolute',
                    right: 7,
                    bottom: 7,
                    width: 25,
                    height: 25,
                    borderRadius: 13,
                    backgroundColor: 'rgba(15,23,42,0.68)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="play" size={13} color="#fff" />
                </View>
              ) : null}
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={(
            <View style={{ paddingVertical: 42, alignItems: 'center' }}>
              <Ionicons name="folder-open-outline" size={30} color={theme.mutedText} />
              <Text style={{ color: theme.mutedText, marginTop: 8, fontWeight: '800' }}>
                No items
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openItem(item)}
              style={{
                marginBottom: 9,
                borderRadius: 14,
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
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
                  backgroundColor: theme.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}
              >
                <Ionicons name={getRowIcon(item, category)} size={18} color={theme.accent} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: theme.text, fontWeight: '900' }} numberOfLines={1}>
                  {getRowTitle(item)}
                </Text>
                <Text style={{ color: theme.mutedText, marginTop: 2 }} numberOfLines={1}>
                  {getRowSubtitle(item)}
                </Text>
              </View>
              <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '800', marginLeft: 8 }}>
                {formatDayLabel(item.created_at)}
              </Text>
            </Pressable>
          )}
        />
      )}

      <MediaViewer
        visible={mediaViewer.visible}
        media={mediaViewer.media}
        initialIndex={mediaViewer.index}
        onClose={() => setMediaViewer((current) => ({ ...current, visible: false }))}
      />
    </SafeAreaView>
  )
}
