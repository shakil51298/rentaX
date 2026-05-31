import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Avatar from '../components/common/Avatar'
import { supabase } from '../lib/supabase'
import { useAppSettings } from '../lib/appSettings'
import { fetchConnections } from '../lib/social'
import { getProfileName } from '../lib/userDisplay'
import {
  addGroupMembers,
  createGroupConversation,
  fetchGroupMembers,
} from '../lib/chatGroups'

function normalizeProfile(profile = {}) {
  if (!profile) return null

  const id = profile.id || profile.user_id

  if (!id) return null

  return {
    id,
    user_id: id,
    email: profile.email,
    display_name: profile.display_name || profile.name || profile.email,
    avatar_url: profile.avatar_url,
    rentalx_id: profile.rentalx_id,
    is_verified: profile.is_verified,
  }
}

function getContactSearchText(profile = {}) {
  return [
    getProfileName(profile, ''),
    profile.display_name,
    profile.name,
    profile.email,
    profile.rentalx_id,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export default function CreateGroupChatScreen({ route, navigation }) {
  const participant = route?.params?.participant || null
  const conversationId = route?.params?.conversationId || null
  const isAddingToGroup = Boolean(route?.params?.isAddingToGroup)
  const { theme } = useAppSettings()
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [contacts, setContacts] = useState([])
  const [selectedIds, setSelectedIds] = useState(() => {
    if (isAddingToGroup) return new Set()

    const participantId = participant?.id || participant?.user_id
    return participantId ? new Set([participantId]) : new Set()
  })
  const [searchText, setSearchText] = useState('')

  const loadContacts = useCallback(async () => {
    setLoading(true)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user?.id) {
        setContacts([])
        return
      }

      const [followers, following] = await Promise.all([
        fetchConnections({ userId: user.id, kind: 'followers', currentUserId: user.id }),
        fetchConnections({ userId: user.id, kind: 'following', currentUserId: user.id }),
      ])
      let existingGroupMemberIds = new Set()

      if (isAddingToGroup && conversationId) {
        try {
          const members = await fetchGroupMembers(conversationId)
          existingGroupMemberIds = new Set(
            members.map((member) => member.user_id).filter(Boolean)
          )
        } catch (_error) {
          existingGroupMemberIds = new Set()
        }
      }

      const contactsById = {}

      ;[
        ...(isAddingToGroup ? [] : [participant]),
        ...followers.map((item) => item.profile),
        ...following.map((item) => item.profile),
      ]
        .map(normalizeProfile)
        .filter((profile) =>
          profile &&
          profile.id !== user.id &&
          !existingGroupMemberIds.has(profile.id)
        )
        .forEach((profile) => {
          contactsById[profile.id] = profile
        })

      setContacts(Object.values(contactsById))
    } catch (error) {
      Alert.alert('Contacts unavailable', error?.message || 'Could not load contacts.')
    } finally {
      setLoading(false)
    }
  }, [conversationId, isAddingToGroup, participant])

  useEffect(() => {
    loadContacts()
  }, [loadContacts])

  const visibleContacts = useMemo(() => {
    const query = searchText.trim().toLowerCase()

    if (!query) return contacts

    return contacts.filter((contact) => getContactSearchText(contact).includes(query))
  }, [contacts, searchText])

  function toggleContact(contactId) {
    setSelectedIds((current) => {
      const next = new Set(current)

      if (next.has(contactId)) {
        next.delete(contactId)
      } else {
        next.add(contactId)
      }

      return next
    })
  }

  async function createGroup() {
    if (creating) return

    const minimumSelection = isAddingToGroup ? 1 : 2

    if (selectedIds.size < minimumSelection) {
      Alert.alert(
        'Add one more contact',
        isAddingToGroup
          ? 'Select at least one contact to add.'
          : 'Select at least two people to make a group.'
      )
      return
    }

    try {
      setCreating(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user?.id) {
        Alert.alert('Login needed', 'Please login again first.')
        return
      }

      const selectedProfiles = contacts.filter((contact) => selectedIds.has(contact.id))

      if (isAddingToGroup && conversationId) {
        await addGroupMembers({
          conversationId,
          currentUserId: user.id,
          selectedProfiles,
        })

        Alert.alert('Members added', 'The selected contacts were added to this group.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ])
        return
      }

      const groupConversation = await createGroupConversation({
        currentUserId: user.id,
        selectedProfiles,
      })

      navigation.navigate('MainTabs', {
        screen: 'Chat',
        params: {
          conversationId: groupConversation.id,
        },
      })
    } catch (error) {
      const message =
        error?.message?.includes('chat_group_members') ||
        error?.message?.includes('conversation_type')
          ? 'Run supabase-chat-groups.sql in Supabase, then try again.'
          : error?.message || 'Could not create this group.'

      Alert.alert(isAddingToGroup ? 'Add members failed' : 'Group failed', message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['left', 'right', 'bottom']}>
      <View
        style={{
          padding: 14,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          backgroundColor: theme.surface,
        }}
      >
        <View
          style={{
            borderRadius: 14,
            backgroundColor: theme.surfaceMuted,
            borderWidth: 1,
            borderColor: theme.border,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Ionicons name="search-outline" size={18} color={theme.mutedText} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search contacts"
            placeholderTextColor={theme.mutedText}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              flex: 1,
              color: theme.text,
              paddingVertical: 11,
              paddingHorizontal: 8,
            }}
          />
          {searchText ? (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Ionicons name="close-circle" size={18} color={theme.mutedText} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={visibleContacts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 96 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={(
            <View style={{ paddingVertical: 42, alignItems: 'center' }}>
              <Ionicons name="people-outline" size={30} color={theme.mutedText} />
              <Text style={{ color: theme.mutedText, marginTop: 8, fontWeight: '800' }}>
                No contacts found
              </Text>
            </View>
          )}
          renderItem={({ item }) => {
            const selected = selectedIds.has(item.id)
            const name = getProfileName(item, 'Rental X member')

            return (
              <TouchableOpacity
                onPress={() => toggleContact(item.id)}
                activeOpacity={0.84}
                style={{
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: selected ? theme.accent : theme.border,
                  backgroundColor: selected ? theme.accentSoft : theme.surface,
                  padding: 11,
                  marginBottom: 9,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Avatar profile={item} name={name} size={42} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: theme.text, fontWeight: '900' }} numberOfLines={1}>
                      {name}
                    </Text>
                    {item.is_verified ? (
                      <Ionicons name="checkmark-circle" size={14} color={theme.accent} style={{ marginLeft: 5 }} />
                    ) : null}
                  </View>
                  <Text style={{ color: theme.mutedText, marginTop: 2, fontSize: 12 }} numberOfLines={1}>
                    {item.rentalx_id ? `@${item.rentalx_id}` : item.email || 'Rental X contact'}
                  </Text>
                </View>
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={23}
                  color={selected ? theme.accent : theme.mutedText}
                />
              </TouchableOpacity>
            )
          }}
        />
      )}

      <View
        style={{
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 14,
          borderRadius: 16,
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.border,
          padding: 10,
        }}
      >
        <TouchableOpacity
          onPress={createGroup}
          disabled={creating}
          activeOpacity={0.86}
          style={{
            height: 46,
            borderRadius: 14,
            backgroundColor: selectedIds.size >= (isAddingToGroup ? 1 : 2) ? theme.accent : theme.border,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: creating ? 0.7 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '900' }}>
            {creating
              ? isAddingToGroup ? 'Adding...' : 'Creating...'
              : isAddingToGroup
                ? `Add members (${selectedIds.size})`
                : `Create group (${selectedIds.size})`}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}
