/**
 * Edge Function: send-push
 *
 * Отправляет push-уведомление конкретному пользователю через FCM HTTP v1.
 * Вызывается из DB webhook или других Edge Functions при смене статуса заказа.
 *
 * POST /functions/v1/send-push
 * Body: { user_id, type, title?, body?, data? }
 *
 * Переменные окружения (Supabase Dashboard → Settings → Edge Functions):
 *   FCM_PROJECT_ID       — Firebase project ID (напр. "alliby-app")
 *   FCM_SERVICE_ACCOUNT  — JSON строка service account key (из Firebase Console)
 *   PUSH_WEBHOOK_SECRET  — секрет для защиты endpoint
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.107.0'

const FCM_PROJECT_ID    = Deno.env.get('FCM_PROJECT_ID')!
const FCM_SA_RAW        = Deno.env.get('FCM_SERVICE_ACCOUNT')!
const WEBHOOK_SECRET    = Deno.env.get('PUSH_WEBHOOK_SECRET')!

// ─── FCM OAuth2 via Service Account ──────────────────────────────────────────

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
    iat: now,
    exp: now + 3600,
  })}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    _pemToBuf(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
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

async function sendFcm(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>
) {
  const accessToken = await getFcmAccessToken()
  const resp = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data,
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channel_id: 'alliby_orders',
              image: 'https://alliby.ru/icons/notification-large.png',
            },
          },
          apns: {
            payload: { aps: { sound: 'default', badge: 1 } },
          },
        },
      }),
    }
  )
  const result = await resp.json()
  if (!resp.ok) throw new Error(JSON.stringify(result))
  return result
}

// ─── Push шаблоны ────────────────────────────────────────────────────────────

type Tpl = (d: Record<string, string>) => { title: string; body: string }

const PUSH_TEMPLATES: Record<string, Tpl> = {
  order_in_progress: () => ({ title: '🍳 Готовим ваш заказ',    body: 'Заказ принят в работу'                  }),
  order_ready:       () => ({ title: '✅ Заказ готов!',          body: 'Можно забирать'                          }),
  order_issued:      () => ({ title: 'Заказ выдан',              body: 'Спасибо что выбрали нас!'               }),
  order_cancelled:   () => ({ title: 'Заказ отменён',            body: 'Обратитесь в заведение за деталями'     }),
  booking_confirmed: () => ({ title: '📅 Запись подтверждена',   body: 'Ваша запись успешно создана'            }),
  booking_cancelled: () => ({ title: 'Запись отменена',          body: 'Слот был освобождён'                    }),
  subscription_low:  (d) => ({ title: '⚠️ Абонемент заканчивается', body: `Осталось ${d.remaining} посещений`  }),
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })

  // Проверяем секрет (вызывается из DB webhook или других edge functions)
  const secret = req.headers.get('x-push-secret')
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const sbUrl = Deno.env.get('SUPABASE_URL')!
  const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const serviceClient = createClient(sbUrl, sbKey)

  let payload: {
    user_id?: string
    type?: string
    title?: string
    body?: string
    data?: Record<string, string>
  }
  try { payload = await req.json() } catch { return new Response('Bad JSON', { status: 400 }) }

  const { user_id, type, data = {} } = payload
  if (!user_id || !type) return new Response('user_id and type are required', { status: 400 })

  // Только FCM (native Android / iOS) — заказы не нужны на PWA
  const { data: sub } = await serviceClient
    .from('push_subscriptions')
    .select('device_token')
    .eq('user_id', user_id)
    .eq('app', 'client')
    .eq('platform', 'android')
    .maybeSingle()

  const tpl = PUSH_TEMPLATES[type]
  const { title, body } = tpl
    ? tpl(data)
    : { title: payload.title ?? 'Alliby', body: payload.body ?? '' }

  if (!sub?.device_token) {
    return new Response(JSON.stringify({ skipped: 'no_token' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    await sendFcm(sub.device_token, title, body, { type, ...data })
    return new Response(JSON.stringify({ sent: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('FCM send error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
