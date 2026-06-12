/**
 * Edge Function: tbank-sub-notify
 * Receives T-Bank payment notifications for subscription purchases.
 * Must respond with "OK" within 10 seconds.
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

  // Get store_id from metadata to find the owner
  const storeId = payment.metadata?.store_id
  if (!storeId) return ok()

  // Get owner_user_id from store
  const storeResp = await fetch(
    `${supabaseUrl}/rest/v1/stores?id=eq.${storeId}&select=owner_user_id`,
    { headers }
  )
  const storeArr = await storeResp.json().catch(() => [])
  const store = Array.isArray(storeArr) ? storeArr[0] : null
  if (!store?.owner_user_id) return ok()

  // Get payment mode from owner's profile
  const profResp = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${store.owner_user_id}&select=payment_test_mode`,
    { headers }
  )
  const profArr = await profResp.json().catch(() => [])
  const profile = Array.isArray(profArr) ? profArr[0] : null
  const isRealMode = profile?.payment_test_mode === false

  // Get credentials from user_payment_settings
  const upsResp = await fetch(
    `${supabaseUrl}/rest/v1/user_payment_settings?user_id=eq.${store.owner_user_id}&select=terminal_key,secret_key,terminal_key_test,secret_key_test,key_version`,
    { headers }
  )
  const upsArr = await upsResp.json().catch(() => [])
  const ups = Array.isArray(upsArr) ? upsArr[0] : null

  if (ups) {
    const secretEnc = isRealMode ? ups.secret_key : ups.secret_key_test
    if (secretEnc) {
      try {
        const kv       = ups.key_version ?? 1
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
    await fetch(`${supabaseUrl}/rest/v1/payments?id=eq.${payment.id}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ status: "succeeded", provider_transaction_id: String(PaymentId) }),
    })
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
