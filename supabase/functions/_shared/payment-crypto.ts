const CURRENT_KEY_VERSION = 1

function getRawKey(version: number): string {
  const versioned = Deno.env.get(`PAYMENT_ENCRYPTION_KEY_V${version}`)
  if (versioned) return versioned
  if (version === 1) {
    const legacy = Deno.env.get("PAYMENT_ENCRYPTION_KEY")
    if (legacy) return legacy
  }
  throw new Error(`Encryption key version ${version} not configured`)
}

async function importKey(version: number): Promise<CryptoKey> {
  const raw = getRawKey(version)
  const keyBytes = new Uint8Array(raw.match(/.{2}/g)!.map(h => parseInt(h, 16)))
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

export async function encryptPaymentKey(plaintext: string): Promise<string> {
  const key = await importKey(CURRENT_KEY_VERSION)
  const iv  = crypto.getRandomValues(new Uint8Array(12))
  const ct  = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext))
  const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  return btoa(String.fromCharCode(...iv)) + ":" + b64(ct)
}

export async function decryptPaymentKey(encrypted: string, version = 1): Promise<string> {
  const [ivB64, ctB64] = encrypted.split(":")
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0))
  const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0))
  const key = await importKey(version)
  const pt  = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct)
  return new TextDecoder().decode(pt)
}

export { CURRENT_KEY_VERSION }
