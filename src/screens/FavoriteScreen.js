import { useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { getCachedAuthUser } from '../lib/authSession'
import BottomNavBar from '../components/navigation/BottomNavBar'
import SwipeTabView from '../components/navigation/SwipeTabView'
import { fetchHiddenContentState } from '../lib/reporting'
import { useAppSettings } from '../lib/appSettings'

export default function FavoriteScreen({ navigation, embeddedTabShell = false }) {
  const { theme } = useAppSettings()
  const [favorites, setFavorites] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFavorites()
  }, [])

  async function loadFavorites() {
    setLoading(true)

    const user = await getCachedAuthUser()

    if (!user?.id) {
      setFavorites([])
      setLoading(false)
      return
    }

    const [hiddenState, favoritesResponse] = await Promise.all([
      fetchHiddenContentState(user.id),
      supabase
        .from('property_favorites')
        .select(`
          id,
          properties (*)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
    ])
    const { data, error } = favoritesResponse

    if (!error) {
      setFavorites(
        (data || []).filter((item) => {
          const property = item.properties

          if (!property || property.admin_is_banned) {
            return false
          }

          if (hiddenState.blockedUserIds.has(property.owner_id)) {
            return false
          }

          if (hiddenState.hiddenOwnerIds.has(property.owner_id)) {
            return false
          }

          if (hiddenState.hiddenPropertyIds.has(String(property.id))) {
            return false
          }

          if (hiddenState.reportedUserIds.has(property.owner_id)) {
            return false
          }

          if (hiddenState.reportedPropertyIds.has(String(property.id))) {
            return false
          }

          return true
        })
      )
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.accent} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <SwipeTabView navigation={navigation} activeTab="favorite">
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 16, color: theme.text }}>
          Favorite Posts
        </Text>

        <FlatList
          data={favorites}
          keyExtractor={(item) => item.id}
          refreshing={loading}
          onRefresh={loadFavorites}
          contentContainerStyle={{ paddingBottom: 18 }}
          ListEmptyComponent={
            <Text style={{ textAlign: 'center', marginTop: 30, color: '#666' }}>
              No favorite posts yet
            </Text>
          }
          renderItem={({ item }) => {
            const property = item.properties

            return (
              <TouchableOpacity
                onPress={() => navigation.navigate('Property', { property })}
                style={{
                  backgroundColor: theme.surface,
                  padding: 16,
                  borderRadius: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>
                  {property?.title}
                </Text>

                <Text style={{ marginTop: 6, color: theme.mutedText }}>
                  {property?.location || 'Location not added'}
                </Text>

                <Text style={{ marginTop: 8, fontWeight: '600', color: theme.text }}>
                  ৳ {property?.price}
                </Text>

                <Text style={{ marginTop: 12, color: theme.accent, fontWeight: '800' }}>
                  Open post
                </Text>
              </TouchableOpacity>
            )
          }}
        />
      </View>

      {!embeddedTabShell ? (
        <BottomNavBar navigation={navigation} activeTab="favorite" />
      ) : null}
      </SwipeTabView>
    </SafeAreaView>
  )
}
