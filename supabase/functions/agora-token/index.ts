import { createClient } from 'npm:@supabase/supabase-js@2'
import { RtcRole, RtcTokenBuilder } from 'npm:agora-token@2.0.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type TokenRequest = {
  channelName?: string
  uid?: number | string
  callKind?: 'audio' | 'video' | string
  role?: 'publisher' | 'subscriber' | string
}

function badRequest(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return badRequest('Only POST is allowed.', 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const agoraAppId = Deno.env.get('AGORA_APP_ID') || ''
  const agoraAppCertificate = Deno.env.get('AGORA_APP_CERTIFICATE') || ''
  const authHeader = request.headers.get('Authorization') || ''

  if (!supabaseUrl || !anonKey) {
    return badRequest('Supabase environment variables are missing.', 500)
  }

  if (!agoraAppId || !agoraAppCertificate) {
    return badRequest('Agora secrets are missing on the server.', 500)
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser()

  if (userError || !user) {
    return badRequest('Unauthorized', 401)
  }

  let payload: TokenRequest

  try {
    payload = await request.json()
  } catch {
    return badRequest('Invalid request body.')
  }

  const channelName = String(payload.channelName || '').trim()
  const numericUid = Number(payload.uid)

  if (!channelName) {
    return badRequest('channelName is required.')
  }

  if (!Number.isFinite(numericUid) || numericUid <= 0) {
    return badRequest('uid must be a positive number.')
  }

  const role =
    String(payload.role || 'publisher').toLowerCase() === 'subscriber'
      ? RtcRole.SUBSCRIBER
      : RtcRole.PUBLISHER

  const nowInSeconds = Math.floor(Date.now() / 1000)
  const expireAt = nowInSeconds + 60 * 60

  const token = RtcTokenBuilder.buildTokenWithUid(
    agoraAppId,
    agoraAppCertificate,
    channelName,
    numericUid,
    role,
    expireAt
  )

  return new Response(
    JSON.stringify({
      token,
      appId: agoraAppId,
      channelName,
      uid: numericUid,
      expiresAt: expireAt,
    }),
    {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    }
  )
})
