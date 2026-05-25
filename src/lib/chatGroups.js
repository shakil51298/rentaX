import { supabase } from './supabase'
import { getProfileName } from './userDisplay'

export const GROUP_PRIVACY_OPTIONS = [
  { id: 'private', label: 'Private' },
  { id: 'discoverable', label: 'Discoverable' },
]

export const GROUP_INVITE_POLICIES = [
  { id: 'members', label: 'Everyone can invite' },
  { id: 'admins', label: 'Admins only' },
]

export const GROUP_MESSAGE_POLICIES = [
  { id: 'members', label: 'Everyone can send' },
  { id: 'admins', label: 'Admins only' },
]

export function isGroupConversation(conversation = {}) {
  return conversation?.conversation_type === 'group'
}

export function buildGroupProfile(conversation = {}) {
  return {
    id: conversation.id,
    user_id: conversation.id,
    display_name: conversation.group_title || 'Group chat',
    name: conversation.group_title || 'Group chat',
    avatar_url: conversation.group_avatar_url || null,
    is_group: true,
  }
}

function normalizeMemberIds(ids = []) {
  return [...new Set(ids.filter(Boolean).map(String))]
}

export function buildGroupTitle(profiles = []) {
  const names = profiles
    .map((profile) => getProfileName(profile, 'User').split(/\s+/)[0])
    .filter(Boolean)
    .slice(0, 4)

  if (!names.length) return 'Group chat'
  if (names.length === 1) return `${names[0]} group`

  return names.join(', ')
}

export async function fetchGroupMembers(conversationId) {
  if (!conversationId) return []

  const { data: memberRows, error } = await supabase
    .from('chat_group_members')
    .select('id, conversation_id, user_id, role, status, joined_at, nickname, last_read_at, cleared_at')
    .eq('conversation_id', conversationId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })

  if (error) throw error

  const memberIds = normalizeMemberIds((memberRows || []).map((member) => member.user_id))

  if (!memberIds.length) return []

  const { data: profiles } = await supabase
    .from('user_profiles')
    .select('user_id, email, display_name, rentalx_id, avatar_url, is_verified')
    .in('user_id', memberIds)

  const profilesById = (profiles || []).reduce((itemsById, profile) => {
    itemsById[profile.user_id] = profile
    return itemsById
  }, {})

  return (memberRows || []).map((member) => ({
    ...member,
    profile: {
      id: member.user_id,
      user_id: member.user_id,
      ...(profilesById[member.user_id] || {}),
    },
  }))
}

export async function createGroupConversation({
  currentUserId,
  selectedProfiles = [],
  title,
}) {
  const otherProfiles = selectedProfiles.filter((profile) => {
    const id = profile?.id || profile?.user_id
    return id && id !== currentUserId
  })
  const memberIds = normalizeMemberIds([
    currentUserId,
    ...otherProfiles.map((profile) => profile.id || profile.user_id),
  ])
  const firstOtherId = memberIds.find((id) => id !== currentUserId)

  if (!currentUserId || !firstOtherId || memberIds.length < 3) {
    throw new Error('Select at least two contacts to create a group.')
  }

  const now = new Date().toISOString()
  const safeTitle = String(title || buildGroupTitle(otherProfiles)).trim() || 'Group chat'

  const { data: conversation, error: conversationError } = await supabase
    .from('chat_conversations')
    .insert({
      participant_one_id: currentUserId,
      participant_two_id: firstOtherId,
      property_id: `group:${currentUserId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      created_by: currentUserId,
      conversation_type: 'group',
      group_title: safeTitle,
      group_created_by: currentUserId,
      group_privacy: 'private',
      group_invite_policy: 'members',
      group_message_policy: 'members',
      group_approval_required: false,
      smart_summary_enabled: true,
      smart_safety_enabled: true,
      smart_rental_assistant_enabled: true,
      updated_at: now,
    })
    .select('*')
    .single()

  if (conversationError) throw conversationError

  const memberRows = memberIds.map((memberId) => ({
    conversation_id: conversation.id,
    user_id: memberId,
    role: memberId === currentUserId ? 'admin' : 'member',
    status: 'active',
    joined_by: currentUserId,
    joined_at: now,
  }))

  const { error: memberError } = await supabase
    .from('chat_group_members')
    .insert(memberRows)

  if (memberError) throw memberError

  return conversation
}

export async function addGroupMembers({ conversationId, currentUserId, selectedProfiles = [] }) {
  const memberIds = normalizeMemberIds(
    selectedProfiles
      .map((profile) => profile?.id || profile?.user_id)
      .filter((id) => id && id !== currentUserId)
  )

  if (!conversationId || !currentUserId || !memberIds.length) return []

  const now = new Date().toISOString()
  const rows = memberIds.map((memberId) => ({
    conversation_id: conversationId,
    user_id: memberId,
    role: 'member',
    status: 'active',
    joined_by: currentUserId,
    joined_at: now,
  }))

  const { data, error } = await supabase
    .from('chat_group_members')
    .upsert(rows, { onConflict: 'conversation_id,user_id' })
    .select('*')

  if (error) throw error

  return data || []
}

export async function updateGroupSettings(conversationId, updates = {}) {
  if (!conversationId) return null

  const { data, error } = await supabase
    .from('chat_conversations')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('conversation_type', 'group')
    .select('*')
    .single()

  if (error) throw error

  return data
}
