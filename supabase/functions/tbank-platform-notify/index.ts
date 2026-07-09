/**
 * Edge Function: tbank-platform-notify
 * Receives T-Bank payment notifications for platform subscriptions.
 * Must respond with "OK" within 10 seconds.
 * Critical: DB update happens BEFORE returning OK so webhook doesn't retry.
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

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Use direct REST fetch for the critical path — avoids supabase-js init latency
  const headers = {
    apikey:          serviceRoleKey,
    Authorization:   `Bearer ${serviceRoleKey}`,
    'Content-Type':  'application/json',
    Prefer:          'return=representation',
  }
  const baseUrl = `${supabaseUrl}/rest/v1/platform_subscriptions`
  const filter  = `tbank_payment_id=eq.${paymentId}&status=eq.pending`

  // Fetch the pending subscription first
  const subResp = await fetch(`${baseUrl}?${filter}&select=id,user_id,plan,plan_type,amount_paid,is_trial,extends_sub_id,end_date,monthly_amount_kopecks`, { headers })
  const subArr  = await subResp.json().catch(() => [])
  const sub     = Array.isArray(subArr) ? subArr[0] : null

  if (status === 'CONFIRMED' && success) {
    // ── CRITICAL: activate the subscription immediately ──────────────────────
    if (sub?.extends_sub_id) {
      // Extension of a cancelled trial: update the original record, expire the payment vehicle
      await Promise.all([
        fetch(`${baseUrl}?id=eq.${sub.extends_sub_id}`, {
          method:  'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({
            is_trial:               false,
            end_date:               sub.end_date,
            plan:                   sub.plan,
            status:                 'active',
            auto_renew:             false,
            amount_paid:            sub.amount_paid,
            monthly_amount_kopecks: sub.monthly_amount_kopecks,
            ...(rebillId ? { rebill_id: rebillId } : {}),
          }),
        }),
        fetch(`${baseUrl}?${filter}`, {
          method:  'PATCH',
          headers: { ...headers, Prefer: 'return=minimal' },
          body:    JSON.stringify({ status: 'expired' }),
        }),
      ])
    } else {
      const updates: Record<string, unknown> = { status: 'active', auto_renew: true }
      if (rebillId) updates.rebill_id = rebillId
      await fetch(`${baseUrl}?${filter}`, {
        method:  'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body:    JSON.stringify(updates),
      })
    }

    // ── NON-CRITICAL: refund + analytics — fire-and-forget ───────────────────
    ;(async () => {
      try {
        if (sub?.is_trial) {
          const terminalKey = Deno.env.get('TBANK_TERMINAL_KEY')!
          const cancelScalar: Record<string, string | number> = {
            TerminalKey: terminalKey,
            PaymentId:   String(paymentId),
            Amount:      100,
          }
          await fetch(TBANK_CANCEL_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...cancelScalar, Token: await calcToken(cancelScalar, password) }),
          }).catch(() => {})
        }
        if (sub) {
          const sc = createClient(supabaseUrl, serviceRoleKey)
          await trackEvent(sc, 'payment_success', sub.user_id, {
            plan: sub.plan, amount: sub.amount_paid, payment_id: paymentId,
            subscription_id: sub.id, is_trial: sub.is_trial, rebill_id: rebillId,
          }, `payment_${paymentId}_CONFIRMED`)
          await trackEvent(sc, 'subscription_activated', sub.user_id, {
            plan: sub.plan, plan_type: sub.plan_type, subscription_id: sub.id,
          }, `subscription_activated_${sub.id}`)
        }
      } catch(e) { console.error('[notify] post-activate error:', e) }
    })()

  } else if (['REJECTED', 'CANCELLED', 'DEADLINE_EXPIRED'].includes(status)) {
    // ── CRITICAL: mark as failed ─────────────────────────────────────────────
    await fetch(`${baseUrl}?${filter}`, {
      method:  'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body:    JSON.stringify({ status: 'failed' }),
    })

    // ── NON-CRITICAL: analytics ───────────────────────────────────────────────
    if (sub) {
      ;(async () => {
        try {
          const sc = createClient(supabaseUrl, serviceRoleKey)
          await trackEvent(sc, 'payment_failed', sub.user_id, {
            plan: sub.plan, amount: sub.amount_paid, payment_id: paymentId,
            tbank_status: status, subscription_id: sub.id,
          }, `payment_${paymentId}_${status}`)
        } catch(e) { console.error('[notify] analytics error:', e) }
      })()
    }
  }

  return ok()
})
