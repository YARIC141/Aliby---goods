import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Auth check
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.slice(7))
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // Admin check
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // Parse multipart form
  let formData: FormData
  try { formData = await req.formData() } catch {
    return new Response(JSON.stringify({ error: 'Invalid form data' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const file = formData.get('image') as File | null
  if (!file) {
    return new Response(JSON.stringify({ error: 'No image file' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const mime = file.type
  if (!['image/png', 'image/jpeg'].includes(mime)) {
    return new Response(JSON.stringify({ error: 'Invalid type. Use PNG or JPEG.' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
  if (file.size > 20 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: 'File too large (max 20 MB)' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const width  = parseInt(formData.get('width')?.toString()  ?? '0')
  const height = parseInt(formData.get('height')?.toString() ?? '0')
  if (!width || !height || width > 5000 || height > 5000) {
    return new Response(JSON.stringify({ error: 'Invalid dimensions (max 5000×5000)' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // Delete existing maps (cascade removes markers)
  await supabase.from('maps').delete().neq('id', '00000000-0000-0000-0000-000000000000')

  // Clear storage bucket
  const { data: existingFiles } = await supabase.storage.from('maps').list()
  if (existingFiles?.length) {
    await supabase.storage.from('maps').remove(existingFiles.map(f => f.name))
  }

  // Upload image
  const ext      = mime === 'image/png' ? 'png' : 'jpg'
  const filename = `map.${ext}`
  const buffer   = await file.arrayBuffer()

  const { error: uploadErr } = await supabase.storage
    .from('maps')
    .upload(filename, buffer, { contentType: mime, upsert: true })

  if (uploadErr) {
    return new Response(JSON.stringify({ error: 'Upload failed: ' + uploadErr.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  // Insert DB record
  const { data: mapRow, error: dbErr } = await supabase
    .from('maps')
    .insert({ storage_path: filename, mime_type: mime, width, height })
    .select()
    .single()

  if (dbErr) {
    return new Response(JSON.stringify({ error: 'DB error: ' + dbErr.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const { data: urlData } = supabase.storage.from('maps').getPublicUrl(filename)

  return new Response(
    JSON.stringify({ id: mapRow.id, width, height, url: urlData.publicUrl }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } },
  )
})
