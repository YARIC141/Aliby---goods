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

  const { OrderId, Status, Token } = data as Record<string, unknown>
  if (!OrderId || !Status || !Token) return OK

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  const { data: reservation } = await serviceClient
    .from("rent_reservations")
    .select("id, store_id, user_id, total_price, payment_status, payment_group_id")
    .eq("id", String(OrderId))
    .maybeSingle()

  if (!reservation) return OK
  if (reservation.payment_status === "paid") return OK

  const { data: storeData } = await serviceClient
    .from("stores").select("owner_user_id").eq("id", reservation.store_id).maybeSingle()

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
        if (expected !== String(Token)) return new Response("Forbidden", { status: 403 })
      }
    }
  }

  const successStatuses = new Set(["CONFIRMED", "AUTHORIZED"])
  if (!successStatuses.has(String(Status))) return OK

  const groupId = reservation.payment_group_id || reservation.id
  await serviceClient
    .from("rent_reservations")
    .update({ payment_status: "paid" })
    .or(`id.eq.${groupId},payment_group_id.eq.${groupId}`)

  return OK
})
