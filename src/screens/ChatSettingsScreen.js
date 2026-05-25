import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Avatar from '../components/common/Avatar'
import { supabase } from '../lib/supabase'
import { useAppSettings } from '../lib/appSettings'
import {
  isConversationMuted,
  isConversationPinned,
  setConversationMuted,
  setConversationPinned,
} from '../lib/chatPreferences'
import { getProfileName } from '../lib/userDisplay'

function getConversationDeletionField(conversation, userId) {
  if (!conversation || !userId) return null
  if (conversation.participant_one_id === userId) return 'participant_one_deleted_at'
  if (conversation.participant_two_id === userId) return 'participant_two_deleted_at'
  return null
}

function SettingsRow({
  icon,
  label,
  danger = false,
  onPress,
  right,
}) {
  const { theme } = useAppSettings()
  const content = (
    <>
      <Ionicons
        name={icon}
        size={20}
        color={danger ? '#dc2626' : theme.accent}
        style={{ width: 26 }}
      />
      <Text
        style={{
          flex: 1,
          color: danger ? '#dc2626' : theme.text,
          fontSize: 15,
          fontWeight: '800',
          marginLeft: 8,
        }}
      >
        {label}
      </Text>
      {right || <Ionicons name="chevron-forward" size={18} color={theme.mutedText} />}
    </>
  )

  const rowStyle = {
    minHeight: 52,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  }

  if (!onPress) {
    return <View style={rowStyle}>{content}</View>
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      style={rowStyle}
    >
      {content}
    </TouchableOpacity>
  )
}

function SettingsGroup({ children }) {
  const { theme } = useAppSettings()

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.border,
        overflow: 'hidden',
        backgroundColor: theme.surface,
      }}
    >
      {children}
    </View>
  )
}

function getFirstName(profile) {
  const name = getProfileName(profile, 'User')
  return String(name).trim().split(/\s+/)[0] || 'User'
}

function MemberTile({ profile }) {
  const { theme } = useAppSettings()

  return (
    <View
      style={{
        width: 58,
        height: 70,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.surface,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 5,
      }}
    >
      <Avatar profile={profile} name={getProfileName(profile, 'User')} size={36} />
      <Text
        numberOfLines={1}
        style={{
          color: theme.text,
          fontSize: 10,
          fontWeight: '800',
          marginTop: 5,
          maxWidth: 48,
        }}
      >
        {getFirstName(profile)}
      </Text>
    </View>
  )
}

function AddGroupTile({ onPress }) {
  const { theme } = useAppSettings()

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.84}
      style={{
        width: 58,
        height: 70,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.surface,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: theme.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="add" size={23} color={theme.accent} />
      </View>
    </TouchableOpacity>
  )
}

