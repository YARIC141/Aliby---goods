/**
 * Edge Function: redeem-subscription
 * Применяет абонемент к заказу: списывает одно использование и
 * создаёт запись в subscription_redemptions.
 * Атомарность гарантируется PostgreSQL-функцией redeem_subscription().
 *
 * Доступ: авторизованный пользователь
 * POST /functions/v1/redeem-subscription
 * Body: {
 *   "user_subscription_id": "<uuid>",
 *   "order_id":             "<uuid>",
 *   "amount_discounted":    450.00
 * }
 * Response: { "redemption_id": "<uuid>", "remaining_uses": 3 }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)

  // Клиент с JWT пользователя — для проверки владения заказом через RLS
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  let body: { user_subscription_id?: string; order_id?: string; amount_discounted?: number }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { user_subscription_id, order_id, amount_discounted } = body

  if (!user_subscription_id || !order_id || amount_discounted === undefined) {
    return jsonResponse(
      { error: 'user_subscription_id, order_id and amount_discounted are required' },
      400,
    )
  }

  if (typeof amount_discounted !== 'number' || amount_discounted < 0) {
    return jsonResponse({ error: 'amount_discounted must be a non-negative number' }, 400)
  }

  // Проверяем, что заказ существует и принадлежит этому пользователю (RLS)
  const { data: order, error: orderError } = await userClient
    .from('orders')
    .select('id, user_id, status')
    .eq('id', order_id)
    .eq('user_id', user.id)
    .single()

  if (orderError || !order) {
    return jsonResponse({ error: 'Заказ не найден' }, 404)
  }

  if (order.status !== 'pending') {
    return jsonResponse({ error: 'Заказ не находится в статусе pending' }, 409)
  }

  // Проверяем, что абонемент ещё не применён к этому заказу (дубликат)
  const { data: existingRedemption } = await userClient
    .from('subscription_redemptions')
    .select('id')
    .eq('user_subscription_id', user_subscription_id)
    .eq('order_id', order_id)
    .maybeSingle()

  if (existingRedemption) {
    return jsonResponse({ error: 'Абонемент уже применён к этому заказу' }, 409)
  }

  // Клиент с сервисным ключом — для атомарной операции через RPC
  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Вызываем атомарную PostgreSQL-функцию (блокировка строки + транзакция)
  const { data: rpcResult, error: rpcError } = await serviceClient.rpc('redeem_subscription', {
    p_user_subscription_id: user_subscription_id,
    p_order_id: order_id,
    p_amount_discounted: amount_discounted,
  })

  if (rpcError) {
    return jsonResponse({ error: rpcError.message ?? 'Ошибка списания абонемента' }, 409)
  }

  const [{ redemption_id, remaining_uses }] = rpcResult as {
    redemption_id: string
    remaining_uses: number
  }[]

  // Обновляем заказ: связываем с абонементом и помечаем как оплаченный
  const { error: updateError } = await serviceClient
    .from('orders')
    .update({
      applied_user_subscription_id: user_subscription_id,
      subscription_discount: amount_discounted,
      status: 'paid',
      payment_method: 'subscription',
    })
    .eq('id', order_id)

  if (updateError) {
    // Критическая ошибка: списание прошло, но заказ не обновился.
    // Логируем для ручного разбора (в реальном продакшне — алерт).
    console.error('CRITICAL: redemption created but order update failed', {
      redemption_id,
      order_id,
      error: updateError.message,
    })
    return jsonResponse({
      error: 'Списание выполнено, но статус заказа не обновился. Обратитесь в поддержку.',
    }, 500)
  }

  return jsonResponse({ redemption_id, remaining_uses })
})
