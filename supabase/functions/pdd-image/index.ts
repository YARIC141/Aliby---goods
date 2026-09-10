/**
 * Edge Function: pdd-image
 *
 * Отдаёт картинки к билетам ПДД (категория A,B, датасет etspring/pdd_russia),
 * которые хранятся прямо в таблице public.pdd_images (bytea), а не в
 * объектном хранилище Beget S3 — статичный одноразовый набор картинок не
 * стоит гонять через внешний S3-прокси. Ответ отдаётся с Cache-Control:
 * immutable, поэтому браузер/service worker тамагочи кэширует картинку
 * после первого показа и повторно за ней на сервер не ходит.
 *
 * GET /functions/v1/pdd-image?id=<hash>
 *   → бинарные данные картинки с Content-Type из БД
 */

const ALLOWED_ORIGINS = [
  'https://alliby.ru',
]

function corsHeadersFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin')
  const cors = corsHeadersFor(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return new Response('Missing id', { status: 400, headers: cors })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!SUPABASE_URL || !SERVICE_KEY) return new Response('Server misconfigured', { status: 500, headers: cors })

  let rpcResp: Response
  try {
    rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_pdd_image`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image_id: id }),
    })
  } catch {
    return new Response('Lookup failed', { status: 502, headers: cors })
  }
  if (!rpcResp.ok) return new Response('Lookup failed', { status: 502, headers: cors })

  const rows = await rpcResp.json()
  const row = Array.isArray(rows) ? rows[0] : rows
  if (!row || !row.data_b64) return new Response('Not found', { status: 404, headers: cors })

  const binary = atob(row.data_b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  return new Response(bytes, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type': row.mime || 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
})
