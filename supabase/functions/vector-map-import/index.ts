import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ALLOWED_EMAIL = 'yarich92@gmail.com'

const LAYER_FN: Record<string, string> = {
  buildings: 'import_vm_buildings',
  roads:     'import_vm_roads',
  places:    'import_vm_places',
  land_use:  'import_vm_land_use',
  water:     'import_vm_water',
  addresses: 'import_vm_addresses',
}

const err = (msg: string, status = 400) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS })

  // ── Auth: только ALLOWED_EMAIL ──────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return err('Unauthorized', 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user || user.email !== ALLOWED_EMAIL) return err('Forbidden', 403)

  // ── Тело запроса ────────────────────────────────────────────
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  let body: { layer?: string; features?: unknown[] }
  try { body = await req.json() } catch {
    return err('Invalid JSON')
  }

  const layer = body.layer ?? ''
  const rpcFn = LAYER_FN[layer]
  if (!rpcFn) return err(`layer must be one of: ${Object.keys(LAYER_FN).join(', ')}`)

  const features = body.features
  if (!Array.isArray(features) || features.length === 0) return err('features must be a non-empty array')

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
      const errText = await rpcResp.text()
      return new Response(JSON.stringify({ error: errText, inserted }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
    }

    const count: number = await rpcResp.json()
    inserted += count
  }

  return new Response(JSON.stringify({ ok: true, layer, inserted }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
})
