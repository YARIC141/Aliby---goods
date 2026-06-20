/**
 * Web Push (VAPID + RFC 8291 aes128gcm) for Deno / Supabase Edge Functions.
 * Uses WebCrypto only — no npm dependencies.
 */

export function b64url(buf: Uint8Array | ArrayBuffer): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function decodeb64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(pad + '='.repeat((4 - pad.length % 4) % 4)), c => c.charCodeAt(0))
}

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
    t = new Uint8Array(await crypto.subtle.sign('HMAC', key, new Uint8Array([...t, ...info, i])))
    blocks.push(t)
  }
  return new Uint8Array(blocks.flatMap(b => [...b])).slice(0, len)
}

async function encryptPayload(plaintext: string, p256dh: string, authKey: string): Promise<Uint8Array> {
  const enc       = new TextEncoder()
  const subPubRaw = decodeb64url(p256dh)
  const authRaw   = decodeb64url(authKey)
  const salt      = crypto.getRandomValues(new Uint8Array(16))

  const senderKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const serverPub  = new Uint8Array(await crypto.subtle.exportKey('raw', senderKeys.publicKey))
  const subPubKey  = await crypto.subtle.importKey('raw', subPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared     = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: subPubKey }, senderKeys.privateKey, 256))

  // RFC 8291 §3.3
  const authInfo = new Uint8Array([...enc.encode('WebPush: info\x00'), ...subPubRaw, ...serverPub])
  const prkKey   = await hkdfExtract(authRaw, shared)
  const ikm      = await hkdfExpand(prkKey, authInfo, 32)
  const prk      = await hkdfExtract(salt, ikm)
  const cek      = await hkdfExpand(prk, enc.encode('Content-Encoding: aes128gcm\x00'), 16)
  const nonce    = await hkdfExpand(prk, enc.encode('Content-Encoding: nonce\x00'), 12)

  const aesKey    = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey,
      new Uint8Array([...enc.encode(plaintext), 2])  // RFC 8188 §2.3 delimiter
    )
  )

  // aes128gcm content header: salt(16) + rs(4 BE) + idlen(1) + serverPub(65)
  const header = new Uint8Array(86)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096, false)
  header[20] = 65
  header.set(serverPub, 21)
  return new Uint8Array([...header, ...ciphertext])
}

export async function sendWebPush(
  endpoint: string,
  p256dh: string,
  authKey: string,
  title: string,
  body: string,
  data: Record<string, string> = {}
): Promise<boolean> {
  const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!vapidPublic || !vapidPrivate) return false

  try {
    const pubRaw  = decodeb64url(vapidPublic)
    const privRaw = decodeb64url(vapidPrivate)
    const sigKey  = await crypto.subtle.importKey('jwk', {
      kty: 'EC', crv: 'P-256',
      d: b64url(privRaw),
      x: b64url(pubRaw.slice(1, 33)),
      y: b64url(pubRaw.slice(33, 65)),
    }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])

    const audience = new URL(endpoint).origin
    const now = Math.floor(Date.now() / 1000)
    const encJ = (o: unknown) => btoa(JSON.stringify(o)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
    const unsigned = `${encJ({ alg: 'ES256', typ: 'JWT' })}.${encJ({ aud: audience, exp: now + 3600, sub: 'mailto:admin@alliby.ru' })}`
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sigKey, new TextEncoder().encode(unsigned))
    const jwt = `${unsigned}.${b64url(new Uint8Array(sig))}`

    const encrypted = await encryptPayload(JSON.stringify({ title, body, data }), p256dh, authKey)

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `vapid t=${jwt},k=${vapidPublic}`,
        'Content-Type': 'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL': '86400',
        'Urgency': 'high',
      },
      body: encrypted,
    })
    return resp.ok || resp.status === 201
  } catch(e) {
    console.error('sendWebPush error', e)
    return false
  }
}
