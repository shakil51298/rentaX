import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send'
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000
const IPHONE_NOTIFICATION_CHANNEL_ID = 'messages_iphone_notification_v2'
const IPHONE_NOTIFICATION_SOUND_FILE = 'iphone_notification.mp3'

type ReminderRequest = {
  dryRun?: boolean
  limit?: number
}

type RecipientRow = {
  id: string
  red_packet_id: string
  user_id: string
  amount: number
  currency: string
  last_reminded_at: string | null
  created_at: string
}

type PacketRow = {
  id: string
  message_id: string
  conversation_id: string
  sender_id: string
  wish: string | null
  currency: string
  created_at: string
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function isValidExpoPushToken(value?: string) {
  return typeof value === 'string'
    && /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(value.trim())
}

function formatAmount(amount: number, currency: string) {
  const safeAmount = Number(amount || 0)
  const formatted = safeAmount % 1 === 0 ? String(safeAmount) : safeAmount.toFixed(2)
  return `${formatted} ${currency || 'BDT'}`
}

function getDisplayName(profile: any, fallback = 'Someone') {
  return (
    profile?.display_name
    || profile?.email
    || fallback
  )
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Only POST is allowed.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const reminderSecret = Deno.env.get('RED_PACKET_REMINDER_SECRET') || ''
  const requestSecret = request.headers.get('x-cron-secret') || ''

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, error: 'Supabase environment variables are missing.' }, 500)
  }

  if (!reminderSecret) {
    return jsonResponse({ success: false, error: 'RED_PACKET_REMINDER_SECRET is not configured.' }, 500)
  }

  if (requestSecret !== reminderSecret) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401)
  }

  let payload: ReminderRequest = {}

  try {
    payload = await request.json()
  } catch {
    payload = {}
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const now = Date.now()
  const reminderLimit = Math.min(Math.max(Number(payload.limit || 75), 1), 200)

  const { data: recipients, error: recipientsError } = await adminClient
    .from('chat_red_packet_recipients')
    .select('id, red_packet_id, user_id, amount, currency, last_reminded_at, created_at')
    .is('opened_at', null)
    .order('created_at', { ascending: true })
    .limit(300)

  if (recipientsError) {
    return jsonResponse({ success: false, error: recipientsError.message }, 400)
  }

  const packetIds = [...new Set((recipients || []).map((item: RecipientRow) => item.red_packet_id).filter(Boolean))]

  if (!packetIds.length) {
    return jsonResponse({ success: true, checked: 0, due: 0, delivered: 0 })
  }

  const { data: packets, error: packetsError } = await adminClient
    .from('chat_red_packets')
    .select('id, message_id, conversation_id, sender_id, wish, currency, created_at')
    .in('id', packetIds)

  if (packetsError) {
    return jsonResponse({ success: false, error: packetsError.message }, 400)
  }

  const packetsById = new Map((packets || []).map((packet: PacketRow) => [packet.id, packet]))
  const dueRecipients = (recipients || [])
    .filter((recipient: RecipientRow) => {
      const packet = packetsById.get(recipient.red_packet_id)
      if (!packet) return false

      const lastReminderAt = recipient.last_reminded_at || packet.created_at || recipient.created_at
      const lastReminderTime = new Date(lastReminderAt).getTime()

      return Number.isFinite(lastReminderTime) && now - lastReminderTime >= FIVE_HOURS_MS
    })
    .slice(0, reminderLimit)

  if (!dueRecipients.length) {
    return jsonResponse({ success: true, checked: recipients?.length || 0, due: 0, delivered: 0 })
  }

  const recipientIds = [...new Set(dueRecipients.map((item: RecipientRow) => item.user_id))]
  const senderIds = [
    ...new Set(
      dueRecipients
        .map((item: RecipientRow) => packetsById.get(item.red_packet_id)?.sender_id)
        .filter(Boolean)
    ),
  ]

  const [{ data: tokens }, { data: profiles }] = await Promise.all([
    adminClient
      .from('user_push_tokens')
      .select('id, user_id, expo_push_token')
      .in('user_id', recipientIds)
      .eq('is_active', true),
    adminClient
      .from('user_profiles')
      .select('user_id, email, display_name')
      .in('user_id', senderIds),
  ])

  const tokensByUserId = (tokens || []).reduce((itemsByUserId: Record<string, any[]>, token: any) => {
    if (!isValidExpoPushToken(token.expo_push_token)) return itemsByUserId
    if (!itemsByUserId[token.user_id]) itemsByUserId[token.user_id] = []
    itemsByUserId[token.user_id].push(token)
    return itemsByUserId
  }, {})

  const profilesByUserId = (profiles || []).reduce((itemsByUserId: Record<string, any>, profile: any) => {
    itemsByUserId[profile.user_id] = profile
    return itemsByUserId
  }, {})

  const reminderTargets = dueRecipients.flatMap((recipient: RecipientRow) => {
    const packet = packetsById.get(recipient.red_packet_id)
    const senderName = getDisplayName(profilesByUserId[packet?.sender_id || ''], 'Someone')

    return (tokensByUserId[recipient.user_id] || []).map((token) => ({
      recipient,
      token,
      packet,
      senderName,
    }))
  })

  if (!reminderTargets.length) {
    return jsonResponse({
      success: true,
      checked: recipients?.length || 0,
      due: dueRecipients.length,
      delivered: 0,
      warning: 'No active push tokens for due recipients.',
    })
  }

  if (payload.dryRun) {
    return jsonResponse({
      success: true,
      dryRun: true,
      checked: recipients?.length || 0,
      due: dueRecipients.length,
      attempted: reminderTargets.length,
    })
  }

  const messages = reminderTargets.map(({ recipient, token, packet, senderName }) => ({
    to: token.expo_push_token,
    title: 'Unopened red packet',
    body: `${senderName} sent you ${formatAmount(recipient.amount, recipient.currency || packet?.currency || 'BDT')}. Tap to open it.`,
    data: {
      type: 'red_packet_reminder',
      conversationId: packet?.conversation_id,
      messageId: packet?.message_id,
      redPacketId: recipient.red_packet_id,
      actorId: packet?.sender_id,
      actorName: senderName,
      channelId: IPHONE_NOTIFICATION_CHANNEL_ID,
    },
    channelId: IPHONE_NOTIFICATION_CHANNEL_ID,
    sound: IPHONE_NOTIFICATION_SOUND_FILE,
    priority: 'high',
  }))

  const expoResponse = await fetch(EXPO_PUSH_SEND_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  })
  const expoResult = await expoResponse.json().catch(() => ({}))

  if (!expoResponse.ok) {
    return jsonResponse({
      success: false,
      checked: recipients?.length || 0,
      due: dueRecipients.length,
      delivered: 0,
      error: expoResult?.errors?.[0]?.message || `Expo push service failed (${expoResponse.status}).`,
      expoResult,
    }, 502)
  }

  const acceptedRecipientIds = new Set<string>()
  const resultItems = Array.isArray(expoResult?.data) ? expoResult.data : []

  resultItems.forEach((item: { status?: string }, index: number) => {
    if (item?.status === 'ok') {
      acceptedRecipientIds.add(reminderTargets[index]?.recipient?.id)
    }
  })

  const acceptedIds = [...acceptedRecipientIds].filter(Boolean)

  if (acceptedIds.length) {
    await adminClient
      .from('chat_red_packet_recipients')
      .update({ last_reminded_at: new Date().toISOString() })
      .in('id', acceptedIds)
  }

  return jsonResponse({
    success: acceptedIds.length > 0,
    checked: recipients?.length || 0,
    due: dueRecipients.length,
    attempted: reminderTargets.length,
    delivered: resultItems.filter((item: { status?: string }) => item?.status === 'ok').length,
    updatedRecipients: acceptedIds.length,
    expoResult,
  })
})
