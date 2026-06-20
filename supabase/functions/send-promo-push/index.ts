/**
 * Edge Function: send-promo-push
 *
 * Отправляет промо-пуш всем покупателям магазина за последние N дней.
 * Поддерживает FCM (Android/iOS) и Web Push (VAPID, PWA).
 *
 * POST /functions/v1/send-promo-push
 * Headers: Authorization: Bearer <owner JWT>
 * Body: { store_id, days, body }
 *   days: 7 | 30 | 90
 *   body: строка (макс 200 символов)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.107.0'
import { corsHeaders, handleCors, jsonResponse } from '../_shared/cors.ts'

const FCM_PROJECT_ID = Deno.env.get('FCM_PROJECT_ID')!
const FCM_SA_RAW     = Deno.env.get('FCM_SERVICE_ACCOUNT')!

// ── Utilities ────────────────────────────────────────────────────────────────

function b64url(buf: Uint8Array | ArrayBuffer): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function decodeb64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(pad + '='.repeat((4 - pad.length % 4) % 4)), c => c.charCodeAt(0))
}

function _pemToBuf(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const bin  = atob(b64)
  const buf  = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

// ── FCM (Android / iOS) ──────────────────────────────────────────────────────

async function getFcmAccessToken(): Promise<string> {
  const sa  = JSON.parse(FCM_SA_RAW)
  const now = Math.floor(Date.now() / 1000)
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
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

async function sendFcm(token: string, title: string, body: string, storeId: string, storeDir: string): Promise<boolean> {
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
            data: { type: 'promo', store_id: storeId, store_direction: storeDir },
            android: { priority: 'normal', notification: { sound: 'default', channel_id: 'alliby_orders' } },
            apns: { payload: { aps: { sound: 'default' } } },
          },
        }),
      }
    )
    return resp.ok
  } catch { return false }
}

// ── Web Push / VAPID ─────────────────────────────────────────────────────────

async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array): Promise<Uint8Array> {
  const saltKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', saltKey, ikm))
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const blocks: Uint8Array[] = []
  let t = new Uint8Array(0)
  while (blocks.reduce((a, b) => a + b.length, 0) < len) {
    const i = blocks.length + 1
    const block = new Uint8Array([...t, ...info, i])
    t = new Uint8Array(await crypto.subtle.sign('HMAC', key, block))
    blocks.push(t)
  }
  return new Uint8Array(blocks.flatMap(b => [...b])).slice(0, len)
}

async function encryptWebPushPayload(
  plaintext: string, p256dh: string, authKey: string
): Promise<Uint8Array> {
  const enc        = new TextEncoder()
  const subPubRaw  = decodeb64url(p256dh)   // 65 bytes: 0x04 + x + y
  const authRaw    = decodeb64url(authKey)   // 16 bytes
  const salt       = crypto.getRandomValues(new Uint8Array(16))

  // Ephemeral sender key pair
  const senderKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
  )
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', senderKeys.publicKey))

  // Import subscriber public key
  const subPubKey = await crypto.subtle.importKey(
    'raw', subPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  )

  // ECDH shared secret
  const sharedBits = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: subPubKey }, senderKeys.privateKey, 256)
  )

  // RFC 8291 §3.3 key derivation
  const authInfo = new Uint8Array([...enc.encode('WebPush: info\x00'), ...subPubRaw, ...serverPubRaw])
  const prkKey   = await hkdfExtract(authRaw, sharedBits)
  const ikm      = await hkdfExpand(prkKey, authInfo, 32)
  const prk      = await hkdfExtract(salt, ikm)
  const cek      = await hkdfExpand(prk, enc.encode('Content-Encoding: aes128gcm\x00'), 16)
  const nonce    = await hkdfExpand(prk, enc.encode('Content-Encoding: nonce\x00'), 12)

  // AES-128-GCM encrypt (content + 0x02 delimiter, RFC 8188 §2.3)
  const aesKey    = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const padded    = new Uint8Array([...enc.encode(plaintext), 2])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded)
  )

  // aes128gcm content header: salt(16) + rs(4 BE) + idlen(1) + serverPubKey(65) + ciphertext
  const header = new Uint8Array(16 + 4 + 1 + 65)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096, false)
  header[20] = 65
  header.set(serverPubRaw, 21)
  return new Uint8Array([...header, ...ciphertext])
}

async function sendWebPush(
  endpoint: string, p256dh: string, authKey: string,
  title: string, body: string, data: Record<string, string>
): Promise<boolean> {
  const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!vapidPublic || !vapidPrivate) return false

  try {
    // VAPID JWT (ES256)
    const pubRaw  = decodeb64url(vapidPublic)   // 65 bytes
    const privRaw = decodeb64url(vapidPrivate)  // 32 bytes
    const signingKey = await crypto.subtle.importKey('jwk', {
      kty: 'EC', crv: 'P-256',
      d: b64url(privRaw),
      x: b64url(pubRaw.slice(1, 33)),
      y: b64url(pubRaw.slice(33, 65)),
    }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])

    const audience = new URL(endpoint).origin
    const now = Math.floor(Date.now() / 1000)
    const encJ = (o: unknown) => btoa(JSON.stringify(o)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
    const unsigned = `${encJ({ alg: 'ES256', typ: 'JWT' })}.${encJ({ aud: audience, exp: now + 3600, sub: 'mailto:admin@alliby.ru' })}`
    const sig = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' }, signingKey, new TextEncoder().encode(unsigned)
    )
    const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`

    // Encrypt payload
    const payload  = JSON.stringify({ title, body, data })
    const encrypted = await encryptWebPushPayload(payload, p256dh, authKey)

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `vapid t=${jwt},k=${vapidPublic}`,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '86400',
        'Urgency': 'normal',
      },
      body: encrypted,
    })
    return resp.ok || resp.status === 201
  } catch(e) {
    console.error('sendWebPush error', e)
    return false
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const corsResp = handleCors(req)
  if (corsResp) return corsResp

  const sbUrl     = Deno.env.get('SUPABASE_URL')!
  const sbAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const sbSvcKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401)

  const userClient = createClient(sbUrl, sbAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  let payload: { store_id?: string; days?: number; body?: string }
  try { payload = await req.json() } catch { return jsonResponse({ error: 'Bad JSON' }, 400) }

  const { store_id, days, body } = payload
  if (!store_id || !days || !body)
    return jsonResponse({ error: 'store_id, days, body are required' }, 400)
  if (![7, 30, 90].includes(days))
    return jsonResponse({ error: 'days must be 7, 30 or 90' }, 400)
  if (body.length > 200)
    return jsonResponse({ error: 'body max 200 chars' }, 400)

  const svcClient = createClient(sbUrl, sbSvcKey)

  const { data: store } = await svcClient
    .from('stores')
    .select('id, name, direction')
    .eq('id', store_id)
    .eq('owner_user_id', user.id)
    .maybeSingle()
  if (!store) return jsonResponse({ error: 'Store not found or access denied' }, 403)

  const pushTitle    = (store as { name: string }).name || 'Alliby'
  const storeDirection = (store as { direction?: string }).direction || 'food'

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

  const since = new Date(Date.now() - days * 86400_000).toISOString()
  const { data: orders } = await svcClient
    .from('orders')
    .select('user_id')
    .eq('store_id', store_id)
    .in('status', ['paid', 'ready', 'issued'])
    .gte('order_time', since)

  if (!orders?.length) return jsonResponse({ sent: 0, skipped: 0 })

  const uniqueUserIds = [...new Set(orders.map((o: { user_id: string }) => o.user_id))]

  const { data: subs } = await svcClient
    .from('push_subscriptions')
    .select('user_id, device_token, platform, endpoint, p256dh, auth_key')
    .in('user_id', uniqueUserIds)
    .eq('app', 'client')

  if (!subs?.length) return jsonResponse({ sent: 0, skipped: uniqueUserIds.length })

  type Sub = { device_token: string | null; platform: string | null; endpoint: string | null; p256dh: string | null; auth_key: string | null }

  const validSubs = (subs as Sub[]).filter(
    s => (s.platform !== 'web' && s.device_token) || (s.platform === 'web' && s.endpoint && s.p256dh && s.auth_key)
  )

  const fcmData = { type: 'promo', store_id, store_direction: storeDirection }

  const results = await Promise.allSettled(
    validSubs.map(s => {
      if (s.platform === 'web') {
        return sendWebPush(s.endpoint!, s.p256dh!, s.auth_key!, pushTitle, body, fcmData)
      }
      return sendFcm(s.device_token!, pushTitle, body, store_id, storeDirection)
    })
  )

  const sent    = results.filter(r => r.status === 'fulfilled' && r.value).length
  const skipped = uniqueUserIds.length - sent

  return jsonResponse({ sent, skipped })
})
