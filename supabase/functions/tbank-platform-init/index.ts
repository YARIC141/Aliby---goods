/**
 * Edge Function: tbank-platform-init
 * Initiates a platform subscription via T-Bank.
 *
 * POST /functions/v1/tbank-platform-init
 * Auth: Bearer <access_token>
 * Body: { type: 'trial' | 'add_store' }
 *   trial     — 1 ₽ card binding (first month free). Returns { payment_url }.
 *   add_store — 500 ₽ immediate Charge via RebillId. Returns { success, extra_stores }.
 * Response: see above
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { trackEvent } from '../_shared/analytics.ts'

const TBANK_INIT_URL   = 'https://securepay.tinkoff.ru/v2/Init'
const NOTIFY_URL       = 'https://alliby.ru/functions/v1/tbank-platform-notify'
const SUCCESS_URL      = 'https://admin.alliby.ru/?tpay=success'
const FAIL_URL         = 'https://admin.alliby.ru/?tpay=fail'

const TRIAL_AMOUNT_KOPECKS    = 100     // 1 ₽ — refunded after card binding
const ADD_STORE_MONTHLY_KOPECKS = 50000   // 500 ₽/мес
const ADD_STORE_YEARLY_KOPECKS  = 500000  // 5 000 ₽/год

async function calcToken(params: Record<string, string | number>, password: string): Promise<string> {
  const all    = { ...params, Password: password }
  const sorted = Object.keys(all).sort()
  const str    = sorted.map(k => String(all[k])).join('')
  const hash   = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401)

  let body: { type?: string; store_id?: string; consent_given?: boolean; plan?: string }
  try { body = await req.json() } catch { return jsonResponse({ error: 'Invalid JSON' }, 400) }

  const { type, store_id: bodyStoreId, consent_given, plan: addStorePlan } = body
  if (!type || !['trial', 'monthly', 'add_store'].includes(type)) {
    return jsonResponse({ error: 'type must be trial, monthly or add_store' }, 400)
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!
  const terminalKey    = Deno.env.get('TBANK_TERMINAL_KEY')!
  const password       = Deno.env.get('TBANK_PASSWORD')!

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)
  const userClient    = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  const { data: profile } = await serviceClient
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403)

  // ── TRIAL: 1 ₽ card binding ──────────────────────────────────────────────
  if (type === 'trial') {
    // Must not have an active/grace subscription already
    const { data: existing } = await serviceClient
      .from('platform_subscriptions')
      .select('id, status, end_date')
      .eq('user_id', user.id)
      .in('status', ['active', 'grace'])
      .gte('end_date', new Date().toISOString().split('T')[0])
      .limit(1)
    if (existing?.length) {
      return jsonResponse({ error: 'Already has active subscription' }, 409)
    }

    // Mark stale pending subs as failed
    await serviceClient
      .from('platform_subscriptions')
      .update({ status: 'failed' })
      .eq('user_id', user.id).eq('status', 'pending')

    const now     = new Date()
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() + 30)
    const orderId = `trial_${user.id.slice(0, 8)}_${Date.now()}`

    const { data: sub, error: subError } = await serviceClient
      .from('platform_subscriptions')
      .insert({
        user_id:                user.id,
        plan:                   'monthly',
        status:                 'pending',
        start_date:             now.toISOString().split('T')[0],
        end_date:               endDate.toISOString().split('T')[0],
        amount_paid:            0,
        is_trial:               true,
        monthly_amount_kopecks: 100000,
        extra_stores:           0,
      })
      .select().single()

    if (subError || !sub) {
      return jsonResponse({ error: 'DB error: ' + subError?.message }, 500)
    }

    const scalarParams: Record<string, string | number> = {
      TerminalKey:     terminalKey,
      Amount:          TRIAL_AMOUNT_KOPECKS,
      OrderId:         orderId,
      Description:     'Привязка карты — Aliby (первый месяц бесплатно)',
      Recurrent:       'Y',
      CustomerKey:     user.id,
      NotificationURL: NOTIFY_URL,
      SuccessURL:      SUCCESS_URL,
      FailURL:         FAIL_URL,
    }

    const receipt = {
      Email:    user.email,
      Taxation: 'usn_income',
      Items: [{
        Name: 'Привязка карты Aliby (возврат после активации)',
        Price: TRIAL_AMOUNT_KOPECKS, Quantity: 1, Amount: TRIAL_AMOUNT_KOPECKS,
        Tax: 'none', PaymentMethod: 'full_prepayment', PaymentObject: 'service',
      }],
    }

    const initPayload = {
      ...scalarParams,
      Token:   await calcToken(scalarParams, password),
      Receipt: receipt,
    }

    const tResp = await fetch(TBANK_INIT_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initPayload),
    })
    const tData = await tResp.json()

    if (!tData.Success || !tData.PaymentURL) {
      await serviceClient.from('platform_subscriptions').delete().eq('id', sub.id)
      return jsonResponse({ error: tData.Message || 'T-Bank init failed' }, 400)
    }

    await serviceClient
      .from('platform_subscriptions')
      .update({ tbank_payment_id: String(tData.PaymentId) })
      .eq('id', sub.id)

    // Log consent if given (§3.4 of the seller agreement)
    if (consent_given) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip') || 'unknown'
      const ua = req.headers.get('user-agent') || ''
      await serviceClient.from('subscription_consents').insert({
        user_id:      user.id,
        ip_address:   ip,
        user_agent:   ua,
        consent_text: 'Пользователь подтвердил согласие на автоматические рекуррентные списания в рамках Лицензионного договора-оферты (раздел 8). Согласие зафиксировано при активации пробного периода.',
      })
    }

    await trackEvent(serviceClient, 'trial_started', user.id, { subscription_id: sub.id, order_id: orderId }, `trial_${sub.id}`)

    return jsonResponse({ payment_url: tData.PaymentURL, payment_id: tData.PaymentId, subscription_id: sub.id })
  }

  // ── MONTHLY: full 1 000 ₽ payment (trial already used) ──────────────────────
  if (type === 'monthly') {
    const { data: existing } = await serviceClient
      .from('platform_subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .in('status', ['active', 'grace'])
      .gte('end_date', new Date().toISOString().split('T')[0])
      .limit(1)
    if (existing?.length) {
      return jsonResponse({ error: 'Already has active subscription' }, 409)
    }

    await serviceClient
      .from('platform_subscriptions')
      .update({ status: 'failed' })
      .eq('user_id', user.id).eq('status', 'pending')

    const now     = new Date()
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() + 30)
    const orderId = `sub_${user.id.slice(0, 8)}_${Date.now()}`
    const amount  = 100000 // 1 000 ₽

    const { data: sub, error: subError } = await serviceClient
      .from('platform_subscriptions')
      .insert({
        user_id:                user.id,
        plan:                   'monthly',
        status:                 'pending',
        start_date:             now.toISOString().split('T')[0],
        end_date:               endDate.toISOString().split('T')[0],
        amount_paid:            1000,
        is_trial:               false,
        monthly_amount_kopecks: 100000,
        extra_stores:           0,
      })
      .select().single()

    if (subError || !sub) {
      return jsonResponse({ error: 'DB error: ' + subError?.message }, 500)
    }

    const scalarParams: Record<string, string | number> = {
      TerminalKey:     terminalKey,
      Amount:          amount,
      OrderId:         orderId,
      Description:     'Подписка Aliby — 1 месяц',
      Recurrent:       'Y',
      CustomerKey:     user.id,
      NotificationURL: NOTIFY_URL,
      SuccessURL:      SUCCESS_URL,
      FailURL:         FAIL_URL,
    }

    const receipt = {
      Email:    user.email,
      Taxation: 'usn_income',
      Items: [{
        Name: 'Подписка Aliby (1 месяц)',
        Price: amount, Quantity: 1, Amount: amount,
        Tax: 'none', PaymentMethod: 'full_prepayment', PaymentObject: 'service',
      }],
    }

    const tResp = await fetch(TBANK_INIT_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...scalarParams, Token: await calcToken(scalarParams, password), Receipt: receipt }),
    })
    const tData = await tResp.json()

    if (!tData.Success || !tData.PaymentURL) {
      await serviceClient.from('platform_subscriptions').delete().eq('id', sub.id)
      return jsonResponse({ error: tData.Message || 'T-Bank init failed' }, 400)
    }

    await serviceClient
      .from('platform_subscriptions')
      .update({ tbank_payment_id: String(tData.PaymentId) })
      .eq('id', sub.id)

    await trackEvent(serviceClient, 'subscription_monthly_started', user.id, { subscription_id: sub.id, order_id: orderId }, `sub_${sub.id}`)

    return jsonResponse({ payment_url: tData.PaymentURL, payment_id: tData.PaymentId, subscription_id: sub.id })
  }

  // ── ADD STORE: T-Bank Init → redirect (same flow as main subscription) ─────
  if (type === 'add_store') {
    // Must have active main (platform) subscription
    const { data: mainSub } = await serviceClient
      .from('platform_subscriptions')
      .select('id')
      .eq('user_id', user.id)
      .eq('plan_type', 'platform')
      .in('status', ['active', 'grace'])
      .gte('end_date', new Date().toISOString().split('T')[0])
      .limit(1)
      .single()

    if (!mainSub) return jsonResponse({ error: 'No active platform subscription' }, 404)

    const isYearly  = addStorePlan === 'yearly'
    const amount    = isYearly ? ADD_STORE_YEARLY_KOPECKS : ADD_STORE_MONTHLY_KOPECKS
    const amountRub = isYearly ? 5000 : 500
    const days      = isYearly ? 365 : 30
    const descLabel = isYearly
      ? 'Доп. заведение Aliby (1 год)'
      : 'Доп. заведение Aliby (1 мес)'

    // Cancel stale pending store-slot subscriptions
    await serviceClient
      .from('platform_subscriptions')
      .update({ status: 'failed' })
      .eq('user_id', user.id)
      .eq('plan_type', 'store')
      .eq('status', 'pending')

    // Create pending per-store subscription record
    const now   = new Date()
    const endDt = new Date(now); endDt.setDate(endDt.getDate() + days)
    const orderId = `store_${user.id.slice(0, 8)}_${Date.now()}`

    const { data: storeSub, error: storeSubErr } = await serviceClient
      .from('platform_subscriptions')
      .insert({
        user_id:                user.id,
        store_id:               bodyStoreId || null,
        plan:                   isYearly ? 'yearly' : 'monthly',
        plan_type:              'store',
        status:                 'pending',
        start_date:             now.toISOString().split('T')[0],
        end_date:               endDt.toISOString().split('T')[0],
        amount_paid:            amountRub,
        monthly_amount_kopecks: amount,
        auto_renew:             true,
      })
      .select().single()

    if (storeSubErr || !storeSub) {
      return jsonResponse({ error: 'DB error: ' + storeSubErr?.message }, 500)
    }

    // T-Bank Init → return PaymentURL for redirect
    const scalarParams: Record<string, string | number> = {
      TerminalKey:     terminalKey,
      Amount:          amount,
      OrderId:         orderId,
      Description:     descLabel,
      Recurrent:       'Y',
      CustomerKey:     user.id,
      NotificationURL: NOTIFY_URL,
      SuccessURL:      SUCCESS_URL,
      FailURL:         FAIL_URL,
    }

    const receipt = {
      Email:    user.email,
      Taxation: 'usn_income',
      Items: [{
        Name:          descLabel,
        Price:         amount,
        Quantity:      1,
        Amount:        amount,
        Tax:           'none',
        PaymentMethod: 'full_prepayment',
        PaymentObject: 'service',
      }],
    }

    const tResp = await fetch(TBANK_INIT_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...scalarParams, Token: await calcToken(scalarParams, password), Receipt: receipt }),
    })
    const tData = await tResp.json()

    if (!tData.Success || !tData.PaymentURL) {
      await serviceClient.from('platform_subscriptions').delete().eq('id', storeSub.id)
      return jsonResponse({ error: tData.Message || 'T-Bank init failed' }, 400)
    }

    await serviceClient
      .from('platform_subscriptions')
      .update({ tbank_payment_id: String(tData.PaymentId) })
      .eq('id', storeSub.id)

    await trackEvent(serviceClient, 'store_sub_started', user.id, {
      subscription_id: storeSub.id, plan: isYearly ? 'yearly' : 'monthly', amount: amountRub,
    }, `storesub_${storeSub.id}`)

    return jsonResponse({ payment_url: tData.PaymentURL, payment_id: tData.PaymentId, subscription_id: storeSub.id })
  }

  return jsonResponse({ error: 'Unknown type' }, 400)
})
