const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const LAYER_FN: Record<string, string> = {
  buildings: 'import_vm_buildings',
  roads:     'import_vm_roads',
  places:    'import_vm_places',
  land_use:  'import_vm_land_use',
  water:     'import_vm_water',
  addresses: 'import_vm_addresses',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  let body: { layer?: string; features?: unknown[] }
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  const layer = body.layer ?? ''
  const rpcFn = LAYER_FN[layer]
  if (!rpcFn) {
    return new Response(JSON.stringify({ error: `layer must be one of: ${Object.keys(LAYER_FN).join(', ')}` }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  const features = body.features
  if (!Array.isArray(features) || features.length === 0) {
    return new Response(JSON.stringify({ error: 'features must be a non-empty array' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  const BATCH = 500
  let inserted = 0

  for (let i = 0; i < features.length; i += BATCH) {
    const chunk = features.slice(i, i + BATCH)
    const rpcResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpcFn}`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ features: chunk }),
    })

    if (!rpcResp.ok) {
      const err = await rpcResp.text()
      return new Response(JSON.stringify({ error: err, inserted }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const count: number = await rpcResp.json()
    inserted += count
  }

  return new Response(JSON.stringify({ ok: true, layer, inserted }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
