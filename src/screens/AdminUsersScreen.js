import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { supabase } from '../lib/supabase'
import { getCachedAuthUser } from '../lib/authSession'
import { isPrimaryAdmin } from '../lib/admin'
import { getOwnerVerificationStatus } from '../lib/verification'
import { useAppSettings } from '../lib/appSettings'

function UserAvatar({ item, theme }) {
  if (item.avatar_url) {
    return (
      <Image
        source={{ uri: item.avatar_url }}
        style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surfaceMuted }}
      />
    )
  }

  const initial = (item.display_name || item.email || 'U').charAt(0).toUpperCase()

  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.hero,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: theme.heroText, fontSize: 15, fontWeight: '900' }}>{initial}</Text>
    </View>
  )
}

function StatusPill({ label, tint, bg }) {
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: tint,
      }}
    >
      <Text style={{ color: tint, fontSize: 10, fontWeight: '900' }}>{label}</Text>
    </View>
  )
}

export default function AdminUsersScreen({ navigation }) {
  const { theme } = useAppSettings()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [users, setUsers] = useState([])
  const [searchQuery, setSearchQuery] = useState('')

  const loadUsers = useCallback(async () => {
    setLoading(true)

    const user = await getCachedAuthUser()

    const allowed = isPrimaryAdmin(user)
    setAuthorized(allowed)

    if (!allowed) {
      setUsers([])
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('user_profiles')
      .select('user_id, email, display_name, avatar_url, location, user_type, is_verified, owner_verification_status')
      .order('display_name', { ascending: true })

    setUsers(data || [])
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadUsers()
    }, [loadUsers])
  )

  useEffect(() => {
    if (!authorized) return undefined

    const channel = supabase
      .channel(`admin-users-${Date.now()}-${Math.random()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles' },
        () => {
          loadUsers()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [authorized, loadUsers])

  const filteredUsers = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()

    if (!normalizedQuery) return users

    return users.filter((item) => {
      const displayName = String(item.display_name || '').toLowerCase()
      const email = String(item.email || '').toLowerCase()
      const location = String(item.location || '').toLowerCase()
      const userType =
        item.user_type === 'property_owner' ? 'property owner owner landlord' : 'finding property renter tenant'

      return (
        displayName.includes(normalizedQuery)
        || email.includes(normalizedQuery)
        || location.includes(normalizedQuery)
        || userType.includes(normalizedQuery)
      )
    })
  }, [searchQuery, users])

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    )
  }

  if (!authorized) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
          <View
            style={{
              backgroundColor: theme.surface,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 16,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: '900' }}>Admin only</Text>
            <Text style={{ color: theme.mutedText, marginTop: 8, lineHeight: 20 }}>
              This user list is only available for your first-level admin account.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: theme.border,
            paddingHorizontal: 12,
            paddingVertical: 10,
            marginBottom: 14,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Ionicons name="search-outline" size={16} color={theme.mutedText} style={{ marginRight: 8 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search users, email, location"
            placeholderTextColor={theme.mutedText}
            style={{
              flex: 1,
              color: theme.text,
              fontSize: 13,
              paddingVertical: 2,
            }}
          />
          <Text style={{ color: theme.mutedText, fontSize: 11, fontWeight: '800', marginLeft: 8 }}>
            {filteredUsers.length}/{users.length}
          </Text>
        </View>

        {filteredUsers.map((item) => {
          const ownerStatus = getOwnerVerificationStatus(item)
          const userTypeLabel =
            item.user_type === 'property_owner' ? 'Property owner' : 'Finding property'

          return (
            <TouchableOpacity
              key={item.user_id}
              onPress={() =>
                navigation.navigate('AdminUserDetail', {
                  userId: item.user_id,
                  fallbackUser: item,
                })
              }
              activeOpacity={0.86}
              style={{
                backgroundColor: theme.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.border,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <UserAvatar item={item} theme={theme} />

                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: '900' }}>
                      {item.display_name || item.email || 'User'}
                    </Text>
                    {ownerStatus === 'verified' ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={14}
                        color={theme.accent}
                        style={{ marginLeft: 6 }}
                      />
                    ) : null}
                  </View>

                  <Text style={{ color: theme.mutedText, marginTop: 3, fontSize: 12 }}>
                    {item.email || 'No email'}
                  </Text>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    <StatusPill label={userTypeLabel} tint={theme.mutedText} bg={theme.surfaceMuted} />
                    {ownerStatus === 'verified' ? (
                      <StatusPill label="Verified owner" tint={theme.accent} bg={theme.accentSoft} />
                    ) : null}
                  </View>

                  {item.location ? (
                    <Text style={{ color: theme.mutedText, marginTop: 8, lineHeight: 17, fontSize: 12 }}>
                      {item.location}
                    </Text>
                  ) : null}
                </View>

                <Ionicons name="chevron-forward" size={18} color={theme.mutedText} style={{ marginLeft: 8, marginTop: 2 }} />
              </View>
            </TouchableOpacity>
          )
        })}

        {!filteredUsers.length ? (
          <View
            style={{
              backgroundColor: theme.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.border,
              padding: 16,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '900' }}>
              No users found
            </Text>
            <Text style={{ color: theme.mutedText, marginTop: 4, fontSize: 12, lineHeight: 18 }}>
              Try another name, email, or location.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  )
}
