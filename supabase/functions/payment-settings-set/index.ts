import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0"
import { handleCors, jsonResponse } from "../_shared/cors.ts"
import { encryptPaymentKey, CURRENT_KEY_VERSION } from "../_shared/payment-crypto.ts"
import { logKeyAccess } from "../_shared/audit.ts"

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? null
  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401)

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401)

  let body: { store_id: string; terminal_key?: string; secret_key?: string; terminal_key_test?: string; secret_key_test?: string }
  try { body = await req.json() } catch { return jsonResponse({ error: "Invalid JSON" }, 400) }

  const { store_id, terminal_key, secret_key, terminal_key_test, secret_key_test } = body
  if (!store_id) return jsonResponse({ error: "store_id required" }, 400)
  if (!terminal_key && !secret_key && !terminal_key_test && !secret_key_test) return jsonResponse({ ok: true })

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  const { data: store } = await serviceClient
    .from("stores").select("owner_user_id").eq("id", store_id).maybeSingle()

  if (!store || store.owner_user_id !== user.id) {
    await logKeyAccess({ store_id, user_id: user.id, action: "set_keys", edge_fn: "payment-settings-set", ip, success: false, detail: "forbidden" })
    return jsonResponse({ error: "Forbidden" }, 403)
  }

  const record: Record<string, string | number> = {
    store_id,
    updated_at:  new Date().toISOString(),
    key_version: CURRENT_KEY_VERSION,
  }
  const actions: string[] = []
  if (terminal_key)      { record.terminal_key      = await encryptPaymentKey(terminal_key);      actions.push("terminal_key") }
  if (secret_key)        { record.secret_key        = await encryptPaymentKey(secret_key);        actions.push("secret_key") }
  if (terminal_key_test) { record.terminal_key_test = await encryptPaymentKey(terminal_key_test); actions.push("terminal_key_test") }
  if (secret_key_test)   { record.secret_key_test   = await encryptPaymentKey(secret_key_test);   actions.push("secret_key_test") }

  const { error } = await serviceClient
    .from("store_payment_settings").upsert(record, { onConflict: "store_id" })

  if (error) {
    await logKeyAccess({ store_id, user_id: user.id, action: "set_keys:" + actions.join(","), edge_fn: "payment-settings-set", ip, success: false, detail: error.message })
    return jsonResponse({ error: error.message }, 500)
  }

  await logKeyAccess({ store_id, user_id: user.id, action: "set_keys:" + actions.join(","), edge_fn: "payment-settings-set", ip, success: true })
  return jsonResponse({ ok: true })
})
