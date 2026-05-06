import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL    = Deno.env.get('SUPABASE_URL')!
const SVC_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUB = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_JWK = JSON.parse(Deno.env.get('VAPID_PRIVATE_JWK')!)

const enc = new TextEncoder()

function b64u(data: Uint8Array): string {
  let s = ''
  for (const b of data) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function unb64u(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/')
  const p = (4 - b.length % 4) % 4
  const raw = atob(b + '='.repeat(p))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const n = arrays.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(n)
  let off = 0
  for (const a of arrays) { out.set(a, off); off += a.length }
  return out
}

async function hkdf(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8
  ))
}

async function buildVapidAuth(endpoint: string): Promise<string> {
  const url = new URL(endpoint)
  const aud = `${url.protocol}//${url.host}`
  const now = Math.floor(Date.now() / 1000)
  const header  = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const payload = b64u(enc.encode(JSON.stringify({ aud, exp: now + 43200, sub: 'mailto:yarich92@gmail.com' })))
  const sigInput = enc.encode(`${header}.${payload}`)
  const key = await crypto.subtle.importKey('jwk', VAPID_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, sigInput)
  return `vapid t=${header}.${payload}.${b64u(new Uint8Array(sig))},k=${VAPID_PUB}`
}

async function encryptPush(message: string, p256dh: string, authSecret: string): Promise<Uint8Array> {
  const msgBytes  = enc.encode(message)
  const clientPub = unb64u(p256dh)
  const auth      = unb64u(authSecret)
  const salt      = crypto.getRandomValues(new Uint8Array(16))

  const serverKP  = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const serverPub = new Uint8Array(await crypto.subtle.exportKey('raw', serverKP.publicKey))
  const clientKey = await crypto.subtle.importKey('raw', clientPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhBits  = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, serverKP.privateKey, 256))

  const ikm   = await hkdf(ecdhBits, auth, concat(enc.encode('WebPush: info\x00'), clientPub, serverPub), 32)
  const cek   = await hkdf(ikm, salt, concat(enc.encode('Content-Encoding: aes128gcm\x00'), new Uint8Array([1])), 16)
  const nonce = await hkdf(ikm, salt, concat(enc.encode('Content-Encoding: nonce\x00'),       new Uint8Array([1])), 12)

  const cekKey     = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, tagLength: 128 },
    cekKey,
    concat(msgBytes, new Uint8Array([2]))
  ))

  const rs = new Uint8Array(4)
  new DataView(rs.buffer).setUint32(0, 4096, false)
  return concat(salt, rs, new Uint8Array([serverPub.length]), serverPub, ciphertext)
}

type Sub = { id: string; endpoint: string; p256dh: string; auth_key: string }

async function sendToSub(sub: Sub, payload: string, db: ReturnType<typeof createClient>): Promise<void> {
  try {
    const body   = await encryptPush(payload, sub.p256dh, sub.auth_key)
    const vapid  = await buildVapidAuth(sub.endpoint)
    const resp   = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Authorization':    vapid,
        'Content-Encoding': 'aes128gcm',
        'Content-Type':     'application/octet-stream',
        'Content-Length':   body.length.toString(),
        'TTL':              '86400',
      },
      body,
    })
    if (resp.status === 410 || resp.status === 404) {
      await db.from('push_subscriptions').delete().eq('id', sub.id)
    }
  } catch { /* network error — ignore */ }
}

Deno.serve(async (req: Request) => {
  if (req.headers.get('Authorization') !== `Bearer ${SVC_KEY}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { type, record, old_record } = await req.json()
  if (!record) return new Response('ok')

  const db      = createClient(SB_URL, SVC_KEY)
  const shortId = (record.id as string).slice(-6).toUpperCase()

  let subs: Sub[] = []
  let notif: { title: string; body: string; data: Record<string, string> } | null = null

  if (type === 'INSERT') {
    notif = {
      title: 'Новый заказ',
      body:  `#${shortId} · ${Number(record.total_amount).toFixed(0)} ₽`,
      data:  { orderId: record.id, screen: 'orders' },
    }
    const { data } = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth_key').eq('app', 'admin')
    subs = (data ?? []) as Sub[]
  } else if (type === 'UPDATE' && record.status !== old_record?.status) {
    const labels: Record<string, string> = {
      paid:      'Оплачен',
      ready:     'Готов к выдаче — забирайте!',
      issued:    'Выдан. Приятного аппетита!',
      cancelled: 'Отменён',
    }
    const label = labels[record.status as string]
    if (!label) return new Response('ok')
    notif = {
      title: 'Статус заказа',
      body:  `#${shortId}: ${label}`,
      data:  { orderId: record.id, screen: 'orders' },
    }
    const { data } = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth_key')
      .eq('user_id', record.user_id).eq('app', 'client')
    subs = (data ?? []) as Sub[]
  } else {
    return new Response('ok')
  }

  await Promise.all(subs.map((sub) => sendToSub(sub, JSON.stringify(notif), db)))
  return new Response('ok')
})
