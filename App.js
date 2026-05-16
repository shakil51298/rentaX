import React from 'react'
import AppNavigator from './src/navigation/AppNavigator'

import { useFonts } from 'expo-font'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, View } from 'react-native'

import Ionicons from '@expo/vector-icons/Ionicons'
import { hasSupabaseConfig, supabaseConfigError } from './src/lib/supabase'

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  })

  if (!fontsLoaded) {
    return null
  }

  if (!hasSupabaseConfig) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
          }}
        >
          <Text style={{ fontSize: 24, fontWeight: '900', color: '#111827', textAlign: 'center' }}>
            Rental X configuration missing
          </Text>
          <Text
            style={{
              marginTop: 12,
              color: '#475569',
              textAlign: 'center',
              lineHeight: 22,
            }}
          >
            {supabaseConfigError}
          </Text>
          <Text
            style={{
              marginTop: 12,
              color: '#64748b',
              textAlign: 'center',
              lineHeight: 22,
            }}
          >
            Add your EXPO_PUBLIC Supabase values to the EAS build profile, then rebuild the APK.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return <AppNavigator />
}
