import { PROVIDERS } from './providers/index.js';
import { createPod, runPod, stopPod, priceTable, DEFAULT_SIZE } from './route.js';
import { handleMcp } from './mcp.js';
import { bearer, githubAuthorizeUrl, githubLogin } from './auth.js';
import { homePage, messagePage } from './page.js';
import { cabinetPage } from './console.js';
import { createKey, listKeys, listPods, loginForKey, recordPod, revokeKey } from './store.js';
import { clearSession, makeSession, readSession, sameOrigin } from './session.js';

const SECURITY = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; form-action 'self' https://github.com; frame-ancestors 'none'; base-uri 'none'",
};
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY, ...extra } });
const redirect = (location, extra = {}) => new Response(null, { status: 303, headers: { location, ...extra } });

// Provider keys come with the request and are never written anywhere.
export function providerKeys(request, providers = PROVIDERS) {
  const keys = {};
  for (const [name, p] of Object.entries(providers)) {
    const v = request.headers.get(p.keyHeader);
    if (v) keys[name] = v.trim();
  }
  return keys;
}

const readJson = async (request) => {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
};

const out = (r) => json(r.status, r.status < 400 ? r.pod || r.result : { error: r.error, failed: r.failed });

async function cabinet(env, origin, login, section, providers, extra = {}) {
  const [keys, pods] = await Promise.all([extra.keys ? extra.keys : listKeys(env, login), listPods(env, login)]);
  return html(cabinetPage({ origin, login, section, keys, pods, prices: priceTable(providers), providers, ...extra }), 200, { 'cache-control': 'no-store' });
}

export async function handle(request, env = {}, { providers = PROVIDERS, fetchImpl = fetch } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const origin = env.PUBLIC_ORIGIN || url.origin;

  if (request.method === 'GET' && path === '/') {
    return html(homePage({ origin, prices: priceTable(providers), size: DEFAULT_SIZE }), 200, { 'cache-control': 'public, max-age=300' });
  }
  if (request.method === 'GET' && path === '/robots.txt') return new Response('User-agent: *\nAllow: /$\nDisallow: /\n', { headers: { 'content-type': 'text/plain' } });
  if (request.method === 'GET' && path === '/v1/prices') return json(200, { size: DEFAULT_SIZE, prices: priceTable(providers) });

  // ---- sign-in
  if (request.method === 'GET' && path === '/auth/start') {
    if (!env.KV || !env.SESSION_SECRET) return html(messagePage('Sign-in is not set up', 'This copy of fleet has no key store or session secret yet.'), 503);
    if (await readSession(env, request)) return redirect('/console');
    if (env.DEV_LOGIN) return redirect('/console', { 'set-cookie': await makeSession(env, env.DEV_LOGIN) });
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return html(messagePage('Sign-in is not set up', 'GitHub sign-in has not been connected yet.'), 503);
    const state = crypto.randomUUID();
    return new Response(null, {
      status: 302,
      headers: { location: githubAuthorizeUrl({ ...env, PUBLIC_ORIGIN: origin }, state), 'set-cookie': `fleet_state=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600` },
    });
  }
  if (request.method === 'GET' && path === '/auth/callback') {
    const state = url.searchParams.get('state') || '';
    const cookie = /(?:^|;\s*)fleet_state=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1] || '';
    const code = url.searchParams.get('code') || '';
    if (!env.KV || !env.SESSION_SECRET || !code || !state || state !== cookie) return html(messagePage('Sign-in failed', 'The sign-in link expired. Start again.'), 400);
    const login = await githubLogin(env, code, fetchImpl);
    if (!login) return html(messagePage('Sign-in failed', "GitHub didn't confirm the sign-in. Start again."), 400);
    const headers = new Headers({ location: '/console' });
    headers.append('set-cookie', await makeSession(env, login));
    headers.append('set-cookie', 'fleet_state=; Path=/auth; Max-Age=0');
    return new Response(null, { status: 303, headers });
  }
  if (request.method === 'POST' && path === '/auth/signout') {
    if (!sameOrigin(request, origin)) return html(messagePage('Not allowed', 'This form only works from fleet itself.'), 403);
    return redirect('/', { 'set-cookie': clearSession() });
  }

  // ---- cabinet
  if (path === '/console' || path.startsWith('/console/')) {
    if (!env.KV) return html(messagePage('Sign-in is not set up', 'This copy of fleet has no key store yet.'), 503);
    const session = await readSession(env, request);
    if (!session) return request.method === 'GET' ? redirect('/auth/start') : html(messagePage('Signed out', 'Sign in again.'), 401);
    const { login } = session;
    if (request.method === 'GET' && path === '/console') return cabinet(env, origin, login, url.searchParams.get('section') || 'overview', providers);
    if (request.method === 'POST') {
      if (!sameOrigin(request, origin)) return html(messagePage('Not allowed', 'This form only works from fleet itself.'), 403);
      if (path === '/console/keys') {
        const form = await request.formData().catch(() => null);
        const made = await createKey(env, login, form?.get('name'));
        return cabinet(env, origin, login, 'keys', providers, { keys: made.list, newKey: made.key, error: made.error });
      }
      const m = /^\/console\/keys\/([a-f0-9]{12})\/revoke$/.exec(path);
      if (m) {
        const done = await revokeKey(env, login, m[1]);
        return cabinet(env, origin, login, 'keys', providers, { keys: done.list, error: done.error });
      }
    }
    return html(messagePage('Page not found', 'Nothing lives at this address.'), 404);
  }

  // ---- API and MCP
  const isApi = path === '/mcp' || path.startsWith('/v1/');
  if (!isApi) return html(messagePage('Page not found', 'Nothing lives at this address.'), 404);

  const login = await loginForKey(env, bearer(request));
  if (!login) return json(401, { error: `missing, revoked or unknown fleet key. Create one at ${origin}/console?section=keys and send it as "Authorization: Bearer fleet_..."` });
  const keys = providerKeys(request, providers);
  const ctx = { fetchImpl, record: (type, data) => recordPod(env, login, type, data) };

  if (path === '/mcp') {
    if (request.method !== 'POST') return json(405, { error: 'POST only' });
    const message = await readJson(request);
    if (!message) return json(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'body is not JSON' } });
    const answer = await handleMcp(message, providers, keys, ctx);
    return answer ? json(200, answer) : new Response(null, { status: 202 });
  }

  if (path === '/v1/pods' && request.method === 'POST') {
    const body = await readJson(request);
    if (!body) return json(400, { error: 'body is not JSON' });
    return out(await createPod(providers, keys, body, ctx));
  }
  const m = /^\/v1\/pods\/([^/]+)(\/run)?$/.exec(path);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (m[2] && request.method === 'POST') {
      const body = await readJson(request);
      if (!body) return json(400, { error: 'body is not JSON' });
      return out(await runPod(providers, keys, id, body, ctx));
    }
    if (!m[2] && request.method === 'DELETE') return out(await stopPod(providers, keys, id, ctx));
  }
  return json(404, { error: 'no such API route' });
}

export default {
  fetch: (request, env) => handle(request, env).catch((e) => json(500, { error: 'fleet failed: ' + String(e?.message || e).slice(0, 200) })),
};
