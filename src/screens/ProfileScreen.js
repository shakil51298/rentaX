import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { supabase } from '../lib/supabase'

export default function ProfileScreen({ navigation }) {
  const [user, setUser] = useState(null)

  useEffect(() => {
    loadUser()
  }, [])

  async function loadUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    setUser(user)
  }

  async function logout() {
    await supabase.auth.signOut()
    navigation.replace('Login')
  }

  function MenuItem({ title, subtitle, onPress }) {
    return (
      <TouchableOpacity
        onPress={onPress}
        style={{
          backgroundColor: '#fff',
          paddingVertical: 16,
          paddingHorizontal: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#eee',
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '500' }}>{title}</Text>

        {subtitle ? (
          <Text style={{ marginTop: 4, color: '#666', fontSize: 13 }}>
            {subtitle}
          </Text>
        ) : null}
      </TouchableOpacity>
    )
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f7f7f7' }}>
      <View
        style={{
          backgroundColor: '#fff',
          padding: 20,
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: '#ddd',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 26, fontWeight: '700' }}>
            {user?.email ? user.email.charAt(0).toUpperCase() : 'U'}
          </Text>
        </View>

        <Text style={{ marginTop: 12, fontSize: 20, fontWeight: '700' }}>
          {user?.user_metadata?.name || 'User'}
        </Text>

        <Text style={{ marginTop: 4, color: '#666' }}>
          {user?.email || ''}
        </Text>
      </View>

      <View style={{ backgroundColor: '#fff', marginBottom: 14 }}>
        <MenuItem
          title="My Posts"
          subtitle="Manage your rental listings"
          onPress={() => navigation.navigate('Home')}
        />

        <MenuItem
          title="Create Post"
          subtitle="Add a new property"
          onPress={() => navigation.navigate('CreatePost')}
        />

        <MenuItem
          title="Messages"
          subtitle="Open conversations"
          onPress={() => navigation.navigate('Chat')}
        />
      </View>

      <View style={{ backgroundColor: '#fff', marginBottom: 14 }}>
        <MenuItem
          title="Chat Privacy"
          subtitle="Control who can contact you"
        />

        <MenuItem
          title="App Notifications"
          subtitle="Message and activity alerts"
        />

        <MenuItem
          title="Saved Properties"
          subtitle="Your bookmarked rentals"
        />
      </View>

      <View style={{ backgroundColor: '#fff', marginBottom: 14 }}>
        <MenuItem
          title="Help & Support"
          subtitle="Get assistance"
        />

        <MenuItem
          title="About"
          subtitle="App version and information"
        />
      </View>

      <TouchableOpacity
        onPress={logout}
        style={{
          marginHorizontal: 16,
          marginBottom: 30,
          backgroundColor: '#111',
          paddingVertical: 15,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}