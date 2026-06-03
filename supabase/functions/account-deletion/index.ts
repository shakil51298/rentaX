import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

type AccountDeletionAction = 'approve' | 'process_due'

type AccountDeletionRequest = {
  action?: AccountDeletionAction
  requestId?: string
  adminNote?: string | null
}

const PRIMARY_ADMIN_EMAILS = (Deno.env.get('PRIMARY_ADMIN_EMAILS') || 'shakilkhan51298@gmail.com')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function isPrimaryAdminEmail(email?: string | null) {
  return PRIMARY_ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase())
}

async function getCaller(request: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = request.headers.get('Authorization') || ''

  if (!authHeader) return null

  const authClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  })

  const {
    data: { user },
  } = await authClient.auth.getUser()

  return user || null
}

async function markProfileForDeletion(adminClient: any, requestRow: any, deletedAt: string) {
  await adminClient
    .from('user_profiles')
    .update({
      account_deletion_status: 'deleted',
      account_deletion_requested_at: requestRow.requested_at || null,
      account_deletion_scheduled_at: requestRow.scheduled_deletion_at || null,
      account_deleted_at: deletedAt,
      updated_at: deletedAt,
    })
    .eq('user_id', requestRow.user_id)
}

async function deleteAccountForRequest({
  adminClient,
  requestRow,
  adminUser,
  adminNote,
  automatic = false,
}: {
  adminClient: any
  requestRow: any
  adminUser?: any
  adminNote?: string | null
  automatic?: boolean
}) {
  if (!requestRow?.id || !requestRow?.user_id) {
    throw new Error('Missing account deletion request details.')
  }

  const reviewedAt = new Date().toISOString()

  const { data: approvedRequest, error: approveError } = await adminClient
    .from('account_deletion_requests')
    .update({
      status: 'approved',
      reviewed_by_user_id: adminUser?.id || null,
      reviewed_by_email: automatic ? 'automatic_14_day_job' : adminUser?.email || null,
      reviewed_at: reviewedAt,
      admin_note: adminNote || null,
      updated_at: reviewedAt,
    })
    .eq('id', requestRow.id)
    .in('status', ['pending', 'approved'])
    .select('*')
    .single()

  if (approveError) throw approveError

  await markProfileForDeletion(adminClient, approvedRequest, reviewedAt)

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(approvedRequest.user_id)

  if (deleteError) throw deleteError

  const deletedAt = new Date().toISOString()
  const { data: deletedRequest, error: updateError } = await adminClient
    .from('account_deletion_requests')
    .update({
      status: 'deleted',
      deleted_at: deletedAt,
      updated_at: deletedAt,
    })
    .eq('id', approvedRequest.id)
    .select('*')
    .single()

  if (updateError) throw updateError

  return deletedRequest
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Only POST is allowed.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Supabase environment variables are missing.' }, 500)
  }

  let payload: AccountDeletionRequest

  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)
  const caller = await getCaller(request, supabaseUrl, anonKey)
  const cronSecret = Deno.env.get('ACCOUNT_DELETION_CRON_SECRET') || ''
  const requestSecret = request.headers.get('x-cron-secret') || ''
  const hasCronAccess = Boolean(cronSecret && requestSecret === cronSecret)
  const hasAdminAccess = isPrimaryAdminEmail(caller?.email)

  if (payload.action === 'process_due') {
    if (!hasAdminAccess && !hasCronAccess) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const { data: dueRequests, error } = await adminClient
      .from('account_deletion_requests')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_deletion_at', new Date().toISOString())
      .order('scheduled_deletion_at', { ascending: true })
      .limit(25)

    if (error) return jsonResponse({ error: error.message }, 400)

    const results = []

    for (const requestRow of dueRequests || []) {
      try {
        const deletedRequest = await deleteAccountForRequest({
          adminClient,
          requestRow,
          automatic: true,
        })
        results.push({ id: requestRow.id, status: 'deleted', request: deletedRequest })
      } catch (error) {
        results.push({ id: requestRow.id, status: 'failed', error: error?.message || String(error) })
      }
    }

    return jsonResponse({ success: true, processed: results.length, results })
  }

  if (payload.action !== 'approve') {
    return jsonResponse({ error: 'Unsupported action.' }, 400)
  }

  if (!hasAdminAccess) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  if (!payload.requestId) {
    return jsonResponse({ error: 'requestId is required.' }, 400)
  }

  const { data: requestRow, error } = await adminClient
    .from('account_deletion_requests')
    .select('*')
    .eq('id', payload.requestId)
    .single()

  if (error) return jsonResponse({ error: error.message }, 400)

  try {
    const deletedRequest = await deleteAccountForRequest({
      adminClient,
      requestRow,
      adminUser: caller,
      adminNote: payload.adminNote || null,
    })

    return jsonResponse({ success: true, request: deletedRequest })
  } catch (error) {
    return jsonResponse({ error: error?.message || 'Account deletion failed.' }, 400)
  }
})
