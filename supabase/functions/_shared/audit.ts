import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0"

export async function logKeyAccess(opts: {
  store_id:  string | null
  user_id:   string | null
  action:    string
  edge_fn:   string
  ip:        string | null
  success:   boolean
  detail?:   string
}) {
  try {
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )
    await serviceClient.from("payment_key_access_log").insert({
      store_id:   opts.store_id,
      user_id:    opts.user_id,
      action:     opts.action,
      edge_fn:    opts.edge_fn,
      ip:         opts.ip,
      success:    opts.success,
      detail:     opts.detail ?? null,
    })
  } catch {
    // Лог не должен ломать основной поток
  }
}
