import { useCallback, useEffect, useState } from 'react'
import {
  Image,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import {
  clearRecentlyViewedProperties,
  loadRecentlyViewedProperties,
} from '../lib/propertyBrowse'
import { useAppSettings } from '../lib/appSettings'

function getCoverImage(property) {
  return property?.image_url || property?.media?.[0]?.uri || null
}

function getMetaLine(property) {
  return [
    Number(property?.beds || 0) > 0 ? `${property.beds} bed` : null,
    Number(property?.baths || 0) > 0 ? `${property.baths} bath` : null,
    Number(property?.size_sqft || 0) > 0 ? `${property.size_sqft} sq ft` : null,
  ].filter(Boolean).join(' • ')
}

export default function RecentlyViewedScreen({ navigation }) {
  const { theme } = useAppSettings()
  const [items, setItems] = useState([])
  const [refreshing, setRefreshing] = useState(false)

  const loadItems = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    setItems(await loadRecentlyViewedProperties(user?.id || user?.email || 'guest'))
  }, [])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  async function handleRefresh() {
    setRefreshing(true)
    await loadItems()
    setRefreshing(false)
  }

  async function handleClear() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    await clearRecentlyViewedProperties(user?.id || user?.email || 'guest')
    setItems([])
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 14,
            marginBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }}>
              Recently viewed
            </Text>
            <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 4, lineHeight: 16 }}>
              Pick up where you left off and compare rentals you already checked.
            </Text>
          </View>

          {items.length > 0 ? (
            <TouchableOpacity
              onPress={handleClear}
              style={{
                minHeight: 34,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: theme.surfaceMuted,
                borderWidth: 1,
                borderColor: theme.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: theme.text, fontSize: 11, fontWeight: '900' }}>Clear</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {items.length === 0 ? (
          <View
            style={{
              backgroundColor: theme.surface,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.border,
              paddingVertical: 34,
              paddingHorizontal: 20,
              alignItems: 'center',
            }}
          >
            <Ionicons name="time-outline" size={34} color={theme.mutedText} />
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '900', marginTop: 10 }}>
              Nothing viewed yet
            </Text>
            <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 5, textAlign: 'center', lineHeight: 16 }}>
              Open rental posts and they will appear here automatically.
            </Text>
          </View>
        ) : (
          items.map((item) => {
            const imageUri = getCoverImage(item)
            const metaLine = getMetaLine(item)

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => navigation.navigate('Property', { property: item })}
                activeOpacity={0.88}
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: theme.border,
                  overflow: 'hidden',
                  marginBottom: 12,
                }}
              >
                {imageUri ? (
                  <Image
                    source={{ uri: imageUri }}
                    style={{ width: '100%', height: 146, backgroundColor: theme.surfaceMuted }}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={{
                      width: '100%',
                      height: 146,
                      backgroundColor: theme.surfaceMuted,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="home-outline" size={32} color={theme.mutedText} />
                  </View>
                )}

                <View style={{ padding: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: '900', flex: 1, paddingRight: 10 }}>
                      {item.title || 'Rental post'}
                    </Text>
                    <Text style={{ color: '#ea580c', fontSize: 12, fontWeight: '900' }}>
                      {item.price ? `৳ ${item.price}` : '—'}
                    </Text>
                  </View>

                  <Text style={{ color: theme.mutedText, fontSize: 11, marginTop: 6 }}>
                    {item.location || 'Location not added'}
                  </Text>

                  {metaLine ? (
                    <Text style={{ color: theme.text, fontSize: 11, marginTop: 6 }}>
                      {metaLine}
                    </Text>
                  ) : null}

                  <View
                    style={{
                      marginTop: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text style={{ color: theme.mutedText, fontSize: 10, fontWeight: '800' }}>
                      Viewed {new Date(item.viewed_at || item.created_at || Date.now()).toLocaleDateString()}
                    </Text>

                    <Text style={{ color: theme.accent, fontSize: 11, fontWeight: '900' }}>
                      Open
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
