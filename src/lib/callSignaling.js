import { supabase } from './supabase'

export function buildCallSignalKey(kind, { callId, channelName }) {
  return `${kind}:${callId || channelName || 'live'}`
}

export function subscribeToCallSignals(callSignalKey, onSignal) {
  const channel = supabase.channel(`call-signal-${callSignalKey}`)

  channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
    onSignal(payload || {})
  })

  const ready = new Promise((resolve, reject) => {
    let settled = false

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        settled = true
        resolve(channel)
        return
      }

      if (!settled && ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        settled = true
        reject(new Error(`Call signaling ${String(status).toLowerCase().replace(/_/g, ' ')}.`))
      }
    })
  })

  return { channel, ready }
}

export async function sendCallSignal(channel, payload) {
  if (!channel) return

  await channel.send({
    type: 'broadcast',
    event: 'signal',
    payload: {
      ...payload,
      sentAt: new Date().toISOString(),
    },
  })
}

export function unsubscribeCallSignals(channel) {
  if (!channel) return
  supabase.removeChannel(channel)
}
