/**
 * Edge Function: validate-subscription
 * Проверяет, можно ли применить абонемент к набору позиций заказа.
 * Не изменяет данные — только читает и валидирует.
 *
 * Доступ: авторизованный пользователь (только свои абонементы)
 * POST /functions/v1/validate-subscription
 * Body: {
 *   "user_subscription_id": "<uuid>",
 *   "order_items": [{ "menu_item_id": "<uuid>", "quantity": 2 }]
 * }
 * Response (успех):  { "valid": true,  "discount_amount": 450.00 }
 * Response (отказ):  { "valid": false, "reason": "Дневной лимит исчерпан" }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'

// Временной пояс для проверки расписания.
// Россия/Москва = UTC+3 (без перехода на летнее время с 2014 года).
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000

interface OrderItem {
  menu_item_id: string
  quantity: number
}

interface CoverageRules {
  type: 'all' | 'include_categories' | 'include_items' | 'exclude_items'
  category_ids?: string[]
  item_ids?: string[]
  exclude_items?: string[]
}

interface TimeRules {
  weekdays?: number[]      // 1=Пн … 7=Вс
  time_start?: string      // "HH:MM"
  time_end?: string        // "HH:MM"
  excluded_dates?: string[] // ["YYYY-MM-DD"]
}

interface UsageLimits {
  daily_limit?: number
  min_interval_hours?: number
  min_order_amount?: number
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  let body: { user_subscription_id?: string; order_items?: OrderItem[] }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { user_subscription_id, order_items } = body
  if (!user_subscription_id || !order_items?.length) {
    return jsonResponse({ error: 'user_subscription_id and order_items are required' }, 400)
  }

  // Загружаем абонемент пользователя вместе с планом подписки.
  // RLS гарантирует, что пользователь видит только свои абонементы.
  const { data: userSub, error: usError } = await supabase
    .from('user_subscriptions')
    .select('*, subscriptions(*)')
    .eq('id', user_subscription_id)
    .eq('user_id', user.id)
    .single()

  if (usError || !userSub) {
    return jsonResponse({ valid: false, reason: 'Абонемент не найден' }, 404)
  }

  const sub = userSub.subscriptions as {
    store_id: string
    total_uses: number
    coverage_rules: CoverageRules
    time_rules: TimeRules
    usage_limits: UsageLimits
  }

  // ---- Статус и срок действия ----------------------------------------

  if (userSub.status !== 'active') {
    return jsonResponse({ valid: false, reason: 'Абонемент не активен' })
  }

  if (userSub.end_date && new Date(userSub.end_date) < new Date()) {
    return jsonResponse({ valid: false, reason: 'Срок действия абонемента истёк' })
  }

  if (sub.total_uses > 0 && (userSub.remaining_uses === null || userSub.remaining_uses <= 0)) {
    return jsonResponse({ valid: false, reason: 'Остаток использований исчерпан' })
  }

  // ---- Временные ограничения -----------------------------------------

  const now = new Date()
  const moscowNow = new Date(now.getTime() + MOSCOW_OFFSET_MS)

  const timeRules: TimeRules = sub.time_rules ?? {}
  const usageLimits: UsageLimits = sub.usage_limits ?? {}
  const coverageRules: CoverageRules = sub.coverage_rules ?? { type: 'all' }

  // День недели: 0=Вс → переводим в 1=Пн…7=Вс
  if (timeRules.weekdays?.length) {
    const dayOfWeek = moscowNow.getUTCDay() === 0 ? 7 : moscowNow.getUTCDay()
    if (!timeRules.weekdays.includes(dayOfWeek)) {
      const names = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
      const allowed = timeRules.weekdays.map((d) => names[d]).join(', ')
      return jsonResponse({ valid: false, reason: `Действует только в: ${allowed}` })
    }
  }

  // Время суток (московское)
  if (timeRules.time_start || timeRules.time_end) {
    const hh = String(moscowNow.getUTCHours()).padStart(2, '0')
    const mm = String(moscowNow.getUTCMinutes()).padStart(2, '0')
    const currentTime = `${hh}:${mm}`

    const start = timeRules.time_start ?? '00:00'
    const end = timeRules.time_end ?? '23:59'

    if (currentTime < start || currentTime > end) {
      return jsonResponse({ valid: false, reason: `Действует только с ${start} до ${end}` })
    }
  }

  // Запрещённые даты (московские)
  if (timeRules.excluded_dates?.length) {
    const todayMoscow = moscowNow.toISOString().split('T')[0]
    if (timeRules.excluded_dates.includes(todayMoscow)) {
      return jsonResponse({ valid: false, reason: 'Абонемент не действует в этот день' })
    }
  }

  // ---- Лимиты использования ------------------------------------------

  if (usageLimits.daily_limit) {
    let usedToday = userSub.used_today ?? 0

    if (userSub.last_used_at) {
      const lastDate = new Date(
        new Date(userSub.last_used_at).getTime() + MOSCOW_OFFSET_MS,
      ).toISOString().split('T')[0]
      const today = moscowNow.toISOString().split('T')[0]
      if (lastDate < today) usedToday = 0
    }

    if (usedToday >= usageLimits.daily_limit) {
      return jsonResponse({ valid: false, reason: 'Дневной лимит использований исчерпан' })
    }
  }

  if (usageLimits.min_interval_hours && userSub.last_used_at) {
    const msSinceLast = now.getTime() - new Date(userSub.last_used_at).getTime()
    const hoursSinceLast = msSinceLast / (1000 * 60 * 60)
    if (hoursSinceLast < usageLimits.min_interval_hours) {
      return jsonResponse({
        valid: false,
        reason: `Минимальный интервал между списаниями не выдержан`,
      })
    }
  }

  // ---- Загрузка позиций меню -----------------------------------------

  const menuItemIds = order_items.map((i) => i.menu_item_id)

  const { data: menuItems, error: menuError } = await supabase
    .from('menu_items')
    .select('id, name, price, category_id, store_id, is_available')
    .in('id', menuItemIds)

  if (menuError || !menuItems) {
    return jsonResponse({ error: 'Не удалось загрузить позиции меню' }, 500)
  }

  // Проверяем, что все блюда принадлежат заведению абонемента
  for (const item of menuItems) {
    if (item.store_id !== sub.store_id) {
      return jsonResponse({
        valid: false,
        reason: `Блюдо "${item.name}" не относится к данному заведению`,
      })
    }
  }

  // ---- Проверка правил покрытия --------------------------------------

  const menuItemMap = new Map(menuItems.map((i) => [i.id, i]))
  const coveredItemIds: Set<string> = new Set()

  for (const item of menuItems) {
    switch (coverageRules.type) {
      case 'all': {
        coveredItemIds.add(item.id)
        break
      }
      case 'include_categories': {
        const inCategory = item.category_id && coverageRules.category_ids?.includes(item.category_id)
        const excluded = coverageRules.exclude_items?.includes(item.id)
        if (!inCategory || excluded) {
          return jsonResponse({ valid: false, reason: `Абонемент не покрывает блюдо "${item.name}"` })
        }
        coveredItemIds.add(item.id)
        break
      }
      case 'include_items': {
        if (!coverageRules.item_ids?.includes(item.id)) {
          return jsonResponse({ valid: false, reason: `Абонемент не покрывает блюдо "${item.name}"` })
        }
        coveredItemIds.add(item.id)
        break
      }
      case 'exclude_items': {
        if (coverageRules.exclude_items?.includes(item.id)) {
          return jsonResponse({ valid: false, reason: `Абонемент не покрывает блюдо "${item.name}"` })
        }
        coveredItemIds.add(item.id)
        break
      }
    }
  }

  // ---- Расчёт скидки -------------------------------------------------

  let discountAmount = 0
  for (const orderItem of order_items) {
    const menuItem = menuItemMap.get(orderItem.menu_item_id)
    if (menuItem && coveredItemIds.has(orderItem.menu_item_id)) {
      discountAmount += Number(menuItem.price) * orderItem.quantity
    }
  }

  // Минимальная сумма заказа для применения абонемента
  if (usageLimits.min_order_amount && discountAmount < usageLimits.min_order_amount) {
    return jsonResponse({
      valid: false,
      reason: `Сумма заказа ниже минимальной (${usageLimits.min_order_amount} руб.)`,
    })
  }

  return jsonResponse({ valid: true, discount_amount: discountAmount })
})
