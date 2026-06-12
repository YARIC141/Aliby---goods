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

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  const { data: ups } = await serviceClient
    .from("user_payment_settings")
    .select("terminal_key, secret_key, terminal_key_test, secret_key_test")
    .eq("user_id", user.id).maybeSingle()

  return jsonResponse({
    has_terminal_key:      !!ups?.terminal_key,
    has_secret_key:        !!ups?.secret_key,
    has_terminal_key_test: !!ups?.terminal_key_test,
    has_secret_key_test:   !!ups?.secret_key_test,
  })
})
