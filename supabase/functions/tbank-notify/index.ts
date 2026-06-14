/**
 * Edge Function: tbank-notify
 * Эмуляция T-Bank notificationURL — вызывается клиентом после ввода карты.
 * Находит payment_intent по токену, создаёт заказ при успехе.
 *
 * POST /functions/v1/tbank-notify
 * Body: { payment_token, status: 'succeeded' | 'cancelled' | 'failed' }
 * Response: { ok: true, order_status: 'paid' | 'cancelled' }
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

  let body: { payment_token?: string; status?: string }
  try { body = await req.json() } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400) }

  const { payment_token, status } = body

  if (!payment_token || !status)
    return jsonResponse({ error: 'payment_token and status are required' }, 400)

  if (!['succeeded', 'cancelled', 'failed'].includes(status))
    return jsonResponse({ error: 'status must be succeeded, cancelled or failed' }, 400)

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: intent, error: intentError } = await serviceClient
    .from('payment_intents')
    .select('*')
    .eq('payment_token', payment_token)
    .single()

  if (intentError || !intent) return jsonResponse({ error: 'Payment intent not found' }, 404)

  if (intent.user_id !== user.id) return jsonResponse({ error: 'Forbidden' }, 403)

  if (status !== 'succeeded') {
    await serviceClient.from('payment_intents').delete().eq('id', intent.id)
    return jsonResponse({ ok: true, order_status: 'cancelled' })
  }

  // Create the real order from intent data
  const { data: order, error: orderError } = await serviceClient
    .from('orders')
    .insert({
      user_id: intent.user_id,
      store_id: intent.store_id,
      total_amount: intent.total_amount,
      status: 'paid',
      payment_method: intent.payment_method,
      subscription_discount: intent.subscription_discount,
      applied_user_subscription_id: intent.applied_user_subscription_id,
      is_delivery: intent.is_delivery,
      delivery_fee: intent.delivery_fee,
      delivery_address: intent.delivery_address,
    })
    .select('id').single()

  if (orderError || !order) return jsonResponse({ error: 'Failed to create order' }, 500)

  const items = intent.items as { menu_item_id: string; quantity: number; price_at_time: number }[]
  const { error: itemsError } = await serviceClient.from('order_items').insert(
    items.map(i => ({ order_id: order.id, menu_item_id: i.menu_item_id, quantity: i.quantity, price_at_time: i.price_at_time }))
  )
  if (itemsError) {
    await serviceClient.from('orders').delete().eq('id', order.id)
    return jsonResponse({ error: 'Failed to create order items' }, 500)
  }

  await serviceClient.from('payments').insert({
    order_id: order.id, amount: intent.total_amount,
    status: 'succeeded', provider_transaction_id: payment_token,
  })

  if (intent.applied_user_subscription_id && Number(intent.subscription_discount) > 0) {
    await serviceClient.from('subscription_redemptions').insert({
      user_subscription_id: intent.applied_user_subscription_id,
      order_id: order.id,
      amount_discounted: intent.subscription_discount,
    })
  }

  await serviceClient.from('payment_intents').delete().eq('id', intent.id)

  return jsonResponse({ ok: true, order_status: 'paid', order_id: order.id })
})
