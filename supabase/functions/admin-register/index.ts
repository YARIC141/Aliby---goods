/**
 * Edge Function: admin-register
 * Регистрирует нового администратора через Admin API (без подтверждения email).
 * Создаёт пользователя, выставляет role='admin' в profiles, возвращает сессию.
 *
 * POST /functions/v1/admin-register
 * Body: { email, password }
 * Response: { access_token, refresh_token, expires_in, token_type, user }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { email, password } = body
  if (!email || !password) return jsonResponse({ error: 'email and password are required' }, 400)
  if (password.length < 6) return jsonResponse({ error: 'Пароль должен быть не менее 6 символов' }, 400)

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Создаём подтверждённого пользователя (email_confirm=true, без письма)
  const { data: newUser, error: createError } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError || !newUser?.user) {
    return jsonResponse({ error: createError?.message ?? 'Failed to create user' }, 400)
  }

  // Upsert профиля с role='admin' — работает независимо от триггера
  const { error: profileError } = await serviceClient
    .from('profiles')
    .upsert({ id: newUser.user.id, role: 'admin' }, { onConflict: 'id' })

  if (profileError) {
    await serviceClient.auth.admin.deleteUser(newUser.user.id)
    return jsonResponse({ error: 'Failed to set admin role: ' + profileError.message }, 500)
  }

  // Входим и возвращаем сессию
  const { data: sessionData, error: signInError } = await serviceClient.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError || !sessionData?.session) {
    return jsonResponse({
      error: 'Пользователь создан, но вход не удался: ' + (signInError?.message ?? 'unknown'),
    }, 500)
  }

  return jsonResponse({
    access_token: sessionData.session.access_token,
    refresh_token: sessionData.session.refresh_token,
    expires_in: sessionData.session.expires_in,
    token_type: 'bearer',
    user: sessionData.user,
  })
})
