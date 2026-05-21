const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // Только авторизованные пользователи
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401, headers: CORS })
  }
  try {
    const payload = JSON.parse(atob(authHeader.slice(7).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.role !== 'authenticated') {
      return new Response('Unauthorized', { status: 401, headers: CORS })
    }
  } catch {
    return new Response('Unauthorized', { status: 401, headers: CORS })
  }

  const url = new URL(req.url)
  const parts = url.pathname.split('/').filter(Boolean)
  const [z, x, y] = parts.slice(-3).map(Number)

  if ([z, x, y].some(isNaN) || z < 0 || z > 20) {
    return new Response('Invalid tile coordinates', { status: 400, headers: CORS })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_vector_tile`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ z, x, y }),
  })

  if (!rpcResp.ok) {
    const err = await rpcResp.text()
    console.error(`Tile ${z}/${x}/${y} RPC error:`, err)
    return new Response(JSON.stringify({ error: err }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // PostgREST returns text as JSON string e.g. "base64data..."
  const b64: string = await rpcResp.json()

  const binary = b64 ? atob(b64.replace(/\s/g, '')) : ''
  const tileBytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) tileBytes[i] = binary.charCodeAt(i)

  return new Response(tileBytes, {
    status: 200,
    headers: {
      ...CORS,
      'Content-Type': 'application/x-protobuf',
      'Cache-Control': 'public, max-age=2592000, stale-while-revalidate=86400',
    },
  })
})
