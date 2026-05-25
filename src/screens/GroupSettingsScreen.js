import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Switch,
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
import {
  fetchGroupMembers,
  GROUP_INVITE_POLICIES,
  GROUP_MESSAGE_POLICIES,
  GROUP_PRIVACY_OPTIONS,
  updateGroupSettings,
} from '../lib/chatGroups'
import { getProfileName } from '../lib/userDisplay'

function Section({ title, children }) {
  const { theme } = useAppSettings()

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.surface,
        overflow: 'hidden',
      }}
    >
      <Text
        style={{
          color: theme.mutedText,
          fontSize: 11,
          fontWeight: '900',
          paddingHorizontal: 14,
          paddingTop: 12,
          paddingBottom: 7,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  )
}

function OptionRow({ options, value, onChange, disabled }) {
  const { theme } = useAppSettings()

  return (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 12 }}>
      {options.map((option) => {
        const active = option.id === value

        return (
          <TouchableOpacity
            key={option.id}
            onPress={() => onChange(option.id)}
            disabled={disabled || active}
            activeOpacity={0.84}
            style={{
              flex: 1,
              minHeight: 38,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: active ? theme.accent : theme.border,
              backgroundColor: active ? theme.accentSoft : theme.surfaceMuted,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 8,
              opacity: disabled ? 0.6 : 1,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                color: active ? theme.accentStrong : theme.text,
                fontSize: 12,
                fontWeight: '900',
              }}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function SwitchRow({ icon, label, value, onValueChange, disabled }) {
  const { theme } = useAppSettings()

  return (
    <View
      style={{
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        borderTopWidth: 1,
        borderTopColor: theme.border,
      }}
    >
      <Ionicons name={icon} size={19} color={theme.accent} style={{ width: 26 }} />
      <Text style={{ flex: 1, color: theme.text, fontSize: 14, fontWeight: '800', marginLeft: 8 }}>
        {label}
      </Text>
      <Switch
        value={Boolean(value)}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: theme.border, true: theme.accentSoft }}
        thumbColor={value ? theme.accent : theme.surfaceMuted}
      />
    </View>
  )
}

export default function GroupSettingsScreen({ route, navigation }) {
  const conversationId = route?.params?.conversationId
  const initialConversation = route?.params?.conversation || null
  const { theme } = useAppSettings()
  const [currentUserId, setCurrentUserId] = useState(null)
  const [conversation, setConversation] = useState(initialConversation)
  const [members, setMembers] = useState([])
  const [title, setTitle] = useState(initialConversation?.group_title || '')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const currentMember = members.find((member) => member.user_id === currentUserId)
  const canEdit = currentMember?.role === 'admin'
  const privacy = conversation?.group_privacy || 'private'
  const invitePolicy = conversation?.group_invite_policy || 'members'
  const messagePolicy = conversation?.group_message_policy || 'members'

  const loadGroup = useCallback(async () => {
    if (!conversationId) return

    setLoading(true)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      setCurrentUserId(user?.id || null)

      const [{ data: conversationRow, error: conversationError }, memberRows] = await Promise.all([
        supabase
          .from('chat_conversations')
          .select('*')
          .eq('id', conversationId)
          .single(),
        fetchGroupMembers(conversationId),
      ])

      if (conversationError) throw conversationError

      setConversation(conversationRow)
      setTitle(conversationRow?.group_title || '')
      setMembers(memberRows)
    } catch (error) {
      Alert.alert('Group unavailable', error?.message || 'Could not load this group.')
    } finally {
      setLoading(false)
    }
  }, [conversationId])

  useEffect(() => {
    loadGroup()
  }, [loadGroup])

  async function saveSettings(updates) {
    if (!conversationId || saving || !canEdit) return

    try {
      setSaving(true)
      const nextConversation = await updateGroupSettings(conversationId, updates)
      setConversation(nextConversation)
      if (typeof updates.group_title === 'string') {
        setTitle(updates.group_title)
      }
    } catch (error) {
      Alert.alert('Save failed', error?.message || 'Could not update group settings.')
    } finally {
      setSaving(false)
    }
  }

  async function saveTitle() {
    const nextTitle = title.trim()

    if (!nextTitle) {
      Alert.alert('Group name needed', 'Add a group name first.')
      return
    }

    await saveSettings({ group_title: nextTitle })
  }

  async function leaveGroup() {
    if (!conversationId || !currentUserId) return

    Alert.alert('Leave group?', 'You will stop receiving messages from this group.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          try {
            const now = new Date().toISOString()
            const { error } = await supabase
              .from('chat_group_members')
              .update({
                status: 'left',
                left_at: now,
                last_read_at: now,
              })
              .eq('conversation_id', conversationId)
              .eq('user_id', currentUserId)

            if (error) throw error

            navigation.navigate('MainTabs', { screen: 'Chat' })
          } catch (error) {
            Alert.alert('Leave failed', error?.message || 'Could not leave this group.')
          }
        },
      },
    ])
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['left', 'right', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 30, gap: 12 }}>
        <Section title="Group">
          <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              editable={canEdit && !saving}
              placeholder="Group name"
              placeholderTextColor={theme.mutedText}
              style={{
                minHeight: 44,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.border,
                backgroundColor: theme.surfaceMuted,
                color: theme.text,
                paddingHorizontal: 12,
                fontWeight: '900',
              }}
            />
            {canEdit ? (
              <TouchableOpacity
                onPress={saveTitle}
                disabled={saving}
                activeOpacity={0.84}
                style={{
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: theme.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 10,
                  opacity: saving ? 0.7 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '900' }}>
                  {saving ? 'Saving...' : 'Save name'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Section>

        <Section title="Privacy">
          <OptionRow
            options={GROUP_PRIVACY_OPTIONS}
            value={privacy}
            disabled={!canEdit || saving}
            onChange={(value) => saveSettings({ group_privacy: value })}
          />
          <OptionRow
            options={GROUP_INVITE_POLICIES}
            value={invitePolicy}
            disabled={!canEdit || saving}
            onChange={(value) => saveSettings({ group_invite_policy: value })}
          />
          <OptionRow
            options={GROUP_MESSAGE_POLICIES}
            value={messagePolicy}
            disabled={!canEdit || saving}
            onChange={(value) => saveSettings({ group_message_policy: value })}
          />
          <SwitchRow
            icon="person-add-outline"
            label="Approve new members"
            value={conversation?.group_approval_required}
            disabled={!canEdit || saving}
            onValueChange={(value) => saveSettings({ group_approval_required: value })}
          />
        </Section>

        <Section title="Smart features">
          <SwitchRow
            icon="sparkles-outline"
            label="Smart chat summary"
            value={conversation?.smart_summary_enabled}
            disabled={!canEdit || saving}
            onValueChange={(value) => saveSettings({ smart_summary_enabled: value })}
          />
          <SwitchRow
            icon="shield-checkmark-outline"
            label="Safety alerts"
            value={conversation?.smart_safety_enabled}
            disabled={!canEdit || saving}
            onValueChange={(value) => saveSettings({ smart_safety_enabled: value })}
          />
          <SwitchRow
            icon="home-outline"
            label="Rental assistant"
            value={conversation?.smart_rental_assistant_enabled}
            disabled={!canEdit || saving}
            onValueChange={(value) => saveSettings({ smart_rental_assistant_enabled: value })}
          />
        </Section>

        <Section title={`Members ${members.length}`}>
          {members.map((member) => {
            const name = getProfileName(member.profile, 'Rental X member')

            return (
              <View
                key={member.user_id}
                style={{
                  minHeight: 58,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                  borderTopWidth: 1,
                  borderTopColor: theme.border,
                }}
              >
                <Avatar profile={member.profile} name={name} size={38} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: theme.text, fontWeight: '900' }} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 2 }}>
                    {member.role === 'admin' ? 'Admin' : 'Member'}
                  </Text>
                </View>
                {member.user_id === currentUserId ? (
                  <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '900' }}>
                    You
                  </Text>
                ) : null}
              </View>
            )
          })}
        </Section>

        <TouchableOpacity
          onPress={leaveGroup}
          activeOpacity={0.84}
          style={{
            minHeight: 48,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: '#fecaca',
            backgroundColor: theme.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#dc2626', fontWeight: '900' }}>Leave group</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}
