/**
 * Edge Function: delete-account
 * Scoped self-service account deletion for client / admin / carry.
 *
 * One auth account can be used across all three apps at once (e.g. a store
 * owner who also delivers as a courier, or a courier who also shops as a
 * customer). Pressing "Удалить аккаунт" in one app must only strip that
 * app's own role data — never wipe access the same account still has in
 * another app. The account (profile + auth user) is only actually deleted
 * once no app has any claim left on it.
 *
 * POST /functions/v1/delete-account
 * Body: { app: 'client' | 'admin' | 'carry' }
 * Auth: Bearer <user JWT>
 * Response: { ok: true, fullyDeleted: boolean } or { error: string }
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

  const { app } = await req.json().catch(() => ({})) as { app?: string }
  if (!["client", "admin", "carry"].includes(app ?? "")) {
    return jsonResponse({ error: "app must be 'client', 'admin' or 'carry'" }, 400)
  }

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

  const { data: profile } = await serviceClient
    .from("profiles").select("role, is_courier").eq("id", user.id).single()
  if (!profile) return jsonResponse({ error: "Profile not found" }, 404)

  const { count: storeCount } = await serviceClient
    .from("stores").select("id", { count: "exact", head: true }).eq("owner_user_id", user.id)
  const hasStores = (storeCount ?? 0) > 0

  const { count: activeAsCustomerCount } = await serviceClient
    .from("orders").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).in("status", ACTIVE_STATUSES)
  const hasActiveAsCustomer = (activeAsCustomerCount ?? 0) > 0

  // ── Strip only the calling app's own role data ─────────────────────────
  if (app === "carry") {
    if (!profile.is_courier) return jsonResponse({ error: "Not a courier account" }, 400)

    const { count: activeAsCourier } = await serviceClient
      .from("orders").select("id", { count: "exact", head: true })
      .eq("carry_courier_id", user.id).in("status", ACTIVE_STATUSES)
    if ((activeAsCourier ?? 0) > 0) {
      return jsonResponse({ error: "Нельзя удалить курьерский профиль — есть незавершённый заказ" }, 400)
    }

    await serviceClient.from("profiles").update({
      is_courier: false, courier_city: null, courier_min_reward: null,
      courier_lat: null, courier_lng: null, courier_location_updated_at: null,
    }).eq("id", user.id)
    profile.is_courier = false
  }

  if (app === "admin" && profile.role === "employee") {
    // Employee/master logins are synthetic (created by the store's admin,
    // see manage-employee) and exist only to staff that one store — removing
    // them is the store admin's call, not self-service. The UI already hides
    // this action for employees; this is the server-side backstop.
    return jsonResponse({ error: "Сотрудник не может удалить свой аккаунт самостоятельно — обратитесь к администратору заведения." }, 403)
  }

  if (app === "admin") {
    if (profile.role !== "admin") {
      return jsonResponse({ error: "Not an admin account" }, 400)
    }
    if (hasStores) {
      return jsonResponse({ error: "Нельзя удалить аккаунт, пока у вас есть заведения — сначала передайте или удалите их." }, 400)
    }

    await serviceClient.from("profiles").update({ role: "user" }).eq("id", user.id)
    profile.role = "user"
  }

  if (app === "client") {
    if (profile.role !== "user") {
      return jsonResponse({ error: "Аккаунт используется в Alliby Admin — сначала удалите роль продавца/сотрудника там." }, 400)
    }
    if (profile.is_courier) {
      return jsonResponse({ error: "Аккаунт используется в Alliby Carry — сначала удалите курьерский профиль там." }, 400)
    }
    if (hasStores) {
      return jsonResponse({ error: "Нельзя удалить аккаунт, пока у вас есть заведения — сначала передайте или удалите их." }, 400)
    }
    if (hasActiveAsCustomer) {
      return jsonResponse({ error: "Нельзя удалить аккаунт — есть незавершённые заказы." }, 400)
    }
  }

  // ── Nothing else uses this account anymore → remove it entirely ───────
  // (For app === "client" every condition below is already false — the
  // checks above returned early otherwise — so this always falls through
  // to the deletion attempt for that path.)
  const stillUsedElsewhere = profile.role !== "user" || profile.is_courier || hasStores || hasActiveAsCustomer
  if (stillUsedElsewhere) {
    return jsonResponse({ ok: true, fullyDeleted: false })
  }

  // profiles has no FK to auth.users (it's linked by matching id, not a hard
  // constraint), so both rows need deleting explicitly. orders.user_id is
  // ON DELETE RESTRICT, so this fails for an account with past order
  // history — that's fine here: this app's own role data was already
  // stripped above, so we just leave the (now role-less) account in place
  // rather than surfacing a scary error for a side-effect of another app's
  // deletion request.
  const { error: profileError } = await serviceClient.from("profiles").delete().eq("id", user.id)
  if (profileError) {
    if (app === "client") {
      return jsonResponse({ error: "Не удалось удалить аккаунт — вероятно, есть история заказов. Обратитесь в поддержку: alliby.app@gmail.com" }, 400)
    }
    return jsonResponse({ ok: true, fullyDeleted: false })
  }

  const { error: authDeleteError } = await serviceClient.auth.admin.deleteUser(user.id)
  if (authDeleteError) {
    return jsonResponse({ error: "Профиль удалён, но не удалось удалить учётную запись входа. Обратитесь в поддержку: alliby.app@gmail.com" }, 500)
  }

  return jsonResponse({ ok: true, fullyDeleted: true })
})
