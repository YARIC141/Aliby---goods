import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0"
import { handleCors, jsonResponse } from "../_shared/cors.ts"

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return jsonResponse({ error: "Unauthorized" }, 401)

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401)

  let store_id: string
  try { store_id = (await req.json()).store_id } catch { return jsonResponse({ error: "Invalid JSON" }, 400) }
  if (!store_id) return jsonResponse({ error: "store_id required" }, 400)

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  const { data: store } = await serviceClient
    .from("stores").select("owner_user_id").eq("id", store_id).maybeSingle()

  if (!store || store.owner_user_id !== user.id) return jsonResponse({ error: "Forbidden" }, 403)

  const { data: sps } = await serviceClient
    .from("store_payment_settings")
    .select("terminal_key, secret_key, terminal_key_test, secret_key_test")
    .eq("store_id", store_id).maybeSingle()

  return jsonResponse({
    has_terminal_key:      !!sps?.terminal_key,
    has_secret_key:        !!sps?.secret_key,
    has_terminal_key_test: !!sps?.terminal_key_test,
    has_secret_key_test:   !!sps?.secret_key_test,
  })
})
