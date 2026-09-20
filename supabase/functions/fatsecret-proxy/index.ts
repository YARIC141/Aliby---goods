/**
 * Edge Function: fatsecret-proxy
 *
 * Прокси между tamagotchi/index.html и FatSecret Platform API — ключи
 * (FATSECRET_CLIENT_ID/FATSECRET_CLIENT_SECRET) живут только здесь, страница
 * тамагочи статическая и не может держать секреты в открытом виде. OAuth2
 * client_credentials токен кешируется в памяти модуля между тёплыми вызовами.
 *
 * GET /functions/v1/fatsecret-proxy?action=search&q=<текст>
 * GET /functions/v1/fatsecret-proxy?action=detail&food_id=<id>
 * GET /functions/v1/fatsecret-proxy?action=barcode&code=<цифры>
 *
 * Ответы нормализованы под нужды клиента:
 *  search  → { items: [{ food_id, name, brand, description }] }
 *  detail  → { name, per1g: {kcal,protein,fat,carb}, servingHint: {isGrams, amount, label} }
 *  barcode → то же, что detail, либо { error } если код не найден
 *
 * Штрихкод (food/barcode/find-by-id) требует scope "barcode", который FatSecret
 * выдаёт только на платных тарифах (Premier / Premier Free) — на бесплатном
 * Basic он вернётся ошибкой самого FatSecret, которую отдаём клиенту как есть.
 */

const ALLOWED_ORIGINS = ['https://alliby.ru']

function corsHeadersFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
}

function jsonResponse(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeadersFor(origin), 'Content-Type': 'application/json' },
  })
}

const tokenCache = new Map<string, { value: string; expiresAt: number }>()

async function getAccessToken(scope: string): Promise<string> {
  const cached = tokenCache.get(scope)
  if (cached && cached.expiresAt > Date.now() + 10_000) return cached.value

  const clientId = Deno.env.get('FATSECRET_CLIENT_ID')
  const clientSecret = Deno.env.get('FATSECRET_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('not configured')

  const res = await fetch('https://oauth.fatsecret.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${clientId}:${clientSecret}`),
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
  })
  if (!res.ok) throw new Error('FatSecret auth failed: ' + res.status)
  const data = await res.json()
  const token = { value: data.access_token as string, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
  tokenCache.set(scope, token)
  return token.value
}

async function fatsecretGet(path: string, params: Record<string, string>, scope: string) {
  const token = await getAccessToken(scope)
  const url = new URL(`https://platform.fatsecret.com/rest/${path}`)
  url.searchParams.set('format', 'json')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const data = await res.json().catch(() => ({}))
  // FatSecret возвращает HTTP 200 даже при логической ошибке (например, IP не
  // в allowlist аккаунта) — тело в этом случае {"error": {code, message}}, что
  // не отражается в res.ok, поэтому проверяем его отдельно.
  const apiError = data && typeof data === 'object' ? (data as any).error : undefined
  return { ok: res.ok && !apiError, status: res.status, data, errorMessage: apiError?.message as string | undefined }
}

// FatSecret отдаёт одиночный элемент как объект, а не массив из одного
// элемента — везде, где может быть и то, и другое, нормализуем в массив.
function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

function pickServing(servings: any[]): any | null {
  if (!servings.length) return null
  const grams = servings.find((s) => s.metric_serving_unit === 'g' && parseFloat(s.metric_serving_amount) > 0)
  return grams || servings[0]
}

function per1gFromServing(serving: any): { per1g: any; servingHint: any } | null {
  const kcal = parseFloat(serving.calories)
  const protein = parseFloat(serving.protein)
  const fat = parseFloat(serving.fat)
  const carb = parseFloat(serving.carbohydrate)
  if (![kcal, protein, fat, carb].every((n) => !isNaN(n))) return null

  const gramsAmount = serving.metric_serving_unit === 'g' ? parseFloat(serving.metric_serving_amount) : null
  if (gramsAmount && gramsAmount > 0) {
    return {
      per1g: { kcal: kcal / gramsAmount, protein: protein / gramsAmount, fat: fat / gramsAmount, carb: carb / gramsAmount },
      servingHint: { isGrams: true, amount: gramsAmount, label: 'г' },
    }
  }
  // Нет граммового эквивалента (иногда бывает у штучных брендовых товаров) —
  // считаем "на 1 порцию" и просим у пользователя количество порций, а не грамм.
  return {
    per1g: { kcal, protein, fat, carb },
    servingHint: { isGrams: false, amount: 1, label: serving.serving_description || 'порция' },
  }
}

async function foodDetailById(foodId: string) {
  const { ok, data, errorMessage } = await fatsecretGet('food/v4', { food_id: foodId }, 'basic')
  const food = data?.food
  if (!ok || !food) return { error: errorMessage || 'Продукт не найден в FatSecret' }
  const servings = asArray(food?.servings?.serving)
  const serving = pickServing(servings)
  if (!serving) return { error: 'У продукта нет данных о порциях' }
  const norm = per1gFromServing(serving)
  if (!norm) return { error: 'Не удалось разобрать данные о продукте' }
  return { name: food.food_name, per1g: norm.per1g, servingHint: norm.servingHint }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeadersFor(origin) })
  if (req.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, origin)

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  try {
    if (action === 'search') {
      const q = (url.searchParams.get('q') || '').trim()
      if (!q) return jsonResponse({ error: 'q is required' }, 400, origin)
      const { ok, data, errorMessage } = await fatsecretGet('foods/search/v1', { search_expression: q, max_results: '15' }, 'basic')
      if (!ok) return jsonResponse({ error: errorMessage || 'FatSecret error' }, 502, origin)
      const foods = asArray(data?.foods?.food)
      const items = foods.map((f: any) => ({
        food_id: f.food_id,
        name: f.food_name,
        brand: f.brand_name || null,
        description: f.food_description || null,
      }))
      return jsonResponse({ items }, 200, origin)
    }

    if (action === 'detail') {
      const foodId = url.searchParams.get('food_id') || ''
      if (!foodId) return jsonResponse({ error: 'food_id is required' }, 400, origin)
      const result = await foodDetailById(foodId)
      return jsonResponse(result, 'error' in result ? 404 : 200, origin)
    }

    if (action === 'barcode') {
      const code = (url.searchParams.get('code') || '').replace(/\D/g, '')
      if (!code) return jsonResponse({ error: 'code is required' }, 400, origin)
      const gtin13 = code.padStart(13, '0')
      const { ok, data, errorMessage } = await fatsecretGet('food/barcode/find-by-id/v1', { barcode: gtin13 }, 'basic barcode')
      const foodId = data?.food_id?.value
      if (!ok || !foodId || foodId === '0') {
        return jsonResponse({ error: errorMessage || 'Продукт с таким штрихкодом не найден в FatSecret' }, 404, origin)
      }
      const result = await foodDetailById(foodId)
      return jsonResponse(result, 'error' in result ? 404 : 200, origin)
    }

    return jsonResponse({ error: 'Unknown action' }, 400, origin)
  } catch (e) {
    console.error('fatsecret-proxy error', e)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    const isConfig = msg.includes('not configured')
    return jsonResponse({ error: isConfig ? 'FatSecret API ещё не настроен на сервере' : 'FatSecret request failed' }, 503, origin)
  }
})
