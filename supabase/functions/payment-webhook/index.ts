import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  const corsResult = handleCors(req)
  if (corsResult) return corsResult

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(supabaseUrl, serviceKey)

  let notification: Record<string, unknown>
  try { notification = await req.json() } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  // ЮKassa всегда шлёт { type: "notification", event: "...", object: {...} }
  if (notification.type !== 'notification') return jsonResponse({ ok: true })

  const event = notification.event as string
  const obj   = notification.object as Record<string, unknown>
  const providerId = obj.id as string

  if (!providerId) return jsonResponse({ error: 'Missing payment id' }, 400)

  // Находим запись в payments по provider_transaction_id
  const { data: payment, error: payErr } = await db
    .from('payments')
    .select('id, order_id, user_subscription_id')
    .eq('provider_transaction_id', providerId)
    .single()

  if (payErr || !payment) return jsonResponse({ error: 'Payment record not found' }, 404)

  // ── payment.succeeded ──────────────────────────────────────
  if (event === 'payment.succeeded') {
    await db.from('payments').update({ status: 'succeeded' }).eq('id', payment.id)

    if (payment.order_id) {
      await db
        .from('orders')
        .update({ status: 'paid', payment_method: 'card' })
        .eq('id', payment.order_id)
    }

    if (payment.user_subscription_id) {
      await db
        .from('user_subscriptions')
        .update({ status: 'active' })
        .eq('id', payment.user_subscription_id)
    }

  // ── payment.canceled ───────────────────────────────────────
  } else if (event === 'payment.canceled') {
    await db.from('payments').update({ status: 'cancelled' }).eq('id', payment.id)

    if (payment.user_subscription_id) {
      await db
        .from('user_subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', payment.user_subscription_id)
    }
    // Заказ оставляем в pending — пользователь может попробовать снова
  }

  return jsonResponse({ ok: true })
})
