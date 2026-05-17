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
import BottomNavBar from '../components/navigation/BottomNavBar'
import SwipeTabView from '../components/navigation/SwipeTabView'

export default function FavoriteScreen({ navigation }) {
  const [favorites, setFavorites] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFavorites()
  }, [])

  async function loadFavorites() {
    setLoading(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('property_favorites')
      .select(`
        id,
        properties (*)
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (!error) {
      setFavorites((data || []).filter((item) => !item.properties?.admin_is_banned))
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', backgroundColor: '#f0f2f5' }}>
        <ActivityIndicator />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f0f2f5' }}>
      <SwipeTabView navigation={navigation} activeTab="favorite">
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 16 }}>
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
                  backgroundColor: '#fff',
                  padding: 16,
                  borderRadius: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: '700' }}>
                  {property?.title}
                </Text>

                <Text style={{ marginTop: 6, color: '#666' }}>
                  {property?.location || 'Location not added'}
                </Text>

                <Text style={{ marginTop: 8, fontWeight: '600' }}>
                  ৳ {property?.price}
                </Text>

                <Text style={{ marginTop: 12, color: '#1877F2', fontWeight: '800' }}>
                  Open post
                </Text>
              </TouchableOpacity>
            )
          }}
        />
      </View>

      <BottomNavBar navigation={navigation} activeTab="favorite" />
      </SwipeTabView>
    </SafeAreaView>
  )
}
