/**
 * Edge Function: delete-account
 * Deletes the caller's own account — profile row + auth user. Shared by
 * client, admin, and Carry's "Удалить аккаунт" action (they all already
 * called this endpoint; it just never existed until now).
 *
 * POST /functions/v1/delete-account
 * Auth: Bearer <user JWT>
 * Response: { ok: true } or { error: string }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0"
import { handleCors, jsonResponse } from "../_shared/cors.ts"

const ACTIVE_STATUSES = ["pending", "paid", "in_progress", "looking_for_courier", "on_the_way", "ready"]

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405)

  const authHeader = req.headers.get("Authorization")
  if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401)

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401)

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  )

  // A store owner needs to transfer/remove their stores first — deleting the
  // account out from under a live store with its own orders/menu/employees
  // isn't something to do silently as a side effect.
  const { count: storeCount } = await serviceClient
    .from("stores").select("id", { count: "exact", head: true }).eq("owner_user_id", user.id)
  if (storeCount && storeCount > 0) {
    return jsonResponse({ error: "Нельзя удалить аккаунт, пока у вас есть заведения — сначала передайте или удалите их." }, 400)
  }

  // Don't let an order vanish mid-flight, whether the caller is the customer
  // or the assigned courier.
  const { count: activeAsCustomer } = await serviceClient
    .from("orders").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).in("status", ACTIVE_STATUSES)
  const { count: activeAsCourier } = await serviceClient
    .from("orders").select("id", { count: "exact", head: true })
    .eq("carry_courier_id", user.id).in("status", ACTIVE_STATUSES)
  if ((activeAsCustomer ?? 0) > 0 || (activeAsCourier ?? 0) > 0) {
    return jsonResponse({ error: "Нельзя удалить аккаунт — есть незавершённые заказы." }, 400)
  }

  // profiles has no FK to auth.users (it's linked by matching id, not a hard
  // constraint), so both rows need deleting explicitly. orders.user_id is
  // ON DELETE RESTRICT, so this fails for an account with past order
  // history — surfaced as a clear message rather than a raw DB error.
  const { error: profileError } = await serviceClient.from("profiles").delete().eq("id", user.id)
  if (profileError) {
    return jsonResponse({ error: "Не удалось удалить аккаунт — вероятно, есть история заказов. Обратитесь в поддержку: alliby.app@gmail.com" }, 400)
  }

  const { error: authDeleteError } = await serviceClient.auth.admin.deleteUser(user.id)
  if (authDeleteError) {
    return jsonResponse({ error: "Профиль удалён, но не удалось удалить учётную запись входа. Обратитесь в поддержку: alliby.app@gmail.com" }, 500)
  }

  return jsonResponse({ ok: true })
})