export default function ChatSettingsScreen({ route, navigation }) {
  const conversationId = route?.params?.conversationId
  const participant = route?.params?.participant || null
  const property = route?.params?.property || null
  const { theme } = useAppSettings()
  const [muted, setMuted] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [savingMute, setSavingMute] = useState(false)
  const [savingPinned, setSavingPinned] = useState(false)
  const [clearing, setClearing] = useState(false)

  const loadPreferences = useCallback(async () => {
    if (!conversationId) return

    const [nextMuted, nextPinned] = await Promise.all([
      isConversationMuted(conversationId),
      isConversationPinned(conversationId),
    ])

    setMuted(nextMuted)
    setPinned(nextPinned)
  }, [conversationId])

  useEffect(() => {
    loadPreferences()
  }, [loadPreferences])

  async function toggleMute(nextValue) {
    if (!conversationId || savingMute) return

    setMuted(nextValue)
    setSavingMute(true)

    try {
      await setConversationMuted(conversationId, nextValue)
    } catch (error) {
      setMuted(!nextValue)
      Alert.alert('Mute failed', error?.message || 'Could not update this chat.')
    } finally {
      setSavingMute(false)
    }
  }

  async function togglePinned(nextValue) {
    if (!conversationId || savingPinned) return

    setPinned(nextValue)
    setSavingPinned(true)

    try {
      await setConversationPinned(conversationId, nextValue)
    } catch (error) {
      setPinned(!nextValue)
      Alert.alert('Sticky failed', error?.message || 'Could not update this chat.')
    } finally {
      setSavingPinned(false)
    }
  }

  async function clearChatHistory() {
    if (!conversationId || clearing) return

    Alert.alert('Clear chat history?', 'This will clear this chat from your side.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          setClearing(true)

          try {
            const {
              data: { user },
            } = await supabase.auth.getUser()

            if (!user?.id) {
              Alert.alert('Login required', 'Please log in again first.')
              return
            }

            const { data: conversation, error: conversationError } = await supabase
              .from('chat_conversations')
              .select('id, participant_one_id, participant_two_id')
              .eq('id', conversationId)
              .single()

            if (conversationError) throw conversationError

            const deletionField = getConversationDeletionField(conversation, user.id)

            if (!deletionField) {
              Alert.alert('Clear unavailable', 'We could not identify your chat side.')
              return
            }

            const clearedAt = new Date().toISOString()
            const { error } = await supabase
              .from('chat_conversations')
              .update({
                [deletionField]: clearedAt,
                updated_at: clearedAt,
              })
              .eq('id', conversationId)

            if (error) throw error

            const { error: senderDeleteError } = await supabase
              .from('chat_messages')
              .update({
                deleted_for_sender_at: clearedAt,
                updated_at: clearedAt,
              })
              .eq('conversation_id', conversationId)
              .eq('sender_id', user.id)

            if (senderDeleteError) throw senderDeleteError

            const { error: receiverDeleteError } = await supabase
              .from('chat_messages')
              .update({
                deleted_for_receiver_at: clearedAt,
                updated_at: clearedAt,
              })
              .eq('conversation_id', conversationId)
              .eq('receiver_id', user.id)

            if (receiverDeleteError) throw receiverDeleteError

            Alert.alert('Chat cleared', 'This chat history was cleared from your side.', [
              {
                text: 'OK',
                onPress: () => navigation.navigate('MainTabs', { screen: 'Chat' }),
              },
            ])
          } catch (error) {
            Alert.alert('Clear failed', error?.message || 'Could not clear this chat.')
          } finally {
            setClearing(false)
          }
        },
      },
    ])
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: 14, paddingBottom: 28, gap: 12 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.border,
            backgroundColor: theme.surface,
            padding: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {participant ? <MemberTile profile={participant} /> : null}
          <AddGroupTile
            onPress={() =>
              navigation.navigate('CreateGroupChat', {
                conversationId,
                participant,
                property,
              })
            }
          />
        </View>

        <SettingsGroup>
          <SettingsRow
            icon="search-outline"
            label="Search chat history"
            onPress={() =>
              navigation.navigate('ChatHistorySearch', {
                conversationId,
                participant,
                property,
              })
            }
          />
          <SettingsRow
            icon="notifications-off-outline"
            label="Mute Notification"
            right={(
              <Switch
                value={muted}
                onValueChange={toggleMute}
                disabled={!conversationId || savingMute}
                trackColor={{ false: theme.border, true: theme.accentSoft }}
                thumbColor={muted ? theme.accent : theme.surfaceMuted}
              />
            )}
          />
          <SettingsRow
            icon="pin-outline"
            label="Sticky on top"
            right={(
              <Switch
                value={pinned}
                onValueChange={togglePinned}
                disabled={!conversationId || savingPinned}
                trackColor={{ false: theme.border, true: theme.accentSoft }}
                thumbColor={pinned ? theme.accent : theme.surfaceMuted}
              />
            )}
          />
          <SettingsRow
            icon="color-palette-outline"
            label="Chat appearance and background"
            onPress={() => navigation.navigate('ChatAppearance', { conversationId })}
          />
        </SettingsGroup>

        <SettingsGroup>
          <SettingsRow
            icon="trash-outline"
            label={clearing ? 'Clearing...' : 'Clear Chat History'}
            danger
            onPress={clearChatHistory}
          />
          <SettingsRow
            icon="flag-outline"
            label="Report"
            danger
            onPress={() =>
              navigation.navigate('ReportIssue', {
                kind: 'user',
                owner: participant
                  ? {
                    id: participant.id || participant.user_id,
                    name: participant.name || participant.display_name || participant.email,
                    avatar_url: participant.avatar_url,
                  }
                  : null,
              })
            }
          />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  )
}
