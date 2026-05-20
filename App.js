import React from 'react'
import AppNavigator from './src/navigation/AppNavigator'

import { useFonts } from 'expo-font'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, View } from 'react-native'

import Ionicons from '@expo/vector-icons/Ionicons'
import { hasSupabaseConfig, supabaseConfigError } from './src/lib/supabase'
import { AppSettingsProvider, useAppSettings } from './src/lib/appSettings'

function AppContent() {
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
  })
  const { theme, t } = useAppSettings()

  if (!fontsLoaded && !fontError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
          }}
        >
          <Text style={{ fontSize: 24, fontWeight: '900', color: theme.text, textAlign: 'center' }}>
            {t('appStarting', 'Rental X is starting')}
          </Text>
          <Text
            style={{
              marginTop: 12,
              color: theme.mutedText,
              textAlign: 'center',
              lineHeight: 22,
            }}
          >
            {t('appLoadingResources', 'Loading app resources...')}
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  if (fontError) {
    console.warn('Icon font failed to load:', fontError)
  }

  if (!hasSupabaseConfig) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
          }}
        >
          <Text style={{ fontSize: 24, fontWeight: '900', color: theme.text, textAlign: 'center' }}>
            {t('appConfigMissing', 'Rental X configuration missing')}
          </Text>
          <Text
            style={{
              marginTop: 12,
              color: theme.mutedText,
              textAlign: 'center',
              lineHeight: 22,
            }}
          >
            {supabaseConfigError}
          </Text>
          <Text
            style={{
              marginTop: 12,
              color: theme.mutedText,
              textAlign: 'center',
              lineHeight: 22,
            }}
          >
            {t(
              'appConfigHelp',
              'Add your EXPO_PUBLIC Supabase values to the EAS build profile, then rebuild the APK.'
            )}
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return <AppNavigator />
}

export default function App() {
  return (
    <AppSettingsProvider>
      <AppContent />
    </AppSettingsProvider>
  )
}
