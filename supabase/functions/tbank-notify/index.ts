/**
 * Edge Function: tbank-notify
 * Эмуляция T-Bank securepay notificationURL.
 * Обновляет статус платежа и заказа по результату оплаты.
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
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { payment_token, status } = body

  if (!payment_token || !status) {
    return jsonResponse({ error: 'payment_token and status are required' }, 400)
  }

  if (!['succeeded', 'cancelled', 'failed'].includes(status)) {
    return jsonResponse({ error: 'status must be succeeded, cancelled or failed' }, 400)
  }

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Ищем платёж по токену
  const { data: payment, error: paymentError } = await serviceClient
    .from('payments')
    .select('id, order_id, status')
    .eq('provider_transaction_id', payment_token)
    .single()

  if (paymentError || !payment) {
    return jsonResponse({ error: 'Payment not found' }, 404)
  }

  if (payment.status !== 'pending') {
    return jsonResponse({ error: 'Payment already processed' }, 409)
  }

  // Проверяем, что заказ принадлежит этому пользователю
  const { data: order, error: orderError } = await serviceClient
    .from('orders')
    .select('id, user_id')
    .eq('id', payment.order_id)
    .single()

  if (orderError || !order) {
    return jsonResponse({ error: 'Order not found' }, 404)
  }

  if (order.user_id !== user.id) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const orderStatus = status === 'succeeded' ? 'paid' : 'cancelled'

  // Обновляем платёж
  await serviceClient
    .from('payments')
    .update({ status })
    .eq('id', payment.id)

  // Обновляем заказ
  await serviceClient
    .from('orders')
    .update({ status: orderStatus })
    .eq('id', order.id)

  return jsonResponse({ ok: true, order_status: orderStatus })
})
