// GitHub sign-in and fleet key helpers. Fleet stores only SHA-256 hashes of fleet keys (see store.js). Never a provider key.

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export function newFleetKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `fleet_${hex(bytes)}`;
}

export function bearer(request) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '');
  return m ? m[1] : '';
}

export function githubAuthorizeUrl(env, state) {
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', env.GITHUB_CLIENT_ID || '');
  u.searchParams.set('redirect_uri', `${env.PUBLIC_ORIGIN}/auth/callback`);
  u.searchParams.set('state', state);
  return u.toString();
}

export async function githubLogin(env, code, fetchImpl = fetch) {
  const tokenRes = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
  });
  const token = (await tokenRes.json().catch(() => ({}))).access_token;
  if (!token) return null;
  const userRes = await fetchImpl('https://api.github.com/user', {
    headers: { authorization: `Bearer ${token}`, 'user-agent': 'fleet', accept: 'application/vnd.github+json' },
  });
  const login = (await userRes.json().catch(() => ({}))).login;
  return typeof login === 'string' && login ? login : null;
}
