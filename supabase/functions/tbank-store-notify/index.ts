/**
 * Edge Function: tbank-store-notify
 * Реальный webhook от T-Bank для заказов магазинов.
 * T-Bank вызывает этот URL после подтверждения оплаты.
 * Создаёт заказ из payment_intent и удаляет его.
 *
 * POST /functions/v1/tbank-store-notify
 * Body (T-Bank JSON): { TerminalKey, OrderId, Status, PaymentId, Amount, Token, ... }
 * Response: OK  (T-Bank ожидает plain text "OK")
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0"
import { decryptPaymentKey } from "../_shared/payment-crypto.ts"

const OK = new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } })

async function calcToken(params: Record<string, unknown>, password: string): Promise<string> {
  const all    = { ...params, Password: password }
  const sorted = Object.keys(all).sort()
  const str    = sorted.filter(k => k !== "Token" && k !== "DATA" && k !== "Receipt" && typeof all[k] !== "object")
                       .map(k => String(all[k])).join("")
  const hash   = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("")
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 })
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 })

  let data: Record<string, unknown>
  try { data = await req.json() } catch { return new Response("Bad Request", { status: 400 }) }

  const { OrderId, Status, PaymentId, Token, TerminalKey, Amount } = data as Record<string, unknown>

  if (!OrderId || !Status || !Token) return OK // не блокируем T-Bank повторными попытками

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { data: intent } = await serviceClient
    .from("payment_intents")
    .select("*")
    .eq("id", String(OrderId))
    .maybeSingle()

  if (!intent) return OK // intent уже обработан или не существует

  // Verify T-Bank token using store owner's secret key
  const { data: storeData } = await serviceClient
    .from("stores").select("owner_user_id").eq("id", intent.store_id).maybeSingle()

  if (storeData) {
    const { data: ownerProfile } = await serviceClient
      .from("profiles").select("payment_test_mode").eq("id", storeData.owner_user_id).maybeSingle()

    const isRealMode = ownerProfile?.payment_test_mode === false
    const { data: ups } = await serviceClient
      .from("user_payment_settings")
      .select("secret_key, secret_key_test, key_version")
      .eq("user_id", storeData.owner_user_id).maybeSingle()

    const secretEnc = isRealMode ? ups?.secret_key : ups?.secret_key_test
    if (secretEnc) {
      const kv       = ups?.key_version ?? 1
      const password = await decryptPaymentKey(secretEnc, kv).catch(() => null)
      if (password) {
        const expected = await calcToken(data, password)
        if (expected !== String(Token)) {
          return new Response("Forbidden", { status: 403 })
        }
      }
    }
  }

  // Only process confirmed/authorized payments
  const successStatuses = new Set(["CONFIRMED", "AUTHORIZED"])
  if (!successStatuses.has(String(Status))) {
    if (String(Status) === "REJECTED" || String(Status) === "REVERSED") {
      await serviceClient.from("payment_intents").delete().eq("id", String(OrderId))
    }
    return OK
  }

  // Atomically claim the intent so a duplicate/concurrent webhook delivery for the
  // same payment can't create a second order — T-Bank may deliver the same
  // notification more than once (or send both AUTHORIZED and CONFIRMED for the
  // same payment), and a plain "select then later delete" isn't race-safe.
  const { data: claimed } = await serviceClient
    .from("payment_intents")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", String(OrderId))
    .is("claimed_at", null)
    .select("id")
    .maybeSingle()

  if (!claimed) return OK // already claimed by a concurrent/duplicate delivery

  // Create order from intent
  const { data: order, error: orderError } = await serviceClient
    .from("orders")
    .insert({
      user_id: intent.user_id,
      store_id: intent.store_id,
      total_amount: intent.total_amount,
      status: "paid",
      payment_method: intent.payment_method,
      subscription_discount: intent.subscription_discount,
      applied_user_subscription_id: intent.applied_user_subscription_id,
      is_delivery: intent.is_delivery,
      delivery_fee: intent.delivery_fee,
      delivery_address: intent.delivery_address,
      delivery_lat: intent.delivery_lat,
      delivery_lng: intent.delivery_lng,
    })
    .select("id").single()

  if (orderError || !order) {
    await serviceClient.from("payment_intents").update({ claimed_at: null }).eq("id", String(OrderId))
    return OK // T-Bank повторит попытку
  }

  const items = intent.items as { menu_item_id: string; quantity: number; price_at_time: number }[]
  const { error: itemsError } = await serviceClient.from("order_items").insert(
    items.map(i => ({ order_id: order.id, menu_item_id: i.menu_item_id, quantity: i.quantity, price_at_time: i.price_at_time }))
  )
  if (itemsError) {
    await serviceClient.from("orders").delete().eq("id", order.id)
    await serviceClient.from("payment_intents").update({ claimed_at: null }).eq("id", String(OrderId))
    return OK // T-Bank повторит попытку
  }

  await serviceClient.from("payments").insert({
    order_id: order.id,
    amount: intent.total_amount,
    status: "succeeded",
    provider_transaction_id: String(PaymentId ?? ""),
  })

  if (intent.applied_user_subscription_id && Number(intent.subscription_discount) > 0) {
    await serviceClient.from("subscription_redemptions").insert({
      user_subscription_id: intent.applied_user_subscription_id,
      order_id: order.id,
      amount_discounted: intent.subscription_discount,
    })
  }

  await serviceClient.from("payment_intents").delete().eq("id", String(OrderId))

  return OK
})
