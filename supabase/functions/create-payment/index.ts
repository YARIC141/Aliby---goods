import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'

const YOOKASSA_API = 'https://api.yookassa.ru/v3/payments'

interface Body {
  type: 'order' | 'subscription'
  order_id?: string
  subscription_id?: string
  return_url: string
}

Deno.serve(async (req: Request) => {
  const corsResult = handleCors(req)
  if (corsResult) return corsResult

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const shopId      = Deno.env.get('YOOKASSA_SHOP_ID')!
  const secretKey   = Deno.env.get('YOOKASSA_SECRET_KEY')!

  // Проверяем JWT пользователя
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  let body: Body
  try { body = await req.json() } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }
  const { type, order_id, subscription_id, return_url } = body
  if (!return_url) return jsonResponse({ error: 'return_url required' }, 400)

  const db = createClient(supabaseUrl, serviceKey)

  let amount: number
  let description: string
  let paymentTarget: { order_id?: string; user_subscription_id?: string }
  let pendingSubId: string | undefined

  // ── Заказ ─────────────────────────────────────────────────
  if (type === 'order') {
    if (!order_id) return jsonResponse({ error: 'order_id required' }, 400)

    const { data: order, error } = await db
      .from('orders')
      .select('id, total_amount, status, user_id')
      .eq('id', order_id)
      .single()

    if (error || !order) return jsonResponse({ error: 'Order not found' }, 404)
    if (order.user_id !== user.id) return jsonResponse({ error: 'Forbidden' }, 403)
    if (order.status !== 'pending') return jsonResponse({ error: 'Order is not pending' }, 409)

    amount = Number(order.total_amount)
    description = `Оплата заказа #${order_id.slice(0, 8)}`
    paymentTarget = { order_id }

  // ── Абонемент ──────────────────────────────────────────────
  } else if (type === 'subscription') {
    if (!subscription_id) return jsonResponse({ error: 'subscription_id required' }, 400)

    const { data: sub, error } = await db
      .from('subscriptions')
      .select('id, name, price, duration_days, total_uses')
      .eq('id', subscription_id)
      .single()

    if (error || !sub) return jsonResponse({ error: 'Subscription not found' }, 404)

    const endDate = new Date()
    endDate.setDate(endDate.getDate() + sub.duration_days)

    const { data: userSub, error: subErr } = await db
      .from('user_subscriptions')
      .insert({
        user_id: user.id,
        subscription_id,
        end_date: endDate.toISOString(),
        remaining_uses: sub.total_uses > 0 ? sub.total_uses : null,
        status: 'pending',
      })
      .select('id')
      .single()

    if (subErr || !userSub) return jsonResponse({ error: 'Failed to create subscription' }, 500)

    pendingSubId = userSub.id
    amount = Number(sub.price)
    description = `Покупка абонемента "${sub.name}"`
    paymentTarget = { user_subscription_id: userSub.id }

  } else {
    return jsonResponse({ error: 'type must be "order" or "subscription"' }, 400)
  }

  // ── Запись в payments ──────────────────────────────────────
  const { data: payment, error: payErr } = await db
    .from('payments')
    .insert({ ...paymentTarget, amount, status: 'pending' })
    .select('id')
    .single()

  if (payErr || !payment) return jsonResponse({ error: 'Failed to create payment record' }, 500)

  // ── Запрос в ЮKassa ────────────────────────────────────────
  const idempotenceKey = crypto.randomUUID()
  const credentials    = btoa(`${shopId}:${secretKey}`)

  const ykRes = await fetch(YOOKASSA_API, {
    method: 'POST',
    headers: {
      Authorization:    `Basic ${credentials}`,
      'Idempotence-Key': idempotenceKey,
      'Content-Type':   'application/json',
    },
    body: JSON.stringify({
      amount:       { value: amount.toFixed(2), currency: 'RUB' },
      confirmation: { type: 'redirect', return_url },
      capture:      true,
      description,
      metadata: {
        payment_record_id: payment.id,
        user_id: user.id,
        ...paymentTarget,
      },
    }),
  })

  if (!ykRes.ok) {
    const err = await ykRes.json().catch(() => ({}))
    // Откатываем pending-записи
    if (pendingSubId) await db.from('user_subscriptions').delete().eq('id', pendingSubId)
    await db.from('payments').delete().eq('id', payment.id)
    return jsonResponse({ error: 'Payment gateway error', details: err }, 502)
  }

  const ykPayment = await ykRes.json()

  await db
    .from('payments')
    .update({ provider_transaction_id: ykPayment.id })
    .eq('id', payment.id)

  return jsonResponse({
    payment_id:         payment.id,
    provider_payment_id: ykPayment.id,
    status:             ykPayment.status,
    confirmation_url:   ykPayment.confirmation?.confirmation_url ?? null,
    amount,
  })
})
