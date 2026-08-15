import { tbankHttpClient } from "../_shared/tbank-http-client.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0"
import { handleCors, jsonResponse } from "../_shared/cors.ts"
import { decryptPaymentKey } from "../_shared/payment-crypto.ts"
import { logKeyAccess } from "../_shared/audit.ts"

const TBANK_INIT_URL = "https://securepay.tinkoff.ru/v2/Init"
const NOTIFY_URL     = "https://alliby.ru/functions/v1/tbank-store-notify"
const SUCCESS_BASE   = "https://alliby.ru/?tpay=store_success"
const FAIL_BASE      = "https://alliby.ru/?tpay=store_fail"

async function calcToken(params: Record<string, string | number>, password: string): Promise<string> {
  const all    = { ...params, Password: password }
  const sorted = Object.keys(all).sort()
  const str    = sorted.map(k => String(all[k])).join("")
  const hash   = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("")
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? null

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401)

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401)

    let body: {
      store_id?: string
      items?: { menu_item_id: string; quantity: number; price_at_time: number; selected_options?: { group_id: string; option_id: string; name: string; price_add: number }[] }[]
      total_amount?: number
      subscription_discount?: number
      applied_user_subscription_id?: string
      payment_method?: string
      is_delivery?: boolean
      delivery_fee?: number
      delivery_address?: string | null
      delivery_lat?: number | null
      delivery_lng?: number | null
      success_url?: string
      fail_url?: string
    }
    try { body = await req.json() } catch { return jsonResponse({ error: "Invalid JSON body" }, 400) }

    const {
      store_id, items, total_amount,
      subscription_discount, applied_user_subscription_id, payment_method,
      is_delivery = false, delivery_fee = 0, delivery_address = null,
      delivery_lat = null, delivery_lng = null,
      success_url, fail_url,
    } = body

    if (!store_id || !items?.length)
      return jsonResponse({ error: "store_id and items are required" }, 400)
    if (items.some(i => !i?.menu_item_id || !Number.isFinite(i.quantity) || i.quantity <= 0))
      return jsonResponse({ error: "Каждая позиция должна иметь menu_item_id и положительное количество" }, 400)

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    // Get store owner
    const { data: storeData } = await serviceClient
      .from("stores")
      .select("owner_user_id")
      .eq("id", store_id).maybeSingle()

    if (!storeData) return jsonResponse({ error: "Store not found" }, 404)

    // Check owner's platform subscription
    const today = new Date().toISOString().split("T")[0]
    const { data: activeSubs } = await serviceClient
      .from("platform_subscriptions").select("id")
      .eq("user_id", storeData.owner_user_id).eq("status", "active").gte("end_date", today).limit(1)
    if (!activeSubs?.length) return jsonResponse({ error: "Store is temporarily unavailable" }, 403)

    // Get owner's payment settings from profiles
    const { data: ownerProfile } = await serviceClient
      .from("profiles")
      .select("payment_provider, payment_test_mode")
      .eq("id", storeData.owner_user_id).maybeSingle()

    const isRealMode = ownerProfile?.payment_test_mode === false
    const provider   = ownerProfile?.payment_provider || "none"

    // ─── Пересчёт суммы по каталогу ──────────────────────────────────────
    // Клиентские total_amount / price_at_time / subscription_discount —
    // только подсказка для интерфейса. Доверять им нельзя: с ними заказ на
    // любую сумму оформлялся за 0 ₽ по прямому запросу к функции.
    const itemIds = [...new Set(items.map(i => i.menu_item_id))]
    const { data: catalogue } = await serviceClient
      .from("menu_items")
      .select("id, price, store_id, is_available, category_id")
      .in("id", itemIds)

    if (!catalogue || catalogue.length !== itemIds.length)
      return jsonResponse({ error: "Некоторых позиций больше нет в меню" }, 400)
    if (catalogue.some(m => m.store_id !== store_id))
      return jsonResponse({ error: "Позиции из другого заведения" }, 400)
    if (catalogue.some(m => m.is_available === false))
      return jsonResponse({ error: "Некоторых позиций сейчас нет в наличии" }, 400)

    const catalogueById = new Map(catalogue.map(m => [m.id, m]))

    // Цены опций тоже берём из базы и проверяем, что опция принадлежит
    // группе именно этой позиции.
    const optionIds = [...new Set(items.flatMap(i => (i.selected_options ?? []).map(o => o.option_id)))]
    const optionById = new Map<string, { price_add: number; menu_item_id: string; name: string }>()
    if (optionIds.length) {
      const { data: opts } = await serviceClient
        .from("menu_item_options")
        .select("id, name, price_add, menu_item_option_groups(menu_item_id)")
        .in("id", optionIds)
      for (const o of opts ?? []) {
        const grp = o.menu_item_option_groups as unknown as { menu_item_id: string } | null
        if (grp) optionById.set(o.id as string, {
          price_add: Number(o.price_add) || 0, menu_item_id: grp.menu_item_id, name: o.name as string,
        })
      }
      if (optionById.size !== optionIds.length)
        return jsonResponse({ error: "Выбранная опция больше не доступна" }, 400)
    }

    // Позиции с серверными ценами — именно они уходят в заказ и в чек.
    const safeItems = items.map(i => {
      const m = catalogueById.get(i.menu_item_id)!
      const chosen = (i.selected_options ?? []).map(o => {
        const opt = optionById.get(o.option_id)
        if (!opt || opt.menu_item_id !== i.menu_item_id)
          throw new Error("Опция не относится к выбранной позиции")
        return { group_id: o.group_id, option_id: o.option_id, name: opt.name, price_add: opt.price_add }
      })
      const optExtra = chosen.reduce((sum, o) => sum + o.price_add, 0)
      return {
        menu_item_id: i.menu_item_id,
        quantity: Math.floor(i.quantity),
        price_at_time: Number(m.price) + optExtra,
        selected_options: chosen,
        _basePrice: Number(m.price),
        _categoryId: m.category_id as string | null,
      }
    })

    const fullAmount = safeItems.reduce((sum, i) => sum + i.price_at_time * i.quantity, 0)

    // ─── Абонемент ───────────────────────────────────────────────────────
    // Повторяем правило корзины: одна лучшая подписка, скидка на базовую
    // цену позиции, покрывается не больше remaining_uses единиц.
    let serverDiscount = 0
    let subUses        = 0
    let subIdApplied: string | null = null

    if (applied_user_subscription_id) {
      const { data: us } = await serviceClient
        .from("user_subscriptions")
        .select("id, user_id, status, end_date, remaining_uses, subscriptions(store_id, discount_type, discount_value, coverage_rules)")
        .eq("id", applied_user_subscription_id)
        .maybeSingle()

      const sub = us?.subscriptions as unknown as {
        store_id: string; discount_type: string; discount_value: number
        coverage_rules: { type: string; category_ids?: string[]; item_ids?: string[]; exclude_items?: string[] } | null
      } | null

      const notExpired = !us?.end_date || new Date(us.end_date) >= new Date()
      const usable = us && us.user_id === user.id && us.status === "active" &&
        us.remaining_uses !== 0 && notExpired && sub && sub.store_id === store_id

      if (!usable) return jsonResponse({ error: "Абонемент недоступен для этого заказа" }, 400)

      const covers = (itemId: string, categoryId: string | null) => {
        const r = sub!.coverage_rules ?? { type: "all" }
        switch (r.type) {
          case "all": return true
          case "include_categories":
            return !!(categoryId && r.category_ids?.includes(categoryId) && !r.exclude_items?.includes(itemId))
          case "include_items":  return !!r.item_ids?.includes(itemId)
          case "exclude_items":  return !r.exclude_items?.includes(itemId)
          default: return false
        }
      }

      const perUnitDisc = (base: number) =>
        sub!.discount_type === "percent"
          ? Math.round(base * Number(sub!.discount_value)) / 100
          : Math.min(Number(sub!.discount_value), base)

      let usesLeft: number | null = us!.remaining_uses
      for (const it of safeItems) {
        if (usesLeft !== null && usesLeft <= 0) break
        if (!covers(it.menu_item_id, it._categoryId)) continue
        const covered = usesLeft === null ? it.quantity : Math.min(it.quantity, usesLeft)
        if (covered <= 0) continue
        serverDiscount += perUnitDisc(it._basePrice) * covered
        subUses        += covered
        if (usesLeft !== null) usesLeft -= covered
      }
      if (subUses > 0) subIdApplied = applied_user_subscription_id
    }

    serverDiscount = Math.min(serverDiscount, fullAmount)

    // Доставка: цену берём из зон заведения, иначе её можно было занизить.
    let serverDeliveryFee = 0
    if (is_delivery) {
      const { data: zones } = await serviceClient
        .from("delivery_zones").select("price").eq("store_id", store_id)
      const allowed = new Set((zones ?? []).map(z => Number(z.price)))
      const claimed = Number(delivery_fee) || 0
      if (!allowed.has(claimed))
        return jsonResponse({ error: "Стоимость доставки не соответствует зонам заведения" }, 400)
      serverDeliveryFee = claimed
    }

    const serverTotal = Math.max(0, fullAmount - serverDiscount) + serverDeliveryFee
    const serverPaymentMethod = serverDiscount <= 0 ? "card"
      : serverDiscount >= fullAmount ? "subscription" : "mixed"
    const orderItemsPayload = safeItems.map(({ _basePrice, _categoryId, ...rest }) => rest)

    // Free order (paid fully by subscription) — create order directly, no payment needed
    if (serverTotal === 0) {
      const { data: order, error: orderError } = await serviceClient
        .from("orders")
        .insert({
          user_id: user.id, store_id, total_amount: 0, status: "paid",
          payment_method: serverPaymentMethod,
          subscription_discount: Math.round(serverDiscount),
          applied_user_subscription_id: subIdApplied,
          is_delivery, delivery_fee, delivery_address, delivery_lat, delivery_lng,
        })
        .select("id").single()

      if (orderError || !order)
        return jsonResponse({ error: "Failed to create order: " + (orderError?.message ?? "unknown") }, 500)

      const { error: itemsError } = await serviceClient.from("order_items").insert(
        orderItemsPayload.map(item => ({ order_id: order.id, ...item }))
      )
      if (itemsError) {
        await serviceClient.from("orders").delete().eq("id", order.id)
        return jsonResponse({ error: "Failed to create order items: " + itemsError.message }, 500)
      }

      if (subIdApplied && serverDiscount > 0) {
        const { error: redemptionError } = await serviceClient.from("subscription_redemptions").insert({
          user_subscription_id: subIdApplied, order_id: order.id, amount_discounted: Math.round(serverDiscount),
        })
        if (redemptionError) {
          // Log but don't fail — order is already confirmed
          console.error("subscription_redemptions insert failed:", redemptionError.message)
        }
        // Списываем ровно столько единиц, сколько покрыл абонемент: раньше
        // remaining_uses не уменьшался вовсе и скидка действовала бесконечно.
        await serviceClient.rpc("consume_subscription_uses", {
          p_user_subscription_id: subIdApplied, p_uses: subUses,
        })
      }
      return jsonResponse({ order_id: order.id, free: true, amount: 0 })
    }

    // Create payment intent (cart data held here until payment confirmed)
    const intentBase = {
      user_id: user.id, store_id,
      items: JSON.parse(JSON.stringify(orderItemsPayload)),
      total_amount: Math.round(serverTotal),
      subscription_discount: Math.round(serverDiscount),
      subscription_uses: subUses,
      applied_user_subscription_id: subIdApplied,
      payment_method: serverPaymentMethod,
      is_delivery, delivery_fee: Math.round(delivery_fee || 0), delivery_address,
      delivery_lat, delivery_lng,
      provider,
    }

    if (provider === "none")
      return jsonResponse({ error: "Настройте провайдера эквайринга в admin → Интернет-эквайринг." }, 400)

    if (provider !== "tinkoff")
      return jsonResponse({ error: "Provider '" + provider + "' not yet supported." }, 400)

    // Get keys from user_payment_settings
    const { data: ups } = await serviceClient
      .from("user_payment_settings")
      .select("terminal_key, secret_key, terminal_key_test, secret_key_test, key_version")
      .eq("user_id", storeData.owner_user_id).maybeSingle()

    const termKeyEnc = isRealMode ? ups?.terminal_key      : ups?.terminal_key_test
    const secretEnc  = isRealMode ? ups?.secret_key        : ups?.secret_key_test

    if (!termKeyEnc || !secretEnc) {
      const mode = isRealMode ? "боевые" : "тестовые"
      await logKeyAccess({ store_id, user_id: user.id, action: isRealMode ? "decrypt_prod" : "decrypt_test", edge_fn: "tbank-init", ip, success: false, detail: "keys_not_configured" })
      return jsonResponse({ error: `Введите ${mode} ключи в admin → Интернет-эквайринг.` }, 400)
    }

    // Create intent first, use its id as T-Bank OrderId
    const { data: intent, error: intentError } = await serviceClient
      .from("payment_intents")
      .insert(intentBase)
      .select("id").single()

    if (intentError || !intent)
      return jsonResponse({ error: "Failed to create payment intent: " + (intentError?.message ?? "unknown") }, 500)

    await logKeyAccess({ store_id, user_id: user.id, action: isRealMode ? "decrypt_prod" : "decrypt_test", edge_fn: "tbank-init", ip, success: true })

    // Decrypt keys — may throw if key is malformed or encryption env var is missing
    let terminalKey: string, password: string
    try {
      const kv = ups?.key_version ?? 1
      terminalKey = await decryptPaymentKey(termKeyEnc, kv)
      password    = await decryptPaymentKey(secretEnc, kv)
    } catch (cryptoErr) {
      await serviceClient.from("payment_intents").delete().eq("id", intent.id)
      const detail = cryptoErr instanceof Error ? cryptoErr.message : String(cryptoErr)
      await logKeyAccess({ store_id, user_id: user.id, action: "decrypt_error", edge_fn: "tbank-init", ip, success: false, detail })
      return jsonResponse({ error: "Ошибка расшифровки ключей: " + detail }, 500)
    }

    const amountKop   = Math.round(serverTotal * 100)
    const scalarParams: Record<string, string | number> = {
      TerminalKey: terminalKey, Amount: amountKop, OrderId: intent.id,
      Description: "Order #" + intent.id.slice(0, 8).toUpperCase(),
      NotificationURL: NOTIFY_URL,
      SuccessURL: success_url ?? SUCCESS_BASE,
      FailURL: fail_url ?? FAIL_BASE,
    }

    // Call T-Bank API — may throw on network error or non-JSON response
    let tData: Record<string, unknown>
    try {
      const tResp = await fetch(TBANK_INIT_URL, { client: tbankHttpClient,
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...scalarParams, Token: await calcToken(scalarParams, password) }),
      })
      tData = await tResp.json()
    } catch (fetchErr) {
      await serviceClient.from("payment_intents").delete().eq("id", intent.id)
      const detail = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      return jsonResponse({ error: "T-Bank connection error: " + detail }, 500)
    }

    if (!tData.Success || !tData.PaymentURL) {
      await serviceClient.from("payment_intents").delete().eq("id", intent.id)
      return jsonResponse({ error: "T-Bank: " + (tData.Message || tData.Details || JSON.stringify(tData)) }, 400)
    }

    // Store T-Bank PaymentId in intent for webhook verification
    await serviceClient.from("payment_intents").update({ provider_payment_id: String(tData.PaymentId) }).eq("id", intent.id)

    return jsonResponse({ intent_id: intent.id, payment_url: tData.PaymentURL, amount: serverTotal })

  } catch (err) {
    console.error("tbank-init unhandled exception:", err)
    const detail = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: "Internal server error: " + detail }, 500)
  }
})
