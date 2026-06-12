import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0"
import { handleCors, jsonResponse } from "../_shared/cors.ts"
import { decryptPaymentKey } from "../_shared/payment-crypto.ts"
import { logKeyAccess } from "../_shared/audit.ts"

const TBANK_INIT_URL = "https://securepay.tinkoff.ru/v2/Init"
const NOTIFY_URL     = "https://alliby.ru/functions/v1/tbank-store-notify"
const SUCCESS_BASE   = "https://alliby.ru/?tpay=store_success&order="
const FAIL_BASE      = "https://alliby.ru/?tpay=store_fail&order="

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
  }
  try { body = await req.json() } catch { return jsonResponse({ error: "Invalid JSON body" }, 400) }

  const { store_id, items, total_amount, subscription_discount, applied_user_subscription_id, payment_method } = body

  if (!store_id || !items?.length || total_amount === undefined)
    return jsonResponse({ error: "store_id, items and total_amount are required" }, 400)
  if (typeof total_amount !== "number" || total_amount < 0)
    return jsonResponse({ error: "total_amount must be a non-negative number" }, 400)

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { data: storeData } = await serviceClient
    .from("stores")
    .select("owner_user_id, payment_test_mode, payment_provider")
    .eq("id", store_id).maybeSingle()

  if (storeData) {
    const today = new Date().toISOString().split("T")[0]
    const { data: activeSubs } = await serviceClient
      .from("platform_subscriptions").select("id")
      .eq("user_id", storeData.owner_user_id).eq("status", "active").gte("end_date", today).limit(1)
    if (!activeSubs?.length) return jsonResponse({ error: "Store is temporarily unavailable" }, 403)
  }

  const { data: order, error: orderError } = await userClient
    .from("orders")
    .insert({
      user_id: user.id, store_id, total_amount, status: "pending",
      payment_method: payment_method || "card",
      subscription_discount: subscription_discount || 0,
      applied_user_subscription_id: applied_user_subscription_id || null,
    })
    .select("id").single()

  if (orderError || !order)
    return jsonResponse({ error: "Failed to create order: " + (orderError?.message ?? "unknown") }, 500)

  const { error: itemsError } = await userClient.from("order_items").insert(
    items.map(item => ({ order_id: order.id, menu_item_id: item.menu_item_id, quantity: item.quantity, price_at_time: item.price_at_time }))
  )
  if (itemsError) {
    await serviceClient.from("orders").delete().eq("id", order.id)
    return jsonResponse({ error: "Failed to create order items: " + itemsError.message }, 500)
  }

  if (total_amount === 0) {
    await serviceClient.from("orders").update({ status: "paid" }).eq("id", order.id)
    if (applied_user_subscription_id && Number(subscription_discount) > 0)
      await serviceClient.from("subscription_redemptions").insert({
        user_subscription_id: applied_user_subscription_id, order_id: order.id, amount_discounted: subscription_discount,
      })
    return jsonResponse({ order_id: order.id, free: true, amount: 0 })
  }

  const isRealMode = storeData?.payment_test_mode === false
  const provider   = storeData?.payment_provider || "none"

  // Lookup payment credentials: try this store first, fall back to any store of the same owner
  async function getStoreCreds(fields: string, checkFn: (r: any) => boolean) {
    const { data: direct } = await serviceClient
      .from("store_payment_settings").select(fields).eq("store_id", store_id).maybeSingle()
    if (direct && checkFn(direct)) return direct
    // Fallback: find keys from any store of the same owner
    const { data: ownerStores } = await serviceClient
      .from("stores").select("id").eq("owner_user_id", storeData.owner_user_id).neq("id", store_id)
    if (!ownerStores?.length) return null
    const ids = ownerStores.map((s: any) => s.id)
    const { data: rows } = await serviceClient
      .from("store_payment_settings").select(fields).in("store_id", ids)
    return rows?.find(checkFn) ?? null
  }

  // Реальный режим — боевые ключи
  if (isRealMode && provider !== "none") {
    if (provider !== "tinkoff") {
      await serviceClient.from("orders").delete().eq("id", order.id)
      return jsonResponse({ error: "Provider not yet supported. Use Tinkoff or enable test mode." }, 400)
    }
    const sps = await getStoreCreds("terminal_key,secret_key,key_version", r => !!(r.terminal_key && r.secret_key))
    if (!sps) {
      await serviceClient.from("orders").delete().eq("id", order.id)
      await logKeyAccess({ store_id, user_id: user.id, action: "decrypt_prod", edge_fn: "tbank-init", ip, success: false, detail: "keys_not_configured" })
      return jsonResponse({ error: "Production credentials not configured. Go to admin → Интернет-эквайринг." }, 400)
    }
    await logKeyAccess({ store_id, user_id: user.id, action: "decrypt_prod", edge_fn: "tbank-init", ip, success: true })
    const kv          = sps.key_version ?? 1
    const terminalKey = await decryptPaymentKey(sps.terminal_key, kv)
    const password    = await decryptPaymentKey(sps.secret_key, kv)
    const amountKop   = Math.round(total_amount * 100)
    const scalarParams: Record<string, string | number> = {
      TerminalKey: terminalKey, Amount: amountKop, OrderId: order.id,
      Description: "Order #" + order.id.slice(0, 8).toUpperCase(),
      NotificationURL: NOTIFY_URL, SuccessURL: SUCCESS_BASE + order.id, FailURL: FAIL_BASE + order.id,
    }
    const tResp = await fetch(TBANK_INIT_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...scalarParams, Token: await calcToken(scalarParams, password) }),
    })
    const tData = await tResp.json()
    if (!tData.Success || !tData.PaymentURL) {
      await serviceClient.from("orders").delete().eq("id", order.id)
      return jsonResponse({ error: tData.Message || "T-Bank Init failed" }, 400)
    }
    const { data: payment, error: paymentError } = await serviceClient
      .from("payments").insert({ order_id: order.id, amount: total_amount, status: "pending", provider_transaction_id: String(tData.PaymentId) })
      .select("id").single()
    if (paymentError || !payment) {
      await serviceClient.from("orders").delete().eq("id", order.id)
      return jsonResponse({ error: "Failed to create payment record" }, 500)
    }
    return jsonResponse({ order_id: order.id, payment_id: payment.id, payment_url: tData.PaymentURL, amount: total_amount })
  }

  // Тестовый режим с ключами T-Bank
  if (!isRealMode && provider === "tinkoff") {
    const sps = await getStoreCreds("terminal_key_test,secret_key_test,key_version", r => !!(r.terminal_key_test && r.secret_key_test))
    if (!sps) {
      await serviceClient.from("orders").delete().eq("id", order.id)
      return jsonResponse({ error: "Test payment keys not configured. Go to admin → Интернет-эквайринг." }, 400)
    }
    await logKeyAccess({ store_id, user_id: user.id, action: "decrypt_test", edge_fn: "tbank-init", ip, success: true })
    const kv          = sps.key_version ?? 1
    const terminalKey = await decryptPaymentKey(sps.terminal_key_test, kv)
    const password    = await decryptPaymentKey(sps.secret_key_test, kv)
    const amountKop   = Math.round(total_amount * 100)
    const scalarParams: Record<string, string | number> = {
      TerminalKey: terminalKey, Amount: amountKop, OrderId: order.id,
      Description: "Order #" + order.id.slice(0, 8).toUpperCase(),
      NotificationURL: NOTIFY_URL, SuccessURL: SUCCESS_BASE + order.id, FailURL: FAIL_BASE + order.id,
    }
    const tResp = await fetch(TBANK_INIT_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...scalarParams, Token: await calcToken(scalarParams, password) }),
    })
    const tData = await tResp.json()
    if (!tData.Success || !tData.PaymentURL) {
      await serviceClient.from("orders").delete().eq("id", order.id)
      return jsonResponse({ error: "T-Bank: " + (tData.Message || tData.Details || JSON.stringify(tData)) }, 400)
    }
    const { data: payment, error: paymentError } = await serviceClient
      .from("payments").insert({ order_id: order.id, amount: total_amount, status: "pending", provider_transaction_id: String(tData.PaymentId) })
      .select("id").single()
    if (paymentError || !payment) {
      await serviceClient.from("orders").delete().eq("id", order.id)
      return jsonResponse({ error: "Failed to create payment record" }, 500)
    }
    return jsonResponse({ order_id: order.id, payment_id: payment.id, payment_url: tData.PaymentURL, amount: total_amount })
  }

  // provider = none или не tinkoff — эмуляция только когда нет провайдера
  if (provider !== "none") {
    await serviceClient.from("orders").delete().eq("id", order.id)
    return jsonResponse({ error: "Provider '" + provider + "' not yet supported for payment." }, 400)
  }
  const paymentToken = crypto.randomUUID()
  const { data: payment, error: paymentError } = await serviceClient
    .from("payments").insert({ order_id: order.id, amount: total_amount, status: "pending", provider_transaction_id: paymentToken })
    .select("id").single()
  if (paymentError || !payment) {
    await serviceClient.from("orders").delete().eq("id", order.id)
    return jsonResponse({ error: "Failed to create payment: " + (paymentError?.message ?? "unknown") }, 500)
  }
  return jsonResponse({ order_id: order.id, payment_id: payment.id, payment_token: paymentToken, amount: total_amount })
})
