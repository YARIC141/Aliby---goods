/**
 * Edge Function: tbank-init
 * Эмуляция T-Bank securepay Init.
 * Создаёт заказ (status='pending'), order_items и платёжную запись (status='pending').
 * Возвращает payment_token, который используется при подтверждении/отмене.
 *
 * POST /functions/v1/tbank-init
 * Body: { store_id, items: [{menu_item_id, quantity, price_at_time}], total_amount }
 * Response: { order_id, payment_id, payment_token, amount }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  let body: {
    store_id?: string
    items?: { menu_item_id: string; quantity: number; price_at_time: number }[]
    total_amount?: number
    subscription_discount?: number
    applied_user_subscription_id?: string
    payment_method?: string
  }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { store_id, items, total_amount, subscription_discount, applied_user_subscription_id, payment_method } = body

  if (!store_id || !items?.length || total_amount === undefined) {
    return jsonResponse({ error: 'store_id, items and total_amount are required' }, 400)
  }

  if (typeof total_amount !== 'number' || total_amount < 0) {
    return jsonResponse({ error: 'total_amount must be a non-negative number' }, 400)
  }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Проверяем активную platform_subscription владельца заведения
  const { data: storeOwner } = await serviceClient
    .from('stores')
    .select('owner_user_id')
    .eq('id', store_id)
    .maybeSingle()

  if (storeOwner) {
    const today = new Date().toISOString().split('T')[0]
    const { data: activeSubs } = await serviceClient
      .from('platform_subscriptions')
      .select('id')
      .eq('user_id', storeOwner.owner_user_id)
      .eq('status', 'active')
      .gte('end_date', today)
      .limit(1)

    if (!activeSubs?.length) {
      return jsonResponse({ error: 'Заведение временно приостановило продажи' }, 403)
    }
  }

  // Создаём заказ через userClient — RLS разрешает INSERT для владельца
  const { data: order, error: orderError } = await userClient
    .from('orders')
    .insert({
      user_id: user.id,
      store_id,
      total_amount,
      status: 'pending',
      payment_method: payment_method || 'card',
      subscription_discount: subscription_discount || 0,
      applied_user_subscription_id: applied_user_subscription_id || null,
    })
    .select('id')
    .single()

  if (orderError || !order) {
    return jsonResponse({ error: 'Failed to create order: ' + (orderError?.message ?? 'unknown') }, 500)
  }

  // Создаём позиции заказа через userClient — RLS разрешает INSERT для pending-заказа владельца
  const orderItems = items.map(item => ({
    order_id: order.id,
    menu_item_id: item.menu_item_id,
    quantity: item.quantity,
    price_at_time: item.price_at_time,
  }))

  const { error: itemsError } = await userClient
    .from('order_items')
    .insert(orderItems)

  if (itemsError) {
    await serviceClient.from('orders').delete().eq('id', order.id)
    return jsonResponse({ error: 'Failed to create order items: ' + itemsError.message }, 500)
  }

  // Если сумма к оплате = 0 (полностью покрыта абонементом) — сразу помечаем заказ оплаченным
  if (total_amount === 0) {
    await serviceClient.from('orders').update({ status: 'paid' }).eq('id', order.id)
    if (applied_user_subscription_id && Number(subscription_discount) > 0) {
      await serviceClient
        .from('subscription_redemptions')
        .insert({
          user_subscription_id: applied_user_subscription_id,
          order_id: order.id,
          amount_discounted: subscription_discount,
        })
    }
    return jsonResponse({ order_id: order.id, free: true, amount: 0 })
  }

  // Генерируем токен оплаты (эмуляция T-Bank PaymentId)
  const paymentToken = crypto.randomUUID()

  // Создаём платёжную запись через serviceClient — у пользователя нет INSERT-политики на payments
  const { data: payment, error: paymentError } = await serviceClient
    .from('payments')
    .insert({
      order_id: order.id,
      amount: total_amount,
      status: 'pending',
      provider_transaction_id: paymentToken,
    })
    .select('id')
    .single()

  if (paymentError || !payment) {
    await serviceClient.from('orders').delete().eq('id', order.id)
    return jsonResponse({ error: 'Failed to create payment: ' + (paymentError?.message ?? 'unknown') }, 500)
  }

  return jsonResponse({
    order_id: order.id,
    payment_id: payment.id,
    payment_token: paymentToken,
    amount: total_amount,
  })
})
