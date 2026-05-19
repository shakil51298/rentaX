import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Avatar from '../components/common/Avatar'
import MediaViewer from '../components/common/MediaViewer'
import { supabase } from '../lib/supabase'
import {
  CHAT_COLOR_PRESETS,
  CHAT_WALLPAPER_PRESETS,
  getChatAppearance,
  resolveChatColorPreset,
  resolveChatWallpaperPreset,
  saveChatAppearance,
} from '../lib/chatAppearance'

function getDocLabel(message) {
  if (message.media_name) return message.media_name
  if (message.body) return message.body
  if (message.media_mime_type) return message.media_mime_type
  return 'Document'
}

function filterMessagesByTab(messages, tab) {
  if (tab === 'photos') {
    return messages.filter((item) => item.message_type === 'image' && item.media_url)
  }

  if (tab === 'videos') {
    return messages.filter((item) => item.message_type === 'video' && item.media_url)
  }

  return messages.filter((item) =>
    item.media_url
    && !['image', 'video', 'voice', 'call'].includes(item.message_type)
  )
}

function SearchToggle({ visible, onToggle, value, onChangeText }) {
  return (
    <View style={{ marginTop: 10 }}>
      <TouchableOpacity
        onPress={onToggle}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          backgroundColor: '#eef2ff',
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Ionicons name="search-outline" size={16} color="#4f46e5" />
        <Text style={{ color: '#3730a3', fontWeight: '800', marginLeft: 6 }}>
          {visible ? 'Hide search' : 'Search'}
        </Text>
      </TouchableOpacity>

      {visible ? (
        <View
          style={{
            marginTop: 10,
            borderRadius: 14,
            backgroundColor: '#f8fafc',
            borderWidth: 1,
            borderColor: '#dbe3ef',
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Ionicons name="search-outline" size={18} color="#64748b" />
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder="Search media or file text"
            placeholderTextColor="#94a3b8"
            style={{
              flex: 1,
              color: '#0f172a',
              paddingVertical: 10,
              paddingHorizontal: 8,
            }}
          />
        </View>
      ) : null}
    </View>
  )
}

export default function ChatSettingsScreen({ route }) {
  const conversationId = route?.params?.conversationId
  const participant = route?.params?.participant || null
  const property = route?.params?.property || null

  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState([])
  const [activeTab, setActiveTab] = useState('photos')
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [appearance, setAppearance] = useState(null)
  const [mediaViewer, setMediaViewer] = useState({ visible: false, media: [], index: 0 })

  const colorPreset = resolveChatColorPreset(appearance?.colorPresetId)
  const wallpaperPreset = resolveChatWallpaperPreset(appearance?.wallpaperPresetId)

  const loadMessages = useCallback(async () => {
    if (!conversationId) return

    setLoading(true)
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(250)

    setMessages(data || [])
    setLoading(false)
  }, [conversationId])

  const loadAppearance = useCallback(async () => {
    if (!conversationId) return
    const current = await getChatAppearance(conversationId)
    setAppearance(current)
  }, [conversationId])

  useEffect(() => {
    loadMessages()
    loadAppearance()
  }, [loadAppearance, loadMessages])

  const filteredItems = useMemo(() => {
    const baseItems = filterMessagesByTab(messages, activeTab)
    const query = searchText.trim().toLowerCase()

    if (!query) return baseItems

    return baseItems.filter((item) =>
      String(item.body || '').toLowerCase().includes(query)
      || String(item.media_mime_type || '').toLowerCase().includes(query)
    )
  }, [activeTab, messages, searchText])

  async function updateAppearance(nextPartial) {
    const nextAppearance = {
      ...appearance,
      ...nextPartial,
    }
    setAppearance(nextAppearance)
    await saveChatAppearance(conversationId, nextAppearance)
  }

  function openMedia(items, index) {
    setMediaViewer({
      visible: true,
      media: items.map((item) => ({ uri: item.media_url, type: item.message_type })),
      index,
    })
  }

  async function openDocument(item) {
    if (!item?.media_url) return

    try {
      await Linking.openURL(item.media_url)
    } catch {
      // keep this gentle inside settings
    }
  }

  const counts = useMemo(
    () => ({
      photos: filterMessagesByTab(messages, 'photos').length,
      videos: filterMessagesByTab(messages, 'videos').length,
      docs: filterMessagesByTab(messages, 'docs').length,
    }),
    [messages]
  )

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f4f7fb' }}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            padding: 14,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Avatar profile={participant} name={participant?.name} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '900' }}>
                {participant?.name || 'Chat settings'}
              </Text>
              <Text style={{ color: '#64748b', marginTop: 2 }}>
                {property?.title || participant?.email || 'Conversation details'}
              </Text>
            </View>
          </View>
        </View>

        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            padding: 14,
            marginTop: 12,
          }}
        >
          <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '900' }}>
            Shared media
          </Text>
          <Text style={{ color: '#64748b', marginTop: 2 }}>
            Photos, videos, files, and quick search
          </Text>

          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            {[
              { key: 'photos', label: 'Photos', count: counts.photos },
              { key: 'videos', label: 'Videos', count: counts.videos },
              { key: 'docs', label: 'Docs', count: counts.docs },
            ].map((item) => {
              const active = activeTab === item.key
              return (
                <TouchableOpacity
                  key={item.key}
                  onPress={() => setActiveTab(item.key)}
                  style={{
                    flex: 1,
                    marginRight: item.key === 'docs' ? 0 : 8,
                    borderRadius: 14,
                    backgroundColor: active ? '#dbeafe' : '#f8fafc',
                    borderWidth: 1,
                    borderColor: active ? '#93c5fd' : '#e2e8f0',
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: active ? '#1d4ed8' : '#334155', fontWeight: '800' }}>
                    {item.label}
                  </Text>
                  <Text style={{ color: active ? '#1d4ed8' : '#94a3b8', fontSize: 12, marginTop: 2 }}>
                    {item.count}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <SearchToggle
            visible={searchVisible}
            onToggle={() => setSearchVisible((current) => !current)}
            value={searchText}
            onChangeText={setSearchText}
          />

          {loading ? (
            <View style={{ paddingVertical: 28, alignItems: 'center' }}>
              <ActivityIndicator color="#1877F2" />
            </View>
          ) : activeTab === 'docs' ? (
            filteredItems.length ? (
              filteredItems.map((item) => (
                <Pressable
                  onPress={() => openDocument(item)}
                  key={item.id}
                  style={{
                    marginTop: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    backgroundColor: '#f8fafc',
                    padding: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      backgroundColor: '#e0e7ff',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 10,
                    }}
                  >
                    <Ionicons name="document-text-outline" size={18} color="#4f46e5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#0f172a', fontWeight: '800' }} numberOfLines={1}>
                      {getDocLabel(item)}
                    </Text>
                    <Text style={{ color: '#64748b', marginTop: 2 }} numberOfLines={1}>
                      {item.media_mime_type || 'Shared file'}
                    </Text>
                  </View>
                </Pressable>
              ))
            ) : (
              <View style={{ marginTop: 14, paddingVertical: 18, alignItems: 'center' }}>
                <Ionicons name="document-outline" size={28} color="#94a3b8" />
                <Text style={{ color: '#64748b', marginTop: 8 }}>No documents shared yet</Text>
              </View>
            )
          ) : filteredItems.length ? (
            <FlatList
              data={filteredItems}
              numColumns={3}
              scrollEnabled={false}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ marginTop: 12 }}
              columnWrapperStyle={{ gap: 8, marginBottom: 8 }}
              renderItem={({ item, index }) => (
                <Pressable
                  onPress={() => openMedia(filteredItems, index)}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    borderRadius: 14,
                    overflow: 'hidden',
                    backgroundColor: '#e2e8f0',
                  }}
                >
                  <Image
                    source={{ uri: item.media_url }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                  {item.message_type === 'video' ? (
                    <View
                      style={{
                        position: 'absolute',
                        right: 8,
                        bottom: 8,
                        width: 26,
                        height: 26,
                        borderRadius: 13,
                        backgroundColor: 'rgba(15,23,42,0.65)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="play" size={14} color="#fff" />
                    </View>
                  ) : null}
                </Pressable>
              )}
            />
          ) : (
            <View style={{ marginTop: 14, paddingVertical: 18, alignItems: 'center' }}>
              <Ionicons name="images-outline" size={28} color="#94a3b8" />
              <Text style={{ color: '#64748b', marginTop: 8 }}>No items match this section</Text>
            </View>
          )}
        </View>

        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            padding: 14,
            marginTop: 12,
          }}
        >
          <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '900' }}>
            Chat appearance
          </Text>
          <Text style={{ color: '#64748b', marginTop: 2 }}>
            Change bubble color and wallpaper style
          </Text>

          <Text style={{ color: '#334155', fontWeight: '800', marginTop: 14, marginBottom: 10 }}>
            Chat UI color
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            {CHAT_COLOR_PRESETS.map((preset) => {
              const active = colorPreset.id === preset.id
              return (
                <Pressable
                  key={preset.id}
                  onPress={() => updateAppearance({ colorPresetId: preset.id })}
                  style={{
                    width: '20%',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: preset.bubble,
                      borderWidth: active ? 3 : 1,
                      borderColor: active ? '#0f172a' : '#dbe3ef',
                    }}
                  />
                  <Text style={{ marginTop: 6, fontSize: 11, color: '#475569', fontWeight: '700' }}>
                    {preset.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <Text style={{ color: '#334155', fontWeight: '800', marginTop: 8, marginBottom: 10 }}>
            Wallpaper
          </Text>
          {CHAT_WALLPAPER_PRESETS.map((preset) => {
            const active = wallpaperPreset.id === preset.id
            return (
              <TouchableOpacity
                key={preset.id}
                onPress={() => updateAppearance({ wallpaperPresetId: preset.id })}
                style={{
                  borderRadius: 16,
                  borderWidth: 1.5,
                  borderColor: active ? '#60a5fa' : '#e2e8f0',
                  backgroundColor: preset.backgroundColor,
                  padding: 12,
                  marginBottom: 10,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    position: 'absolute',
                    top: -18,
                    right: -10,
                    width: 86,
                    height: 86,
                    borderRadius: 43,
                    backgroundColor: preset.overlay,
                    opacity: preset.id === 'night' ? 0.22 : 0.48,
                  }}
                />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: '#0f172a', fontWeight: '900' }}>{preset.label}</Text>
                    <Text style={{ color: '#64748b', marginTop: 3 }}>Preview this wallpaper in chat</Text>
                  </View>
                  {active ? (
                    <Ionicons name="checkmark-circle" size={22} color="#2563eb" />
                  ) : null}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>

      <MediaViewer
        visible={mediaViewer.visible}
        media={mediaViewer.media}
        initialIndex={mediaViewer.index}
        onClose={() => setMediaViewer((current) => ({ ...current, visible: false }))}
      />
    </SafeAreaView>
  )
}
