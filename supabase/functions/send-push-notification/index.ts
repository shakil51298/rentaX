import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type PushRequest = {
  recipientId?: string
  title?: string
  body?: string
  data?: Record<string, unknown>
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const authHeader = request.headers.get('Authorization') || ''

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Supabase environment variables are missing.' }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
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
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }

  let payload: PushRequest

  try {
    payload = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }

  if (!payload.recipientId || !payload.title || !payload.body) {
    return new Response(JSON.stringify({ error: 'recipientId, title, and body are required.' }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const { data: pushTokens, error: tokenError } = await adminClient
    .from('user_push_tokens')
    .select('id, expo_push_token')
    .eq('user_id', payload.recipientId)
    .eq('is_active', true)

  if (tokenError) {
    return new Response(JSON.stringify({ error: tokenError.message }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }

  if (!pushTokens?.length) {
    return new Response(JSON.stringify({ success: true, delivered: 0 }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
    })
  }

  const messages = pushTokens.map((item) => ({
    to: item.expo_push_token,
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data || {},
    channelId: 'default',
    priority: 'high',
  }))

  const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  })

  const expoResult = await expoResponse.json()
  const inactiveTokenIds: string[] = []

  if (Array.isArray(expoResult?.data)) {
    expoResult.data.forEach((item: { status?: string; details?: { error?: string } }, index: number) => {
      if (item?.status === 'error' && item?.details?.error === 'DeviceNotRegistered') {
        inactiveTokenIds.push(pushTokens[index].id)
      }
    })
  }

  if (inactiveTokenIds.length > 0) {
    await adminClient
      .from('user_push_tokens')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .in('id', inactiveTokenIds)
  }

  return new Response(JSON.stringify({ success: true, delivered: messages.length, expoResult }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
})
