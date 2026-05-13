import { View, Text } from 'react-native'

export default function FavoriteScreen() {
  return (
    <View style={{ flex: 1, padding: 20, backgroundColor: '#f7f7f7' }}>
      <Text style={{ fontSize: 24, fontWeight: '700' }}>Favorites</Text>

      <Text style={{ marginTop: 10, color: '#666' }}>
        Your saved properties will appear here.
      </Text>
    </View>
  )
}