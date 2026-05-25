import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import {
  CHAT_COLOR_PRESETS,
  CHAT_WALLPAPER_PRESETS,
  getChatAppearance,
  resolveChatColorPreset,
  resolveChatWallpaperPreset,
  saveChatAppearance,
} from '../lib/chatAppearance'
import { useAppSettings } from '../lib/appSettings'

export default function ChatAppearanceScreen({ route }) {
  const conversationId = route?.params?.conversationId
  const { theme } = useAppSettings()
  const [appearance, setAppearance] = useState(null)

  const colorPreset = resolveChatColorPreset(appearance?.colorPresetId)
  const wallpaperPreset = resolveChatWallpaperPreset(appearance?.wallpaperPresetId)

  const loadAppearance = useCallback(async () => {
    const current = await getChatAppearance(conversationId)
    setAppearance(current)
  }, [conversationId])

  useEffect(() => {
    loadAppearance()
  }, [loadAppearance])

  async function updateAppearance(nextPartial) {
    const nextAppearance = {
      ...appearance,
      ...nextPartial,
    }
    setAppearance(nextAppearance)
    await saveChatAppearance(conversationId, nextAppearance)
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28 }}>
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 14,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900', marginBottom: 12 }}>
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
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: preset.bubble,
                      borderWidth: active ? 3 : 1,
                      borderColor: active ? theme.text : theme.border,
                    }}
                  />
                  <Text style={{ marginTop: 6, fontSize: 11, color: theme.mutedText, fontWeight: '800' }}>
                    {preset.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 14,
            marginTop: 12,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '900', marginBottom: 12 }}>
            Wallpaper
          </Text>
          {CHAT_WALLPAPER_PRESETS.map((preset) => {
            const active = wallpaperPreset.id === preset.id
            return (
              <TouchableOpacity
                key={preset.id}
                onPress={() => updateAppearance({ wallpaperPresetId: preset.id })}
                activeOpacity={0.86}
                style={{
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: active ? theme.accent : theme.border,
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
                  <Text style={{ color: preset.id === 'night' ? '#fff' : '#0f172a', fontWeight: '900' }}>
                    {preset.label}
                  </Text>
                  {active ? (
                    <Ionicons name="checkmark-circle" size={22} color={theme.accent} />
                  ) : null}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
