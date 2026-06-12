import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0"
import { handleCors, jsonResponse } from "../_shared/cors.ts"
import { decryptPaymentKey } from "../_shared/payment-crypto.ts"
import { logKeyAccess } from "../_shared/audit.ts"

const TBANK_INIT_URL = "https://securepay.tinkoff.ru/v2/Init"
const NOTIFY_URL     = "https://alliby.ru/functions/v1/tbank-sub-notify"
const SUCCESS_BASE   = "https://alliby.ru/?tpay=sub_success&pay="
const FAIL_BASE      = "https://alliby.ru/?tpay=sub_fail&pay="

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

  let body: { subscription_ids?: string[]; is_gift?: boolean }
  try { body = await req.json() } catch { return jsonResponse({ error: "Invalid JSON body" }, 400) }

  const { subscription_ids, is_gift = false } = body
  if (!subscription_ids?.length)
    return jsonResponse({ error: "subscription_ids required" }, 400)

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { data: subs, error: subsError } = await serviceClient
    .from("subscriptions")
    .select("id, price, store_id, name, duration_days, total_uses")
    .in("id", subscription_ids)

  if (subsError || !subs?.length)
    return jsonResponse({ error: "Subscriptions not found" }, 404)

  const storeIds = [...new Set(subs.map((s: any) => s.store_id))]
  if (storeIds.length > 1)
    return jsonResponse({ error: "All subscriptions must be from the same store" }, 400)

  const store_id = storeIds[0] as string
  const totalAmount = subs.reduce((sum: number, s: any) => sum + Number(s.price), 0)

  const { data: storeData } = await serviceClient
    .from("stores")
    .select("owner_user_id, payment_test_mode, payment_provider")
    .eq("id", store_id).maybeSingle()

  if (!storeData)
    return jsonResponse({ error: "Store not found" }, 404)

  const today = new Date().toISOString().split("T")[0]
  const { data: activePlatformSubs } = await serviceClient
    .from("platform_subscriptions").select("id")
    .eq("user_id", storeData.owner_user_id).eq("status", "active").gte("end_date", today).limit(1)
  if (!activePlatformSubs?.length)
    return jsonResponse({ error: "Store is temporarily unavailable" }, 403)

  // Find payment config from this store or any other store of the same owner with tinkoff
  const { data: ownerStores } = await serviceClient
    .from("stores").select("id, payment_test_mode, payment_provider")
    .eq("owner_user_id", storeData.owner_user_id)

  const tinkoffStore = ownerStores?.find((s: any) => s.payment_provider === "tinkoff")
  if (!tinkoffStore)
    return jsonResponse({ error: "Store does not support card payment. Configure Tinkoff in admin → Интернет-эквайринг." }, 400)

  const isRealMode       = tinkoffStore.payment_test_mode === false
  const ownerStoreIds    = (ownerStores ?? []).map((s: any) => s.id)

  // Create user_subscriptions with pending status
  const now = new Date()
  const userSubInserts = subs.map((sub: any) => {
    const endDate = new Date(now)
    endDate.setDate(endDate.getDate() + sub.duration_days)
    return {
      user_id: user.id,
      subscription_id: sub.id,
      status: "pending",
      start_date: now.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      remaining_uses: sub.total_uses === 0 ? null : sub.total_uses,
      ...(is_gift ? { gift_status: "pending" } : {}),
    }
  })

  const { data: createdUserSubs, error: userSubsError } = await userClient
    .from("user_subscriptions")
    .insert(userSubInserts)
    .select("id")

  if (userSubsError || !createdUserSubs?.length)
    return jsonResponse({ error: "Failed to create subscription records: " + userSubsError?.message }, 500)

  const primaryUserSubId   = createdUserSubs[0].id
  const additionalSubIds   = createdUserSubs.slice(1).map((us: any) => us.id)
  const allUserSubIds      = createdUserSubs.map((us: any) => us.id)

  // Find keys: search all owner stores, not just the subscription's store
  const keyField = isRealMode ? "store_id,terminal_key,secret_key,key_version" : "store_id,terminal_key_test,secret_key_test,key_version"
  const { data: spsRows } = await serviceClient
    .from("store_payment_settings").select(keyField).in("store_id", ownerStoreIds)
  const sps = isRealMode
    ? spsRows?.find((r: any) => r.terminal_key && r.secret_key)
    : spsRows?.find((r: any) => r.terminal_key_test && r.secret_key_test)

  const termKeyEnc = isRealMode ? (sps as any)?.terminal_key : (sps as any)?.terminal_key_test
  const secretEnc  = isRealMode ? (sps as any)?.secret_key   : (sps as any)?.secret_key_test

  if (!termKeyEnc || !secretEnc) {
    await serviceClient.from("user_subscriptions").delete().in("id", allUserSubIds)
    await logKeyAccess({ store_id, user_id: user.id, action: isRealMode ? "decrypt_prod" : "decrypt_test", edge_fn: "tbank-init-sub", ip, success: false, detail: "keys_not_configured" })
    return jsonResponse({ error: "Payment credentials not configured. Go to admin → Интернет-эквайринг." }, 400)
  }

  await logKeyAccess({ store_id, user_id: user.id, action: isRealMode ? "decrypt_prod" : "decrypt_test", edge_fn: "tbank-init-sub", ip, success: true })
  const kv          = (sps as any)?.key_version ?? 1
  const terminalKey = await decryptPaymentKey(termKeyEnc, kv)
  const password    = await decryptPaymentKey(secretEnc, kv)

  // Create payment record
  const metadata: Record<string, unknown> = { is_gift, store_id }
  if (additionalSubIds.length) metadata.additional_user_sub_ids = additionalSubIds

  const { data: payment, error: paymentError } = await serviceClient
    .from("payments")
    .insert({
      user_subscription_id: primaryUserSubId,
      amount: totalAmount,
      status: "pending",
      metadata,
    })
    .select("id").single()

  if (paymentError || !payment) {
    await serviceClient.from("user_subscriptions").delete().in("id", allUserSubIds)
    return jsonResponse({ error: "Failed to create payment record" }, 500)
  }

  const amountKop   = Math.round(totalAmount * 100)
  const description = "Абонемент: " + subs.map((s: any) => s.name).join(", ").slice(0, 140)
  const scalarParams: Record<string, string | number> = {
    TerminalKey: terminalKey, Amount: amountKop, OrderId: payment.id,
    Description: description,
    NotificationURL: NOTIFY_URL,
    SuccessURL: SUCCESS_BASE + payment.id,
    FailURL: FAIL_BASE + payment.id,
  }

  const tResp = await fetch(TBANK_INIT_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...scalarParams, Token: await calcToken(scalarParams, password) }),
  })
  const tData = await tResp.json()

  if (!tData.Success || !tData.PaymentURL) {
    await serviceClient.from("payments").delete().eq("id", payment.id)
    await serviceClient.from("user_subscriptions").delete().in("id", allUserSubIds)
    return jsonResponse({ error: "T-Bank error: " + (tData.Message || JSON.stringify(tData)) }, 400)
  }

  await serviceClient.from("payments")
    .update({ provider_transaction_id: String(tData.PaymentId) })
    .eq("id", payment.id)

  return jsonResponse({ payment_id: payment.id, payment_url: tData.PaymentURL, amount: totalAmount })
})
