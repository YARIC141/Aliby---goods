/**
 * Edge Function: tbank-platform-notify
 * Receives T-Bank payment notifications and updates platform subscription status.
 * Must respond with "OK" (plain text) within 10 seconds.
 *
 * POST /functions/v1/tbank-platform-notify
 * No auth — called by T-Bank servers directly.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CONFIRMED_STATUSES = new Set(['CONFIRMED'])
const FAILED_STATUSES    = new Set(['REJECTED', 'CANCELLED', 'DEADLINE_EXPIRED'])

async function calcToken(params: Record<string, unknown>, password: string): Promise<string> {
  // Only scalar (string/number/boolean) fields; objects (DATA, etc.) are excluded per T-Bank spec
  const scalarEntries: Record<string, string> = { Password: password }
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && typeof v !== 'object' && String(v) !== '') {
      scalarEntries[k] = String(v)
    }
  }
  const str  = Object.keys(scalarEntries).sort().map(k => scalarEntries[k]).join('')
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const ok = () => new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 })

  let body: Record<string, unknown>
  const ct = req.headers.get('Content-Type') || ''
  try {
    if (ct.includes('application/json')) {
      body = await req.json()
    } else {
      const text = await req.text()
      body = Object.fromEntries(new URLSearchParams(text))
    }
  } catch {
    return ok()
  }

  const password = Deno.env.get('TBANK_PASSWORD')!

  // Extract token, verify against all scalar fields + Password
  const { Token: receivedToken, ...rest } = body as Record<string, unknown>
  const expectedToken = await calcToken(rest, password)

  if (!receivedToken || receivedToken !== expectedToken) {
    console.error('[tbank-notify] token mismatch', { receivedToken, expectedToken })
    return ok()
  }

  const paymentId = body.PaymentId
  const status    = body.Status as string
  const success   = body.Success === true || body.Success === 'true'

  if (!paymentId || !status) return ok()

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  if (CONFIRMED_STATUSES.has(status) && success) {
    await serviceClient
      .from('platform_subscriptions')
      .update({ status: 'active' })
      .eq('tbank_payment_id', String(paymentId))
      .eq('status', 'pending')
  } else if (FAILED_STATUSES.has(status)) {
    await serviceClient
      .from('platform_subscriptions')
      .update({ status: 'failed' })
      .eq('tbank_payment_id', String(paymentId))
      .eq('status', 'pending')
  }

  return ok()
})
