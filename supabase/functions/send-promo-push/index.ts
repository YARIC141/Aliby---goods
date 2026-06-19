/**
 * Edge Function: send-promo-push
 *
 * Отправляет промо-пуш всем покупателям магазина, делавшим заказ за последние N дней.
 * Вызывается из admin-панели владельцем магазина.
 *
 * POST /functions/v1/send-promo-push
 * Headers: Authorization: Bearer <owner JWT>
 * Body: { store_id, days, title, body }
 *   days: 7 | 30 | 90
 *   title: строка (макс 64 символа)
 *   body:  строка (макс 200 символов)
 *
 * Response: { sent: number, skipped: number }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.107.0'
import { corsHeaders, handleCors, jsonResponse } from '../_shared/cors.ts'

const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID')!
const FCM_SA_RAW     = Deno.env.get('FCM_SERVICE_ACCOUNT')!

function _pemToBuf(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const bin  = atob(b64)
  const buf  = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

async function getFcmAccessToken(): Promise<string> {
  const sa  = JSON.parse(FCM_SA_RAW)
  const now = Math.floor(Date.now() / 1000)
  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  })}`
  const key = await crypto.subtle.importKey(
    'pkcs8', _pemToBuf(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const jwt = `${unsigned}.${btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const { access_token } = await resp.json()
  return access_token
}

async function sendFcm(token: string, title: string, body: string): Promise<boolean> {
  try {
    const accessToken = await getFcmAccessToken()
    const resp = await fetch(
      `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: { type: 'promo' },
            android: {
              priority: 'normal',
              notification: { sound: 'default', channel_id: 'alliby_orders' },
            },
            apns: { payload: { aps: { sound: 'default' } } },
          },
        }),
      }
    )
    return resp.ok
  } catch {
    return false
  }
}

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req)
  if (corsResp) return corsResp

  const sbUrl     = Deno.env.get('SUPABASE_URL')!
  const sbAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const sbSvcKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Аутентификация по JWT владельца
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401)

  const userClient = createClient(sbUrl, sbAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  let payload: { store_id?: string; days?: number; title?: string; body?: string }
  try { payload = await req.json() } catch { return jsonResponse({ error: 'Bad JSON' }, 400) }

  const { store_id, days, title, body } = payload
  if (!store_id || !days || !title || !body)
    return jsonResponse({ error: 'store_id, days, title, body are required' }, 400)
  if (![7, 30, 90].includes(days))
    return jsonResponse({ error: 'days must be 7, 30 or 90' }, 400)
  if (title.length > 64 || body.length > 200)
    return jsonResponse({ error: 'title max 64, body max 200 chars' }, 400)

  const svcClient = createClient(sbUrl, sbSvcKey)

  // Проверяем что магазин принадлежит этому пользователю
  const { data: store } = await svcClient
    .from('stores')
    .select('id')
    .eq('id', store_id)
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!store) return jsonResponse({ error: 'Store not found or access denied' }, 403)

  // Проверяем активную подписку платформы
  const today = new Date().toISOString().split('T')[0]
  const { data: platSub } = await svcClient
    .from('platform_subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['active', 'grace'])
    .gte('end_date', today)
    .limit(1)
    .maybeSingle()
  if (!platSub) return jsonResponse({ error: 'Active platform subscription required' }, 403)

  // Уникальные покупатели за последние N дней
  const since = new Date(Date.now() - days * 86400_000).toISOString()
  const { data: orders } = await svcClient
    .from('orders')
    .select('user_id')
    .eq('store_id', store_id)
    .in('status', ['paid', 'ready', 'issued'])
    .gte('order_time', since)

  if (!orders?.length) return jsonResponse({ sent: 0, skipped: 0 })

  const uniqueUserIds = [...new Set(orders.map((o: { user_id: string }) => o.user_id))]

  // FCM-токены всех найденных пользователей
  const { data: subs } = await svcClient
    .from('push_subscriptions')
    .select('user_id, device_token')
    .in('user_id', uniqueUserIds)
    .eq('app', 'client')
    .not('device_token', 'is', null)

  if (!subs?.length) return jsonResponse({ sent: 0, skipped: uniqueUserIds.length })

  // Отправляем пуши
  const results = await Promise.allSettled(
    subs.map((s: { device_token: string }) => sendFcm(s.device_token, title, body))
  )

  const sent    = results.filter(r => r.status === 'fulfilled' && r.value).length
  const skipped = uniqueUserIds.length - sent

  return jsonResponse({ sent, skipped })
})
