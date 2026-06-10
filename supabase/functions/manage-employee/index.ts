/**
 * Edge Function: manage-employee
 * Управление сотрудниками заведений.
 *
 * POST   — создать сотрудника
 * DELETE — удалить сотрудника
 * PUT    — сбросить пароль
 *
 * Все операции требуют роли admin у вызывающего.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleCors, jsonResponse } from '../_shared/cors.ts'

const INTERNAL_DOMAIN = 'alliby.internal'

// Транслитерация для формирования логина
function transliterate(str: string): string {
  const map: Record<string, string> = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z',
    'и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
    'с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch',
    'ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
  }
  return str.toLowerCase()
    .split('').map(c => map[c] ?? (/[a-z0-9]/.test(c) ? c : '_')).join('')
    .replace(/_+/g, '_').replace(/^_+|_+$/g, '')
}

function buildLogin(storeName: string, fullName: string, phone: string): string {
  const storeSlug = transliterate(storeName).slice(0, 20)
  const nameSlug  = transliterate(fullName).slice(0, 20)
  const phoneDigits = phone.replace(/\D/g, '').slice(-10)
  return `${storeSlug}_${nameSlug}_${phoneDigits}`
}

Deno.serve(async (req: Request) => {
  const cors = handleCors(req)
  if (cors) return cors

  // Проверяем авторизацию
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return jsonResponse({ error: 'Unauthorized' }, 401)

  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Получаем профиль вызывающего
  const { data: { user: caller } } = await serviceClient.auth.getUser(token)
  if (!caller) return jsonResponse({ error: 'Invalid token' }, 401)

  const { data: callerProfile } = await serviceClient
    .from('profiles').select('role').eq('id', caller.id).single()
  if (callerProfile?.role !== 'admin') return jsonResponse({ error: 'Forbidden' }, 403)

  const method = req.method.toUpperCase()

  // ── CREATE ────────────────────────────────────────────────
  if (method === 'POST') {
    const body: { full_name?: string; phone?: string; store_id?: string; password?: string; store_name?: string } = await req.json()
    const { full_name, phone, store_id, password, store_name } = body

    if (!full_name || !phone || !store_id || !password || !store_name)
      return jsonResponse({ error: 'full_name, phone, store_id, password, store_name required' }, 400)
    if (password.length < 6)
      return jsonResponse({ error: 'Пароль должен быть не менее 6 символов' }, 400)

    const login = buildLogin(store_name, full_name, phone)
    const email = `${login}@${INTERNAL_DOMAIN}`

    const { data: newUser, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError || !newUser?.user)
      return jsonResponse({ error: createError?.message ?? 'Failed to create user' }, 400)

    const { error: profError } = await serviceClient.from('profiles').upsert({
      id:                 newUser.user.id,
      role:               'employee',
      full_name:          full_name.trim(),
      phone:              phone.trim(),
      employee_store_id:  store_id,
      employee_login:     login,
      employee_password:  password,
    }, { onConflict: 'id' })

    if (profError) {
      await serviceClient.auth.admin.deleteUser(newUser.user.id)
      return jsonResponse({ error: 'Profile error: ' + profError.message }, 500)
    }

    return jsonResponse({ id: newUser.user.id, login, email })
  }

  // ── DELETE ────────────────────────────────────────────────
  if (method === 'DELETE') {
    const body: { employee_id?: string } = await req.json()
    if (!body.employee_id) return jsonResponse({ error: 'employee_id required' }, 400)

    // Убеждаемся что удаляем именно сотрудника (не другого админа)
    const { data: emp } = await serviceClient
      .from('profiles').select('role').eq('id', body.employee_id).single()
    if (emp?.role !== 'employee') return jsonResponse({ error: 'Not an employee' }, 400)

    const { error } = await serviceClient.auth.admin.deleteUser(body.employee_id)
    if (error) return jsonResponse({ error: error.message }, 500)

    return jsonResponse({ ok: true })
  }

  // ── RESET PASSWORD ────────────────────────────────────────
  if (method === 'PUT') {
    const body: { employee_id?: string; new_password?: string } = await req.json()
    const { employee_id, new_password } = body
    if (!employee_id || !new_password) return jsonResponse({ error: 'employee_id, new_password required' }, 400)
    if (new_password.length < 6) return jsonResponse({ error: 'Пароль должен быть не менее 6 символов' }, 400)

    const { error: authErr } = await serviceClient.auth.admin.updateUserById(employee_id, { password: new_password })
    if (authErr) return jsonResponse({ error: authErr.message }, 500)

    await serviceClient.from('profiles')
      .update({ employee_password: new_password })
      .eq('id', employee_id)

    return jsonResponse({ ok: true })
  }

  return jsonResponse({ error: 'Method not allowed' }, 405)
})
