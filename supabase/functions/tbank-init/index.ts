import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0"
import { handleCors, jsonResponse } from "../_shared/cors.ts"
import { decryptPaymentKey } from "../_shared/payment-crypto.ts"
import { logKeyAccess } from "../_shared/audit.ts"

const TBANK_INIT_URL = "https://securepay.tinkoff.ru/v2/Init"
const NOTIFY_URL     = "https://alliby.ru/functions/v1/tbank-store-notify"
const SUCCESS_BASE   = "https://alliby.ru/?tpay=store_success"
const FAIL_BASE      = "https://alliby.ru/?tpay=store_fail"

async function calcToken(params: Record<string, string | number>, password: string): Promise<string> {
  const all    = { ...params, Password: password }
  const sorted = Object.keys(all).sort()
  const str    = sorted.map(k => String(all[k])).join("")
  const hash   = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("")
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? null

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401)

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401)

  let body: {
    store_id?: string
    items?: { menu_item_id: string; quantity: number; price_at_time: number }[]
    total_amount?: number
    subscription_discount?: number
    applied_user_subscription_id?: string
    payment_method?: string
    is_delivery?: boolean
    delivery_fee?: number
    delivery_address?: string | null
  }
  try { body = await req.json() } catch { return jsonResponse({ error: "Invalid JSON body" }, 400) }

  const {
    store_id, items, total_amount,
    subscription_discount, applied_user_subscription_id, payment_method,
    is_delivery = false, delivery_fee = 0, delivery_address = null,
  } = body

  if (!store_id || !items?.length || total_amount === undefined)
    return jsonResponse({ error: "store_id, items and total_amount are required" }, 400)
  if (typeof total_amount !== "number" || total_amount < 0)
    return jsonResponse({ error: "total_amount must be a non-negative number" }, 400)

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  // Get store owner
  const { data: storeData } = await serviceClient
    .from("stores")
    .select("owner_user_id")
    .eq("id", store_id).maybeSingle()

  if (!storeData) return jsonResponse({ error: "Store not found" }, 404)

  // Check owner's platform subscription
  const today = new Date().toISOString().split("T")[0]
  const { data: activeSubs } = await serviceClient
    .from("platform_subscriptions").select("id")
    .eq("user_id", storeData.owner_user_id).eq("status", "active").gte("end_date", today).limit(1)
  if (!activeSubs?.length) return jsonResponse({ error: "Store is temporarily unavailable" }, 403)

  // Get owner's payment settings from profiles
  const { data: ownerProfile } = await serviceClient
    .from("profiles")
    .select("payment_provider, payment_test_mode")
    .eq("id", storeData.owner_user_id).maybeSingle()

  const isRealMode = ownerProfile?.payment_test_mode === false
  const provider   = ownerProfile?.payment_provider || "none"

  // Free order (paid fully by subscription) — create order directly, no payment needed
  if (total_amount === 0) {
    const { data: order, error: orderError } = await serviceClient
      .from("orders")
      .insert({
        user_id: user.id, store_id, total_amount: 0, status: "paid",
        payment_method: payment_method || "subscription",
        subscription_discount: subscription_discount || 0,
        applied_user_subscription_id: applied_user_subscription_id || null,
        is_delivery, delivery_fee, delivery_address,
      })
      .select("id").single()

    if (orderError || !order)
      return jsonResponse({ error: "Failed to create order: " + (orderError?.message ?? "unknown") }, 500)

    const { error: itemsError } = await serviceClient.from("order_items").insert(
      items.map(item => ({ order_id: order.id, menu_item_id: item.menu_item_id, quantity: item.quantity, price_at_time: item.price_at_time }))
    )
    if (itemsError) {
      await serviceClient.from("orders").delete().eq("id", order.id)
      return jsonResponse({ error: "Failed to create order items: " + itemsError.message }, 500)
    }

    if (applied_user_subscription_id && Number(subscription_discount) > 0) {
      await serviceClient.from("subscription_redemptions").insert({
        user_subscription_id: applied_user_subscription_id, order_id: order.id, amount_discounted: subscription_discount,
      })
    }
    return jsonResponse({ order_id: order.id, free: true, amount: 0 })
  }

  // Create payment intent (cart data held here until payment confirmed)
  const intentBase = {
    user_id: user.id, store_id,
    items: JSON.parse(JSON.stringify(items)),
    total_amount,
    subscription_discount: subscription_discount || 0,
    applied_user_subscription_id: applied_user_subscription_id || null,
    payment_method: payment_method || "card",
    is_delivery, delivery_fee, delivery_address,
    provider,
  }

  // provider = none → emulation (in-app card form)
  if (provider === "none") {
    const paymentToken = crypto.randomUUID()
    const { data: intent, error: intentError } = await serviceClient
      .from("payment_intents")
      .insert({ ...intentBase, payment_token: paymentToken })
      .select("id").single()

    if (intentError || !intent)
      return jsonResponse({ error: "Failed to create payment intent: " + (intentError?.message ?? "unknown") }, 500)

    return jsonResponse({ intent_id: intent.id, payment_token: paymentToken, amount: total_amount })
  }

  if (provider !== "tinkoff") {
    return jsonResponse({ error: "Provider '" + provider + "' not yet supported." }, 400)
  }

  // Get keys from user_payment_settings
  const { data: ups } = await serviceClient
    .from("user_payment_settings")
    .select("terminal_key, secret_key, terminal_key_test, secret_key_test, key_version")
    .eq("user_id", storeData.owner_user_id).maybeSingle()

  const termKeyEnc = isRealMode ? ups?.terminal_key      : ups?.terminal_key_test
  const secretEnc  = isRealMode ? ups?.secret_key        : ups?.secret_key_test

  if (!termKeyEnc || !secretEnc) {
    const mode = isRealMode ? "боевые" : "тестовые"
    await logKeyAccess({ store_id, user_id: user.id, action: isRealMode ? "decrypt_prod" : "decrypt_test", edge_fn: "tbank-init", ip, success: false, detail: "keys_not_configured" })
    return jsonResponse({ error: `Введите ${mode} ключи в admin → Интернет-эквайринг.` }, 400)
  }

  // Create intent first, use its id as T-Bank OrderId
  const { data: intent, error: intentError } = await serviceClient
    .from("payment_intents")
    .insert(intentBase)
    .select("id").single()

  if (intentError || !intent)
    return jsonResponse({ error: "Failed to create payment intent: " + (intentError?.message ?? "unknown") }, 500)

  await logKeyAccess({ store_id, user_id: user.id, action: isRealMode ? "decrypt_prod" : "decrypt_test", edge_fn: "tbank-init", ip, success: true })
  const kv          = ups?.key_version ?? 1
  const terminalKey = await decryptPaymentKey(termKeyEnc, kv)
  const password    = await decryptPaymentKey(secretEnc, kv)
  const amountKop   = Math.round(total_amount * 100)
  const scalarParams: Record<string, string | number> = {
    TerminalKey: terminalKey, Amount: amountKop, OrderId: intent.id,
    Description: "Order #" + intent.id.slice(0, 8).toUpperCase(),
    NotificationURL: NOTIFY_URL, SuccessURL: SUCCESS_BASE, FailURL: FAIL_BASE,
  }
  const tResp = await fetch(TBANK_INIT_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...scalarParams, Token: await calcToken(scalarParams, password) }),
  })
  const tData = await tResp.json()
  if (!tData.Success || !tData.PaymentURL) {
    await serviceClient.from("payment_intents").delete().eq("id", intent.id)
    return jsonResponse({ error: "T-Bank: " + (tData.Message || tData.Details || JSON.stringify(tData)) }, 400)
  }

  // Store T-Bank PaymentId in intent for webhook verification
  await serviceClient.from("payment_intents").update({ provider_payment_id: String(tData.PaymentId) }).eq("id", intent.id)

  return jsonResponse({ intent_id: intent.id, payment_url: tData.PaymentURL, amount: total_amount })
})
