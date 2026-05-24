/**
 * Edge Function: sign-contract
 * Записывает факт подписания ПЭП (ФЗ-63).
 * IP-адрес берётся из заголовков запроса на стороне сервера.
 *
 * POST /functions/v1/sign-contract
 * Body: { contract, version, doc_hash, accept_text, user_agent? }
 * Response: { ok: true, signature_id, already_signed? }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401)

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  let body: {
    contract?: string
    version?: string
    doc_hash?: string
    accept_text?: string
    user_agent?: string
  }
  try { body = await req.json() }
  catch { return jsonResponse({ error: 'Invalid JSON body' }, 400) }

  const { contract, version, doc_hash, accept_text, user_agent } = body

  if (!contract || !version || !doc_hash || !accept_text) {
    return jsonResponse({ error: 'contract, version, doc_hash, accept_text required' }, 400)
  }
  if (!['buyer', 'seller'].includes(contract)) {
    return jsonResponse({ error: 'contract must be "buyer" or "seller"' }, 400)
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
           ?? req.headers.get('x-real-ip')
           ?? 'unknown'

  const ua = user_agent || req.headers.get('user-agent') || 'unknown'

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Идемпотентность: если уже подписана эта версия — возвращаем существующую запись
  const { data: existing } = await serviceClient
    .from('contract_signatures')
    .select('id')
    .eq('user_id', user.id)
    .eq('contract', contract)
    .eq('version', version)
    .maybeSingle()

  if (existing) {
    return jsonResponse({ ok: true, signature_id: existing.id, already_signed: true })
  }

  const { data: sig, error: sigError } = await serviceClient
    .from('contract_signatures')
    .insert({
      user_id:    user.id,
      contract,
      version,
      doc_hash,
      ip_address: ip,
      user_agent: ua,
      user_email: user.email ?? '',
      accept_text,
    })
    .select('id')
    .single()

  if (sigError || !sig) {
    return jsonResponse({ error: 'Failed to record signature: ' + (sigError?.message ?? 'unknown') }, 500)
  }

  return jsonResponse({ ok: true, signature_id: sig.id })
})
