/**
 * Edge Function: upload-media
 * Uploads/deletes images in Beget S3. Credentials never leave the server.
 * Auth: requires valid Supabase JWT with admin or owner role.
 *
 * POST   /functions/v1/upload-media  multipart/form-data { file, prefix? }
 *   → { url: "https://s3.ru1.storage.beget.cloud/bucket/key" }
 *
 * DELETE /functions/v1/upload-media  JSON { key: "menu/user_uuid.jpg" }
 *   → 204 No Content
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { AwsClient }    from 'https://esm.sh/aws4fetch@1.0.20'

const BUCKET   = '7e1578c73dcc-alliby-media'
const ENDPOINT = 'https://s3.ru1.storage.beget.cloud'
const REGION   = 'ru1'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED   = new Set(['image/jpeg', 'image/png', 'image/webp'])

async function getAuthedProfile(req: Request) {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!jwt) return null
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const { data: { user } } = await supabase.auth.getUser(jwt)
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['admin', 'owner'].includes(profile.role)) return null
  return user
}

function makeAws() {
  return new AwsClient({
    accessKeyId:     Deno.env.get('BEGET_S3_ACCESS_KEY')!,
    secretAccessKey: Deno.env.get('BEGET_S3_SECRET_KEY')!,
    region:          REGION,
    service:         's3',
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200 })

  const user = await getAuthedProfile(req)
  if (!user) return new Response('Unauthorized', { status: 401 })

  // ── DELETE ──────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { key } = await req.json().catch(() => ({}))
    if (!key) return new Response('Missing key', { status: 400 })
    const url = `${ENDPOINT}/${BUCKET}/${key}`
    const resp = await makeAws().fetch(url, { method: 'DELETE' })
    if (!resp.ok && resp.status !== 404) {
      console.error('[upload-media] S3 delete error:', resp.status, await resp.text())
      return new Response('Delete failed', { status: 502 })
    }
    return new Response(null, { status: 204 })
  }

  // ── POST (upload) ────────────────────────────────────────────
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  let formData: FormData
  try { formData = await req.formData() } catch {
    return new Response('Invalid form data', { status: 400 })
  }

  const file = formData.get('file') as File | null
  if (!file)                 return new Response('Missing file field', { status: 400 })
  if (!ALLOWED.has(file.type)) return new Response('Unsupported type. Use jpeg/png/webp.', { status: 415 })
  if (file.size > MAX_BYTES)   return new Response('File too large (max 5 MB)', { status: 413 })

  const prefix = (formData.get('prefix') as string | null) || 'menu'
  const ext    = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]
  const key    = `${prefix}/${user.id}_${crypto.randomUUID()}.${ext}`
  const body   = await file.arrayBuffer()

  const s3Resp = await makeAws().fetch(`${ENDPOINT}/${BUCKET}/${key}`, {
    method:  'PUT',
    headers: {
      'Content-Type':   file.type,
      'Content-Length': String(body.byteLength),
      'x-amz-acl':     'public-read',
    },
    body,
  })

  if (!s3Resp.ok) {
    console.error('[upload-media] S3 upload error:', s3Resp.status, await s3Resp.text())
    return new Response('Storage upload failed', { status: 502 })
  }

  return new Response(
    JSON.stringify({ url: `${ENDPOINT}/${BUCKET}/${key}`, key }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
})
