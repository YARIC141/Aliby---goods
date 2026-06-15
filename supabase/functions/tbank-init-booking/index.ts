import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0"
import { handleCors, jsonResponse } from "../_shared/cors.ts"
import { decryptPaymentKey } from "../_shared/payment-crypto.ts"
import { logKeyAccess } from "../_shared/audit.ts"

const TBANK_INIT_URL = "https://securepay.tinkoff.ru/v2/Init"
const NOTIFY_URL     = "https://alliby.ru/functions/v1/tbank-booking-notify"
const SUCCESS_BASE   = "https://alliby.ru/?tpay=booking_success"
const FAIL_BASE      = "https://alliby.ru/?tpay=booking_fail"

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

  let body: { booking_id?: string }
  try { body = await req.json() } catch { return jsonResponse({ error: "Invalid JSON body" }, 400) }

  const { booking_id } = body
  if (!booking_id) return jsonResponse({ error: "booking_id is required" }, 400)

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  // Get booking — verify it belongs to user and is unpaid
  const { data: booking } = await serviceClient
    .from("bookings")
    .select("id, user_id, store_id, total_price, menu_item_id, slot_date, slot_start, payment_status, status")
    .eq("id", booking_id)
    .maybeSingle()

  if (!booking) return jsonResponse({ error: "Booking not found" }, 404)
  if (booking.user_id !== user.id) return jsonResponse({ error: "Forbidden" }, 403)
  if (booking.payment_status === "paid") return jsonResponse({ error: "Already paid" }, 400)
  if (booking.status === "cancelled") return jsonResponse({ error: "Booking is cancelled" }, 400)

  const amount = Number(booking.total_price) || 0
  if (amount <= 0) return jsonResponse({ error: "Invalid booking amount" }, 400)

  // Get store owner
  const { data: storeData } = await serviceClient
    .from("stores").select("owner_user_id").eq("id", booking.store_id).maybeSingle()
  if (!storeData) return jsonResponse({ error: "Store not found" }, 404)

  // Check platform subscription
  const today = new Date().toISOString().split("T")[0]
  const { data: activeSubs } = await serviceClient
    .from("platform_subscriptions").select("id")
    .eq("user_id", storeData.owner_user_id).eq("status", "active").gte("end_date", today).limit(1)
  if (!activeSubs?.length) return jsonResponse({ error: "Store is temporarily unavailable" }, 403)

  // Get payment settings
  const { data: ownerProfile } = await serviceClient
    .from("profiles").select("payment_provider, payment_test_mode").eq("id", storeData.owner_user_id).maybeSingle()

  const isRealMode = ownerProfile?.payment_test_mode === false
  const provider   = ownerProfile?.payment_provider || "none"

  if (provider === "none")
    return jsonResponse({ error: "Настройте провайдера эквайринга в admin → Интернет-эквайринг." }, 400)
  if (provider !== "tinkoff")
    return jsonResponse({ error: "Provider '" + provider + "' not yet supported." }, 400)

  const { data: ups } = await serviceClient
    .from("user_payment_settings")
    .select("terminal_key, secret_key, terminal_key_test, secret_key_test, key_version")
    .eq("user_id", storeData.owner_user_id).maybeSingle()

  const termKeyEnc = isRealMode ? ups?.terminal_key : ups?.terminal_key_test
  const secretEnc  = isRealMode ? ups?.secret_key   : ups?.secret_key_test

  if (!termKeyEnc || !secretEnc) {
    const mode = isRealMode ? "боевые" : "тестовые"
    await logKeyAccess({ store_id: booking.store_id, user_id: user.id, action: isRealMode ? "decrypt_prod" : "decrypt_test", edge_fn: "tbank-init-booking", ip, success: false, detail: "keys_not_configured" })
    return jsonResponse({ error: `Введите ${mode} ключи в admin → Интернет-эквайринг.` }, 400)
  }

  await logKeyAccess({ store_id: booking.store_id, user_id: user.id, action: isRealMode ? "decrypt_prod" : "decrypt_test", edge_fn: "tbank-init-booking", ip, success: true })
  const kv          = ups?.key_version ?? 1
  const terminalKey = await decryptPaymentKey(termKeyEnc, kv)
  const password    = await decryptPaymentKey(secretEnc, kv)
  const amountKop   = Math.round(amount * 100)

  const scalarParams: Record<string, string | number> = {
    TerminalKey: terminalKey,
    Amount:      amountKop,
    OrderId:     booking_id,
    Description: `Запись ${booking.slot_date} ${(booking.slot_start || "").slice(0, 5)}`,
    NotificationURL: NOTIFY_URL,
    SuccessURL: SUCCESS_BASE,
    FailURL:    FAIL_BASE,
  }

  const tResp = await fetch(TBANK_INIT_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...scalarParams, Token: await calcToken(scalarParams, password) }),
  })
  const tData = await tResp.json()

  if (!tData.Success || !tData.PaymentURL)
    return jsonResponse({ error: "T-Bank: " + (tData.Message || tData.Details || JSON.stringify(tData)) }, 400)

  return jsonResponse({ payment_url: tData.PaymentURL, amount })
})
