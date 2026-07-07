/**
 * Edge Function: tbank-platform-charge
 * Called daily by pg_cron to process recurring subscription renewals.
 * Auth: Bearer CRON_SECRET (set in Supabase secrets).
 *
 * POST /functions/v1/tbank-platform-charge
 * Body: {} (empty)
 *
 * Logic per subscription due for renewal:
 *   1. Call T-Bank Init → get PaymentId
 *   2. Call T-Bank Charge with PaymentId + RebillId
 *   3. Success → extend end_date by 30 days, reset retry_count
 *   4. Failure → retry_count++; if ≥ 3 → status = 'expired'; else status = 'grace'
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { trackEvent } from '../_shared/analytics.ts'

const TBANK_INIT_URL   = 'https://securepay.tinkoff.ru/v2/Init'
const TBANK_CHARGE_URL = 'https://securepay.tinkoff.ru/v2/Charge'
const MAX_RETRIES = 3

async function calcToken(params: Record<string, string | number>, password: string): Promise<string> {
  const all    = { ...params, Password: password }
  const sorted = Object.keys(all).sort()
  const str    = sorted.map(k => String(all[k])).join('')
  const hash   = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 })

  // Auth via CRON_SECRET
  const cronSecret = Deno.env.get('CRON_SECRET') || ''
  const auth = req.headers.get('Authorization') || ''
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const terminalKey    = Deno.env.get('TBANK_TERMINAL_KEY')!
  const password       = Deno.env.get('TBANK_PASSWORD')!

  const db = createClient(supabaseUrl, serviceRoleKey)

  const today = new Date().toISOString().split('T')[0]

  // Find subscriptions due for renewal (end_date <= today, has rebill_id, not yet expired)
  const { data: subs, error } = await db
    .from('platform_subscriptions')
    .select('id, user_id, store_id, plan, status, end_date, rebill_id, monthly_amount_kopecks, retry_count, is_trial, auto_renew')
    .lte('end_date', today)
    .in('status', ['active', 'grace'])
    .eq('auto_renew', true)
    .not('rebill_id', 'is', null)

  if (error) {
    console.error('[charge] DB error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const results: Array<{ id: string; result: string }> = []

  for (const sub of (subs ?? [])) {
    if (sub.retry_count >= MAX_RETRIES) {
      await db.from('platform_subscriptions').update({ status: 'expired' }).eq('id', sub.id)
      results.push({ id: sub.id, result: 'expired_max_retries' })
      continue
    }

    const orderId = `renewal_${sub.id.slice(0, 8)}_${Date.now()}`
    const amount  = sub.monthly_amount_kopecks ?? 100000

    try {
      // Step 1: Init (no user interaction — no SuccessURL/FailURL needed)
      const initScalar: Record<string, string | number> = {
        TerminalKey: terminalKey,
        Amount:      amount,
        OrderId:     orderId,
        Description: `Продление подписки Aliby`,
        CustomerKey: sub.user_id,
      }
      const initResp = await fetch(TBANK_INIT_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...initScalar, Token: await calcToken(initScalar, password) }),
      })
      const initData = await initResp.json()

      if (!initData.Success || !initData.PaymentId) {
        throw new Error('Init failed: ' + (initData.Message || 'unknown'))
      }

      // Step 2: Charge via RebillId
      const chargeScalar: Record<string, string | number> = {
        TerminalKey: terminalKey,
        PaymentId:   initData.PaymentId,
        RebillId:    sub.rebill_id,
      }
      const chargeResp = await fetch(TBANK_CHARGE_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...chargeScalar, Token: await calcToken(chargeScalar, password) }),
      })
      const chargeData = await chargeResp.json()

      if (chargeData.Success && chargeData.Status === 'CONFIRMED') {
        const planDays: Record<string, number> = { 'monthly': 30, '3months': 90, '6months': 180, 'yearly': 365 }
        const renewDays = planDays[sub.plan || 'monthly'] ?? 30
        const prevEnd = new Date(sub.end_date)
        prevEnd.setDate(prevEnd.getDate() + renewDays)
        const newEnd = prevEnd.toISOString().split('T')[0]

        await db.from('platform_subscriptions').update({
          status:      'active',
          end_date:    newEnd,
          retry_count: 0,
          grace_until: null,
          is_trial:    false,
          amount_paid: Math.round(amount / 100),
        }).eq('id', sub.id)

        await trackEvent(db, 'renewal_success', sub.user_id, {
          subscription_id: sub.id, amount: Math.round(amount / 100),
          new_end_date: newEnd, order_id: orderId,
        }, `renewal_${orderId}`)

        results.push({ id: sub.id, result: 'renewed' })
      } else {
        throw new Error('Charge failed: ' + (chargeData.Message || chargeData.Status || 'unknown'))
      }
    } catch (err) {
      console.error(`[charge] sub ${sub.id} failed:`, err)
      const newRetry = (sub.retry_count ?? 0) + 1

      if (newRetry >= MAX_RETRIES) {
        await db.from('platform_subscriptions').update({
          status:      'expired',
          retry_count: newRetry,
          grace_until: null,
        }).eq('id', sub.id)
        results.push({ id: sub.id, result: 'expired_after_retries' })
      } else {
        // Remain in grace, retry tomorrow
        const graceUntil = new Date()
        graceUntil.setDate(graceUntil.getDate() + (MAX_RETRIES - newRetry))
        await db.from('platform_subscriptions').update({
          status:      'grace',
          retry_count: newRetry,
          grace_until: graceUntil.toISOString().split('T')[0],
        }).eq('id', sub.id)
        results.push({ id: sub.id, result: `grace_retry_${newRetry}` })
      }

      await trackEvent(db, 'renewal_failed', sub.user_id, {
        subscription_id: sub.id, retry_count: (sub.retry_count ?? 0) + 1,
        error: String(err),
      }, `renewal_fail_${sub.id}_${today}`)
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })
})
