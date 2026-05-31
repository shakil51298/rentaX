import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
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

function MemberActionRow({ icon, label, danger = false, disabled = false, onPress }) {
  const { theme } = useAppSettings()

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.84}
      style={{
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 12,
          backgroundColor: danger ? '#fee2e2' : theme.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 10,
        }}
      >
        <Ionicons name={icon} size={18} color={danger ? '#dc2626' : theme.accent} />
      </View>
      <Text
        style={{
          flex: 1,
          color: danger ? '#dc2626' : theme.text,
          fontSize: 14,
          fontWeight: '900',
        }}
      >
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={17} color={theme.mutedText} />
    </TouchableOpacity>
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
  const [selectedMember, setSelectedMember] = useState(null)
  const [memberActionMode, setMemberActionMode] = useState('actions')
  const [nicknameDraft, setNicknameDraft] = useState('')
  const [memberActionSaving, setMemberActionSaving] = useState(false)

  const currentMember = members.find((member) => member.user_id === currentUserId)
  const canEdit = currentMember?.role === 'admin'
  const groupOwnerId = conversation?.group_created_by || conversation?.created_by || null
  const isGroupOwner = Boolean(groupOwnerId && groupOwnerId === currentUserId)
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

  function openMemberActions(member) {
    setSelectedMember(member)
    setNicknameDraft(member?.nickname || '')
    setMemberActionMode('actions')
  }

  function closeMemberActions(force = false) {
    if (memberActionSaving && !force) return

    setSelectedMember(null)
    setMemberActionMode('actions')
    setNicknameDraft('')
  }

  async function updateSelectedMember(updates, successMessage) {
    if (!selectedMember?.user_id || !conversationId || memberActionSaving) return

    try {
      setMemberActionSaving(true)

      const { data, error } = await supabase
        .from('chat_group_members')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('conversation_id', conversationId)
        .eq('user_id', selectedMember.user_id)
        .select('id, conversation_id, user_id, role, status, joined_at, nickname, last_read_at, cleared_at')
        .single()

      if (error) throw error

      if (data?.status === 'active') {
        setMembers((current) =>
          current.map((member) =>
            member.user_id === selectedMember.user_id
              ? { ...member, ...data, profile: member.profile }
              : member
          )
        )
      } else {
        setMembers((current) => current.filter((member) => member.user_id !== selectedMember.user_id))
      }

      Alert.alert('Updated', successMessage)
      closeMemberActions(true)
    } catch (error) {
      Alert.alert('Update failed', error?.message || 'Could not update this member.')
    } finally {
      setMemberActionSaving(false)
    }
  }

  function removeSelectedMember() {
    const selectedIsOwner = selectedMember?.user_id && selectedMember.user_id === groupOwnerId
    const selectedIsAdmin = selectedMember?.role === 'admin'

    if (
      !selectedMember ||
      selectedMember.user_id === currentUserId ||
      selectedIsOwner ||
      !canEdit ||
      (selectedIsAdmin && !isGroupOwner)
    ) return

    Alert.alert('Remove member?', 'This member will no longer see new group messages.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          updateSelectedMember(
            {
              status: 'removed',
              left_at: new Date().toISOString(),
            },
            'Member removed from this group.'
          ),
      },
    ])
  }

  async function saveSelectedNickname() {
    const nextNickname = nicknameDraft.trim()

    await updateSelectedMember(
      {
        nickname: nextNickname || null,
      },
      nextNickname ? 'Nickname saved.' : 'Nickname removed.'
    )
  }

  function toggleSelectedMemberAdmin() {
    const selectedIsOwner = selectedMember?.user_id && selectedMember.user_id === groupOwnerId

    if (!selectedMember || selectedMember.user_id === currentUserId || selectedIsOwner || !isGroupOwner) return

    const nextRole = selectedMember.role === 'admin' ? 'member' : 'admin'

    updateSelectedMember(
      { role: nextRole },
      nextRole === 'admin'
        ? 'Member is now an admin.'
        : 'Member admin access was removed.'
    )
  }

  function sendMessageToSelectedMember() {
    if (!selectedMember?.user_id || selectedMember.user_id === currentUserId) return

    const profile = selectedMember.profile || {}

    closeMemberActions()
    navigation.navigate('MainTabs', {
      screen: 'Chat',
      params: {
        participant: {
          id: selectedMember.user_id,
          user_id: selectedMember.user_id,
          ...profile,
        },
      },
    })
  }

  function openAddMembers() {
    if (!canEdit) return

    navigation.navigate('CreateGroupChat', {
      conversationId,
      conversation,
      isAddingToGroup: true,
    })
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
          {canEdit ? (
            <TouchableOpacity
              onPress={openAddMembers}
              activeOpacity={0.84}
              style={{
                minHeight: 50,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                borderTopWidth: 1,
                borderTopColor: theme.border,
                backgroundColor: theme.surface,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 13,
                  backgroundColor: theme.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 10,
                }}
              >
                <Ionicons name="person-add-outline" size={18} color={theme.accent} />
              </View>
              <Text style={{ flex: 1, color: theme.text, fontWeight: '900' }}>
                Add new member
              </Text>
              <Ionicons name="chevron-forward" size={17} color={theme.mutedText} />
            </TouchableOpacity>
          ) : null}

          {members.map((member) => {
            const name = getProfileName(member.profile, 'Rental X member')
            const displayName = member.nickname || name
            const hasNickname = Boolean(member.nickname)

            return (
              <TouchableOpacity
                key={member.user_id}
                onPress={() => openMemberActions(member)}
                activeOpacity={0.84}
                style={{
                  minHeight: 58,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                  borderTopWidth: 1,
                  borderTopColor: theme.border,
                }}
              >
                <Avatar profile={member.profile} name={displayName} size={38} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={{ color: theme.text, fontWeight: '900' }} numberOfLines={1}>
                    {displayName}
                  </Text>
                  <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 2 }}>
                    {member.role === 'admin' ? 'Admin' : 'Member'}
                    {hasNickname ? ` • ${name}` : ''}
                  </Text>
                </View>
                {member.user_id === currentUserId ? (
                  <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '900' }}>
                    You
                  </Text>
                ) : (
                  <Ionicons name="chevron-forward" size={17} color={theme.mutedText} />
                )}
              </TouchableOpacity>
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

      <Modal
        visible={Boolean(selectedMember)}
        transparent
        animationType="fade"
        onRequestClose={() => closeMemberActions()}
      >
        <Pressable
          onPress={() => closeMemberActions()}
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(15, 23, 42, 0.42)',
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: theme.surface,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 22,
            }}
          >
            {selectedMember ? (
              <>
                <View
                  style={{
                    width: 44,
                    height: 4,
                    borderRadius: 999,
                    backgroundColor: theme.border,
                    alignSelf: 'center',
                    marginBottom: 14,
                  }}
                />

                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <Avatar
                    profile={selectedMember.profile}
                    name={selectedMember.nickname || getProfileName(selectedMember.profile, 'Rental X member')}
                    size={44}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: '900' }} numberOfLines={1}>
                      {selectedMember.nickname || getProfileName(selectedMember.profile, 'Rental X member')}
                    </Text>
                    <Text style={{ color: theme.mutedText, fontSize: 12, marginTop: 2 }}>
                      {selectedMember.role === 'admin' ? 'Admin' : 'Member'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => closeMemberActions()}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: theme.surfaceMuted,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="close" size={19} color={theme.text} />
                  </TouchableOpacity>
                </View>

                {memberActionMode === 'nickname' ? (
                  <View>
                    <TextInput
                      value={nicknameDraft}
                      onChangeText={setNicknameDraft}
                      placeholder="Set nickname"
                      placeholderTextColor={theme.mutedText}
                      autoCapitalize="words"
                      style={{
                        minHeight: 46,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: theme.border,
                        backgroundColor: theme.surfaceMuted,
                        color: theme.text,
                        paddingHorizontal: 12,
                        fontWeight: '800',
                      }}
                    />
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                      <TouchableOpacity
                        onPress={() => setMemberActionMode('actions')}
                        disabled={memberActionSaving}
                        style={{
                          flex: 1,
                          minHeight: 44,
                          borderRadius: 14,
                          backgroundColor: theme.surfaceMuted,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: theme.text, fontWeight: '900' }}>Back</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={saveSelectedNickname}
                        disabled={memberActionSaving}
                        style={{
                          flex: 1,
                          minHeight: 44,
                          borderRadius: 14,
                          backgroundColor: theme.accent,
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: memberActionSaving ? 0.65 : 1,
                        }}
                      >
                        {memberActionSaving ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={{ color: '#fff', fontWeight: '900' }}>Save</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View
                    style={{
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: theme.border,
                      backgroundColor: theme.surface,
                      overflow: 'hidden',
                    }}
                  >
                    <MemberActionRow
                      icon="chatbubble-ellipses-outline"
                      label="Send message"
                      disabled={selectedMember.user_id === currentUserId}
                      onPress={sendMessageToSelectedMember}
                    />
                    <MemberActionRow
                      icon="pricetag-outline"
                      label="Set nickname"
                      disabled={!(canEdit || selectedMember.user_id === currentUserId)}
                      onPress={() => setMemberActionMode('nickname')}
                    />
                    {(() => {
                      const selectedIsOwner = selectedMember.user_id === groupOwnerId
                      const selectedIsCurrent = selectedMember.user_id === currentUserId
                      const selectedIsAdmin = selectedMember.role === 'admin'

                      return (
                        <>
                          <MemberActionRow
                            icon={selectedIsAdmin ? 'shield-outline' : 'shield-checkmark-outline'}
                            label={selectedIsAdmin ? 'Remove from admin' : 'Make admin'}
                            disabled={!isGroupOwner || selectedIsCurrent || selectedIsOwner}
                            onPress={toggleSelectedMemberAdmin}
                          />
                          <MemberActionRow
                            icon="person-remove-outline"
                            label="Remove member"
                            danger
                            disabled={
                              !canEdit ||
                              selectedIsCurrent ||
                              selectedIsOwner ||
                              (selectedIsAdmin && !isGroupOwner)
                            }
                            onPress={removeSelectedMember}
                          />
                        </>
                      )
                    })()}
                  </View>
                )}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}
