/**
 * Edge Function: tbank-platform-notify
 * Receives T-Bank payment notifications for platform subscriptions.
 * Must respond with "OK" within 10 seconds.
 *
 * POST /functions/v1/tbank-platform-notify
 * No auth — called by T-Bank servers directly.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { trackEvent } from '../_shared/analytics.ts'

const TBANK_CANCEL_URL = 'https://securepay.tinkoff.ru/v2/Cancel'

async function calcToken(params: Record<string, unknown>, password: string): Promise<string> {
  const entries: Record<string, string> = { Password: password }
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && typeof v !== 'object' && String(v) !== '') {
      entries[k] = String(v)
    }
  }
  const str  = Object.keys(entries).sort().map(k => entries[k]).join('')
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const ok = () => new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 })

  let body: Record<string, unknown>
  const ct = req.headers.get('Content-Type') || ''
  try {
    body = ct.includes('application/json') ? await req.json()
      : Object.fromEntries(new URLSearchParams(await req.text()))
  } catch { return ok() }

  const password = Deno.env.get('TBANK_PASSWORD')!
  const { Token: receivedToken, ...rest } = body as Record<string, unknown>
  if (receivedToken !== await calcToken(rest, password)) return ok()

  const paymentId = body.PaymentId
  const status    = body.Status as string
  const success   = body.Success === true || body.Success === 'true'
  const rebillId  = body.RebillId ? String(body.RebillId) : null

  if (!paymentId || !status) return ok()

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: sub } = await serviceClient
    .from('platform_subscriptions')
    .select('id, user_id, plan, amount_paid, is_trial, tbank_payment_id')
    .eq('tbank_payment_id', String(paymentId))
    .eq('status', 'pending')
    .single()

  if (status === 'CONFIRMED' && success) {
    const updates: Record<string, unknown> = { status: 'active' }
    if (rebillId) updates.rebill_id = rebillId

    await serviceClient
      .from('platform_subscriptions')
      .update(updates)
      .eq('tbank_payment_id', String(paymentId))
      .eq('status', 'pending')

    if (sub) {
      // If this was a trial payment (1 ₽), refund it immediately
      if (sub.is_trial) {
        const terminalKey = Deno.env.get('TBANK_TERMINAL_KEY')!
        const cancelScalar: Record<string, string | number> = {
          TerminalKey: terminalKey,
          PaymentId:   String(paymentId),
          Amount:      100,  // 1 ₽ in kopecks
        }
        await fetch(TBANK_CANCEL_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...cancelScalar, Token: await calcToken(cancelScalar, password) }),
        }).catch(() => {})
      }

      await trackEvent(serviceClient, 'payment_success', sub.user_id, {
        plan: sub.plan, amount: sub.amount_paid, payment_id: paymentId,
        subscription_id: sub.id, is_trial: sub.is_trial, rebill_id: rebillId,
      }, `payment_${paymentId}_CONFIRMED`)
      await trackEvent(serviceClient, 'subscription_activated', sub.user_id, {
        plan: sub.plan, subscription_id: sub.id, is_trial: sub.is_trial,
      }, `subscription_activated_${sub.id}`)
    }
  } else if (['REJECTED', 'CANCELLED', 'DEADLINE_EXPIRED'].includes(status)) {
    await serviceClient
      .from('platform_subscriptions')
      .update({ status: 'failed' })
      .eq('tbank_payment_id', String(paymentId))
      .eq('status', 'pending')

    if (sub) {
      await trackEvent(serviceClient, 'payment_failed', sub.user_id, {
        plan: sub.plan, amount: sub.amount_paid, payment_id: paymentId,
        tbank_status: status, subscription_id: sub.id,
      }, `payment_${paymentId}_${status}`)
    }
  }

  return ok()
})
