// Provider keys a user connects in the cabinet are stored encrypted with AES-GCM (Web Crypto).
// The encryption key comes from the PROVIDER_KEYS_SECRET secret, never from the database, so a copy of the database
// alone cannot reveal a provider key. Each value gets its own random 12-byte IV: base64(iv || ciphertext).
const enc = new TextEncoder();
const dec = new TextDecoder();

const cache = new Map();
async function aesKey(secret) {
  if (!secret || secret.length < 32) throw new Error('PROVIDER_KEYS_SECRET is missing or too short');
  if (!cache.has(secret)) {
    const raw = await crypto.subtle.digest('SHA-256', enc.encode(`fleet provider keys v1:${secret}`));
    cache.set(secret, await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']));
  }
  return cache.get(secret);
}

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function seal(secret, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), enc.encode(text)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64(out);
}

export async function open(secret, sealed) {
  const all = unb64(sealed);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, await aesKey(secret), all.slice(12));
  return dec.decode(pt);
}

export const vaultReady = (env) => typeof env.PROVIDER_KEYS_SECRET === 'string' && env.PROVIDER_KEYS_SECRET.length >= 32;
