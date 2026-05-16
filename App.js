import React from 'react'
import AppNavigator from './src/navigation/AppNavigator'

import { useFonts } from 'expo-font'

import Ionicons from '@expo/vector-icons/Ionicons'

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  })

  if (!fontsLoaded) {
    return null
  }

  return <AppNavigator />
}