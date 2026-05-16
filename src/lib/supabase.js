import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''
export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey)
export const supabaseConfigError = hasSupabaseConfig
  ? null
  : 'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY in the app build.'

export const supabase = hasSupabaseConfig
  ? createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    },
  )
  : null
