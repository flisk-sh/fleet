// Signed session cookie: "<login>.<expiry ms>.<hmac>". Nothing is stored, so a sign-in costs no KV write.
const enc = new TextEncoder();
const COOKIE = 'fleet_sess';
const DAYS = 7;

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const secretOf = (env) => env.SESSION_SECRET || '';

export async function makeSession(env, login, now = Date.now()) {
  const body = `${login}.${now + DAYS * 86400_000}`;
  const value = `${body}.${await hmac(secretOf(env), body)}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}

export const clearSession = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function readSession(env, request, now = Date.now()) {
  if (!secretOf(env)) return null;
  const raw = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(request.headers.get('cookie') || '')?.[1];
  if (!raw) return null;
  const at = raw.lastIndexOf('.');
  const body = raw.slice(0, at);
  const sig = raw.slice(at + 1);
  const [login, exp] = [body.slice(0, body.lastIndexOf('.')), Number(body.slice(body.lastIndexOf('.') + 1))];
  if (!login || !(exp > now)) return null;
  if ((await hmac(secretOf(env), body)) !== sig) return null;
  return { login };
}

// Forms post only from our own pages.
export function sameOrigin(request, origin) {
  const o = request.headers.get('origin');
  if (o) return o === origin;
  const r = request.headers.get('referer');
  return !!r && r.startsWith(`${origin}/`);
}
