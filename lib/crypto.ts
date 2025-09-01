// Browser-only Web Crypto helpers for PIN-based encryption of API keys

function enc(b: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(b)))
}
function dec(s: string) {
  const bin = atob(s)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr.buffer
}

async function importKeyFromPass(pass: string, salt: Uint8Array) {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
  return key
}

export async function encryptString(plain: string, pin: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await importKeyFromPass(pin, salt)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  return { cipher: enc(ct), iv: enc(iv.buffer), salt: enc(salt.buffer) }
}

export async function decryptString(payload: { cipher: string; iv: string; salt: string }, pin: string) {
  const { cipher, iv, salt } = payload
  const key = await importKeyFromPass(pin, new Uint8Array(dec(salt)))
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(dec(iv)) }, key, dec(cipher))
  return new TextDecoder().decode(pt)
}

