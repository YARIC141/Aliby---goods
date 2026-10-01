/**
 * Edge Function: off-proxy
 *
 * Прокси к Open Food Facts для tamagotchi/index.html: search.openfoodfacts.org не отдаёт
 * CORS-заголовки, поэтому из браузера/WebView напрямую запрос блокируется.
 *
 * GET /functions/v1/off-proxy?action=search&q=<текст>[&langs=ru]
 * GET /functions/v1/off-proxy?action=barcode&code=<цифры>
 * Ответ — JSON Open Food Facts как есть (нормализует клиент).
 */

const ALLOWED_ORIGINS = ['https://alliby.ru']
const FIELDS = 'code,product_name,brands,nutriments,serving_quantity'
const UA = 'Alliby/1.0 (alliby.app@gmail.com)'

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
}

function json(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(origin), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) })

  const url = new URL(req.url)
  const action = url.searchParams.get('action')
  let target: string
  if (action === 'search') {
    const q = (url.searchParams.get('q') || '').trim().slice(0, 100)
    if (!q) return json({ error: 'q required' }, 400, origin)
    const langs = url.searchParams.get('langs') === 'ru' ? '&langs=ru' : ''
    target = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=15${langs}&fields=${FIELDS}`
  } else if (action === 'barcode') {
    const code = (url.searchParams.get('code') || '').replace(/\D/g, '')
    if (!code || code.length > 14) return json({ error: 'bad code' }, 400, origin)
    target = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`
  } else {
    return json({ error: 'unknown action' }, 400, origin)
  }

  try {
    const r = await fetch(target, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    const body = await r.text()
    return new Response(body, {
      status: r.status === 404 ? 200 : r.status,
      headers: { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
    })
  } catch (_e) {
    return json({ error: 'Open Food Facts недоступен' }, 502, origin)
  }
})
