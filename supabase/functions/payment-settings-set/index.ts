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

  let body: { terminal_key?: string; secret_key?: string; terminal_key_test?: string; secret_key_test?: string }
  try { body = await req.json() } catch { return jsonResponse({ error: "Invalid JSON" }, 400) }

  const { terminal_key, secret_key, terminal_key_test, secret_key_test } = body
  if (!terminal_key && !secret_key && !terminal_key_test && !secret_key_test)
    return jsonResponse({ ok: true })

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  // Get all stores owned by this user
  const { data: stores } = await serviceClient
    .from("stores").select("id").eq("owner_user_id", user.id)

  if (!stores?.length) return jsonResponse({ error: "No stores found for this user" }, 404)

  // Encrypt keys once, reuse for all stores
  const encTermKey      = terminal_key      ? await encryptPaymentKey(terminal_key)      : undefined
  const encSecretKey    = secret_key        ? await encryptPaymentKey(secret_key)        : undefined
  const encTermKeyTest  = terminal_key_test ? await encryptPaymentKey(terminal_key_test) : undefined
  const encSecretTest   = secret_key_test   ? await encryptPaymentKey(secret_key_test)   : undefined

  const updatedAt = new Date().toISOString()
  const records = stores.map((s: any) => ({
    store_id:    s.id,
    updated_at:  updatedAt,
    key_version: CURRENT_KEY_VERSION,
    ...(encTermKey     && { terminal_key:      encTermKey }),
    ...(encSecretKey   && { secret_key:        encSecretKey }),
    ...(encTermKeyTest && { terminal_key_test: encTermKeyTest }),
    ...(encSecretTest  && { secret_key_test:   encSecretTest }),
  }))

  const { error } = await serviceClient
    .from("store_payment_settings").upsert(records, { onConflict: "store_id" })

  const actions = [terminal_key && "terminal_key", secret_key && "secret_key",
                   terminal_key_test && "terminal_key_test", secret_key_test && "secret_key_test"]
    .filter(Boolean).join(",")

  if (error) {
    await logKeyAccess({ store_id: "all", user_id: user.id, action: "set_keys:" + actions, edge_fn: "payment-settings-set", ip, success: false, detail: error.message })
    return jsonResponse({ error: error.message }, 500)
  }

  await logKeyAccess({ store_id: "all", user_id: user.id, action: "set_keys:" + actions, edge_fn: "payment-settings-set", ip, success: true })
  return jsonResponse({ ok: true, stores_updated: stores.length })
})
