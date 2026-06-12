/**
 * Edge Function: tbank-sub-notify
 * Receives T-Bank payment notifications for store subscription purchases.
 * Must respond with "OK" within 10 seconds.
 * DB update happens BEFORE returning OK so T-Bank doesn't retry.
 */
import { decryptPaymentKey } from "../_shared/payment-crypto.ts"

async function calcToken(params: Record<string, unknown>, password: string): Promise<string> {
  const entries: Record<string, string> = { Password: password }
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && typeof v !== "object" && String(v) !== "")
      entries[k] = String(v)
  }
  const str  = Object.keys(entries).sort().map(k => entries[k]).join("")
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("")
}

const ok = () => new Response("OK", { status: 200, headers: { "Content-Type": "text/plain" } })

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200 })

  let body: Record<string, unknown>
  const ct = req.headers.get("Content-Type") || ""
  try {
    body = ct.includes("application/json") ? await req.json()
      : Object.fromEntries(new URLSearchParams(await req.text()))
  } catch { return ok() }

  const { Token: receivedToken, OrderId, Status, PaymentId, Success, ...rest } = body as Record<string, unknown>
  if (!OrderId || !Status) return ok()

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  const headers = {
    apikey:         serviceRoleKey,
    Authorization:  `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer:         "return=representation",
  }

  // Find payment by OrderId (= payment.id)
  const payResp = await fetch(
    `${supabaseUrl}/rest/v1/payments?id=eq.${OrderId}&select=id,user_subscription_id,amount,status,metadata`,
    { headers }
  )
  const payArr = await payResp.json().catch(() => [])
  const payment = Array.isArray(payArr) ? payArr[0] : null
  if (!payment || payment.status !== "pending") return ok()

  // Get store_id from metadata (stored by tbank-init-sub)
  const storeId = payment.metadata?.store_id
  if (!storeId) return ok()

  // Get store's T-Bank credentials to verify token
  const storeResp = await fetch(
    `${supabaseUrl}/rest/v1/stores?id=eq.${storeId}&select=payment_test_mode`,
    { headers }
  )
  const storeArr = await storeResp.json().catch(() => [])
  const store = Array.isArray(storeArr) ? storeArr[0] : null

  const isRealMode = store?.payment_test_mode === false
  const spsSelect  = isRealMode
    ? "terminal_key,secret_key,key_version"
    : "terminal_key_test,secret_key_test,key_version"

  const spsResp = await fetch(
    `${supabaseUrl}/rest/v1/store_payment_settings?store_id=eq.${storeId}&select=${spsSelect}`,
    { headers }
  )
  const spsArr = await spsResp.json().catch(() => [])
  const sps = Array.isArray(spsArr) ? spsArr[0] : null

  if (sps) {
    const termKeyEnc = isRealMode ? sps.terminal_key   : sps.terminal_key_test
    const secretEnc  = isRealMode ? sps.secret_key     : sps.secret_key_test
    if (secretEnc) {
      try {
        const kv       = sps.key_version ?? 1
        const password = await decryptPaymentKey(secretEnc, kv)
        const expected = await calcToken({ ...rest, Token: receivedToken, OrderId, Status, PaymentId, Success }, password)
        if (receivedToken !== expected) return ok()
      } catch { /* decryption failed — skip verification */ }
    }
  }

  const isSuccess = Status === "CONFIRMED" || Status === "AUTHORIZED"
  const isFail    = Status === "REJECTED" || Status === "CANCELLED" || Status === "DEADLINE_EXPIRED"

  const primarySubId   = payment.user_subscription_id
  const additionalIds: string[] = payment.metadata?.additional_user_sub_ids || []
  const allSubIds      = [primarySubId, ...additionalIds].filter(Boolean)

  if (isSuccess) {
    // Update payment status
    await fetch(`${supabaseUrl}/rest/v1/payments?id=eq.${payment.id}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ status: "succeeded", provider_transaction_id: String(PaymentId) }),
    })

    // Activate all user_subscriptions
    const subFilter = `id=in.(${allSubIds.map(id => `"${id}"`).join(",")})`
    await fetch(`${supabaseUrl}/rest/v1/user_subscriptions?${subFilter}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ status: "active" }),
    })

  } else if (isFail) {
    await fetch(`${supabaseUrl}/rest/v1/payments?id=eq.${payment.id}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ status: "failed" }),
    })

    const subFilter = `id=in.(${allSubIds.map(id => `"${id}"`).join(",")})`
    await fetch(`${supabaseUrl}/rest/v1/user_subscriptions?${subFilter}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ status: "cancelled" }),
    })
  }

  return ok()
})
