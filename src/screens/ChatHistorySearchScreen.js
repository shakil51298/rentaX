import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAppSettings } from '../lib/appSettings'

const HISTORY_CATEGORIES = [
  { key: 'media', label: 'Image & Videos', icon: 'images-outline' },
  { key: 'files', label: 'Files', icon: 'document-text-outline' },
  { key: 'links', label: 'Links', icon: 'link-outline' },
  { key: 'audio', label: 'Music & audios', icon: 'musical-notes-outline' },
  { key: 'transactions', label: 'Transactions', icon: 'gift-outline' },
  { key: 'contacts', label: 'Contact cards', icon: 'id-card-outline' },
]

function CategoryButton({ item, onPress }) {
  const { theme } = useAppSettings()

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      style={{
        minHeight: 56,
        backgroundColor: theme.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: theme.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name={item.icon} size={18} color={theme.accent} />
      </View>
      <Text style={{ flex: 1, color: theme.text, fontSize: 15, fontWeight: '900', marginLeft: 12 }}>
        {item.label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={theme.mutedText} />
    </TouchableOpacity>
  )
}

export default function ChatHistorySearchScreen({ route, navigation }) {
  const conversationId = route?.params?.conversationId
  const { theme } = useAppSettings()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28 }}>
        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.border,
            overflow: 'hidden',
            backgroundColor: theme.surface,
          }}
        >
          {HISTORY_CATEGORIES.map((item) => (
            <CategoryButton
              key={item.key}
              item={item}
              onPress={() =>
                navigation.navigate('ChatHistoryCategory', {
                  conversationId,
                  category: item.key,
                  title: item.label,
                })
              }
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
