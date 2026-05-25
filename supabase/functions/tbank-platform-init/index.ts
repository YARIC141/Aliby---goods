/**
 * Edge Function: tbank-platform-init
 * Creates a pending platform subscription and returns T-Bank PaymentURL for redirect.
 *
 * POST /functions/v1/tbank-platform-init
 * Auth: Bearer <access_token>
 * Body: { plan: "monthly" | "yearly" }
 * Response: { payment_url, payment_id, subscription_id }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'

const TBANK_INIT_URL = 'https://securepay.tinkoff.ru/v2/Init'
const NOTIFY_URL     = 'https://alliby.ru/functions/v1/tbank-platform-notify'
const SUCCESS_URL    = 'https://admin.alliby.ru/?tpay=success'
const FAIL_URL       = 'https://admin.alliby.ru/?tpay=fail'

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

  let body: { plan?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { plan } = body
  if (!plan || !['monthly', 'yearly'].includes(plan)) {
    return jsonResponse({ error: 'plan must be monthly or yearly' }, 400)
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!
  const terminalKey    = Deno.env.get('TBANK_TERMINAL_KEY')!
  const password       = Deno.env.get('TBANK_PASSWORD')!

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)

  // Verify JWT and get user
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  // Check admin role
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403)

  const amountKopecks = plan === 'yearly' ? 1000000 : 100000
  const amountRubles  = plan === 'yearly' ? 10000 : 1000
  const description   = plan === 'yearly'
    ? 'Годовая подписка Aliby (365 дней)'
    : 'Месячная подписка Aliby (30 дней)'

  // Determine dates — extend from current active subscription if renewing
  const now = new Date()
  const { data: activeSubs } = await serviceClient
    .from('platform_subscriptions')
    .select('end_date')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .gte('end_date', now.toISOString().split('T')[0])
    .order('end_date', { ascending: false })
    .limit(1)

  let startFrom = now
  if (activeSubs?.length) {
    const activeEnd = new Date(activeSubs[0].end_date)
    if (activeEnd > now) startFrom = activeEnd
  }

  const endDate = new Date(startFrom)
  endDate.setDate(endDate.getDate() + (plan === 'yearly' ? 365 : 30))
  const startDateStr = startFrom.toISOString().split('T')[0]
  const endDateStr   = endDate.toISOString().split('T')[0]

  // Cancel any stale pending subscriptions from previous failed attempts
  await serviceClient
    .from('platform_subscriptions')
    .update({ status: 'failed' })
    .eq('user_id', user.id)
    .eq('status', 'pending')

  // Create pending subscription record
  const orderId = `ps_${user.id.slice(0, 8)}_${Date.now()}`
  const { data: sub, error: subError } = await serviceClient
    .from('platform_subscriptions')
    .insert({
      user_id:     user.id,
      plan,
      status:      'pending',
      start_date:  startDateStr,
      end_date:    endDateStr,
      amount_paid: amountRubles,
    })
    .select()
    .single()

  if (subError || !sub) {
    return jsonResponse({ error: 'Failed to create subscription: ' + subError?.message }, 500)
  }

  // Build T-Bank Init request
  // Token рассчитывается только из скалярных полей — Receipt в токен НЕ входит
  const scalarParams: Record<string, string | number> = {
    TerminalKey:     terminalKey,
    Amount:          amountKopecks,
    OrderId:         orderId,
    Description:     description,
    NotificationURL: NOTIFY_URL,
    SuccessURL:      SUCCESS_URL,
    FailURL:         FAIL_URL,
  }

  const receipt = {
    Email:    user.email,
    Taxation: 'usn_income',
    Items: [
      {
        Name:          description,
        Price:         amountKopecks,
        Quantity:      1,
        Amount:        amountKopecks,
        Tax:           'none',
        PaymentMethod: 'full_prepayment',
        PaymentObject: 'service',
      },
    ],
  }

  const initPayload = {
    ...scalarParams,
    Token:   await calcToken(scalarParams, password),
    Receipt: receipt,
  }

  const tResp = await fetch(TBANK_INIT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(initPayload),
  })

  if (!tResp.ok) {
    await serviceClient.from('platform_subscriptions').delete().eq('id', sub.id)
    return jsonResponse({ error: 'T-Bank API error: ' + tResp.status }, 502)
  }

  const tData = await tResp.json()

  if (!tData.Success || !tData.PaymentURL) {
    await serviceClient.from('platform_subscriptions').delete().eq('id', sub.id)
    return jsonResponse({ error: tData.Message || 'T-Bank payment init failed' }, 400)
  }

  // Store T-Bank PaymentId for webhook matching
  await serviceClient
    .from('platform_subscriptions')
    .update({ tbank_payment_id: String(tData.PaymentId) })
    .eq('id', sub.id)

  return jsonResponse({
    payment_url:     tData.PaymentURL,
    payment_id:      tData.PaymentId,
    subscription_id: sub.id,
  })
})
