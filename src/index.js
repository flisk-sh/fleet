import { PROVIDERS } from './providers/index.js';
import { createPod, readFile, runPod, stopPod, priceTable, writeFile, DEFAULT_SIZE } from './route.js';
import { handleMcp } from './mcp.js';
import { bearer, githubAuthorizeUrl, githubLogin } from './auth.js';
import { homePage, messagePage, shell } from './page.js';
import { docsPage, skillMd, DOCS_CSS } from './docs.js';
import { pricingPage, PRICING_CSS } from './pricing.js';
import { measured, podlyticsData, podlyticsPage } from './podlytics.js';
import { cabinetPage } from './console.js';
import { connectedKeys, connectProvider, disconnectProvider, listConnections, checkLimits, createKey, getLimits, LIMIT_DEFAULTS, listCalls, listKeys, listPods, logCall, loginForKey, podListItem, podRef, podStatus, podsStartedToday, recordPod, revokeKey, setLimits } from './store.js';
import { overMinuteLimit, PODS_PER_DAY } from './limit.js';
import { vaultReady } from './vault.js';
import { assetResponse, llmsTxt, robotsTxt, sitemapXml } from './seo.js';
import { DEMO_PROVIDERS, demoPage, demoRun } from './demo.js';
import { fieldsOf, joinFields } from './providers/fields.js';
import { clearSession, makeSession, readSession, sameOrigin } from './session.js';

const SECURITY = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline' https://flisk.si; img-src 'self' data:; form-action 'self' https://github.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'",
};
const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
const html = (body, status = 200, extra = {}) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...SECURITY, ...extra } });
const redirect = (location, extra = {}) => new Response(null, { status: 303, headers: { location, ...extra } });

// The provider keys for one call: keys the user connected in the cabinet, then any sent in headers (headers win).
// Header keys are never written anywhere.
async function keysFor(request, env, login, providers) {
  const stored = vaultReady(env) ? await connectedKeys(env, login).catch(() => ({})) : {};
  return { ...stored, ...providerKeys(request, providers) };
}

// Provider keys that come with the request.
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

// Only our own cabinet pages: never another site, never a protocol-relative "//host".
export function safeNext(next) {
  const n = String(next || '');
  return /^\/console(\?[\w=&%.-]*)?$/.test(n) ? n : '/console';
}

const out = (r) => json(r.status, r.status < 400 ? r.pod || r.result : { error: r.error, failed: r.failed });

async function cabinet(env, origin, login, section, providers, extra = {}) {
  const [keys, pods, calls, limits] = await Promise.all([
    extra.keys ? extra.keys : listKeys(env, login),
    listPods(env, login),
    section === 'usage' ? listCalls(env, login, { errorsOnly: extra.errorsOnly }) : [],
    extra.limits ? extra.limits : getLimits(env, login),
  ]);
  const connections = vaultReady(env) ? await listConnections(env, login) : {};
  return html(cabinetPage({ origin, login, section, keys, pods, calls, limits, connections, canConnect: vaultReady(env), prices: priceTable(providers), providers, ...extra }), 200, { 'cache-control': 'no-store' });
}

// Every pod call records pod facts, goes to the usage log, and follows the account's own limits.
// Limits are read only when a pod starts (run and stop don't need them). The usage log is written after the answer
// when the runtime allows it (waitUntil); pod facts stay in line, because a stop right after a start must find the pod.
const podCtx = (env, login, fetchImpl, waitUntil = null) => {
  let limits = null;
  const getLimitsOnce = async () => (limits ??= await getLimits(env, login).catch(() => ({ ...LIMIT_DEFAULTS })));
  return {
    fetchImpl,
    getLimits: getLimitsOnce,
    record: (type, data) => recordPod(env, login, type, data),
    listPods: async () => (await listPods(env, login)).filter((p) => !p.failedStart).map((p) => ({ ...podListItem(p), status: podStatus(p) })),
    log: (c) => {
      const write = logCall(env, login, c).catch(() => {});
      if (waitUntil) waitUntil(write);
      else return write;
    },
    allowCreate: async () => (await podsStartedToday(env, login)) < Math.min(PODS_PER_DAY, (await getLimitsOnce()).podsPerDay),
  };
};

// "Try a pod" in the cabinet: start, run one command, always stop, and time each step. The provider key is used for this call only.
async function tryPod(request, env, login, providers, fetchImpl, waitUntil = null) {
  const body = await readJson(request);
  const provider = String(body?.provider || '');
  let key = String(body?.key || '').trim() || (providers[body?.provider]?.demo ? 'demo' : '');
  if (!key && providers[provider] && vaultReady(env)) key = (await connectedKeys(env, login).catch(() => ({})))[provider] || '';
  const command = String(body?.command || '').trim() || 'uname -sr; nproc; free -m | head -2';
  if (!providers[provider]) return json(400, { error: 'pick a provider' });
  if (!key) return json(400, { error: 'paste your provider API key, or connect this provider on the Providers page' });
  if (command.length > 500) return json(400, { error: 'keep the command under 500 characters' });
  const keys = { [provider]: key };
  const ctx = podCtx(env, login, fetchImpl, waitUntil);
  const t0 = Date.now();
  const made = await createPod(providers, keys, { provider, cpu: 2, ram: 4 }, ctx);
  const createMs = Date.now() - t0;
  if (made.status !== 201) return json(made.status, { error: made.error, failed: made.failed, createMs });
  const t1 = Date.now();
  const ran = await runPod(providers, keys, made.pod.id, { command }, ctx);
  const runMs = Date.now() - t1;
  const t2 = Date.now();
  const stopped = await stopPod(providers, keys, made.pod.id, ctx);
  const stopMs = Date.now() - t2;
  const result = ran.result || {};
  return json(200, {
    pod: podRef(made.pod.id),
    provider,
    createMs,
    runMs,
    stopMs,
    totalMs: Date.now() - t0,
    stdout: result.stdout ?? '',
    stderr: ran.status === 200 ? result.stderr ?? '' : ran.error,
    exitCode: result.exitCode ?? null,
    stopError: stopped.status === 200 ? null : stopped.error,
  });
}

export async function handle(request, env = {}, { providers = PROVIDERS, fetchImpl = fetch, waitUntil = null } = {}) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const origin = env.PUBLIC_ORIGIN || url.origin;

  if (request.method === 'GET' && path === '/') {
    return html(homePage({ origin, prices: priceTable(providers), size: DEFAULT_SIZE }), 200, { 'cache-control': 'public, max-age=300' });
  }
  if (request.method === 'GET' && path === '/robots.txt') {
    return new Response(robotsTxt(), { headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=3600' } });
  }
  if (request.method === 'GET' && path === '/sitemap.xml') return new Response(sitemapXml(), { headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' } });
  if (request.method === 'GET' && path === '/llms.txt') return new Response(llmsTxt(), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' } });
  if (request.method === 'GET' && /^\/(icon\.svg|favicon\.ico|apple-touch-icon\.png|icon-512\.png|og\.png)$/.test(path)) return assetResponse(path.slice(1));
  if (request.method === 'GET' && path === '/docs') return html(docsPage(origin, (t, b) => shell(t, b, DOCS_CSS, { path: '/docs' })), 200, { 'cache-control': 'public, max-age=300' });
  if (request.method === 'GET' && path === '/pricing') return html(pricingPage(origin, providers, (t, b) => shell(t, b, PRICING_CSS, { path: '/pricing' })), 200, { 'cache-control': 'public, max-age=300' });
  if (request.method === 'GET' && path === '/podlytics') {
    return html(podlyticsPage(podlyticsData(providers, await measured(env))), 200, { 'cache-control': 'public, max-age=300' });
  }
  if (request.method === 'GET' && (path === '/SKILL.md' || path === '/skill.md')) {
    return new Response(skillMd(origin), { headers: { 'content-type': 'text/markdown; charset=utf-8', 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' } });
  }
  if (request.method === 'GET' && path === '/v1/prices') return json(200, { size: DEFAULT_SIZE, prices: priceTable(providers) });

  // ---- sign-in
  if (request.method === 'GET' && path === '/auth/start') {
    if (!env.DB || !env.SESSION_SECRET) return html(messagePage('Sign-in is not set up', 'This copy of fleet has no key store or session secret yet.'), 503);
    const next = safeNext(url.searchParams.get('next'));
    if (await readSession(env, request)) return redirect(next);
    if (env.DEV_LOGIN) return redirect(next, { 'set-cookie': await makeSession(env, env.DEV_LOGIN) });
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return html(messagePage('Sign-in is not set up', 'GitHub sign-in has not been connected yet.'), 503);
    const state = crypto.randomUUID();
    const headers = new Headers({ location: githubAuthorizeUrl({ ...env, PUBLIC_ORIGIN: origin }, state) });
    headers.append('set-cookie', `fleet_state=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    headers.append('set-cookie', `fleet_next=${encodeURIComponent(next)}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    return new Response(null, { status: 302, headers });
  }
  if (request.method === 'GET' && path === '/auth/callback') {
    const state = url.searchParams.get('state') || '';
    const cookie = /(?:^|;\s*)fleet_state=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1] || '';
    const code = url.searchParams.get('code') || '';
    if (!env.DB || !env.SESSION_SECRET || !code || !state || state !== cookie) return html(messagePage('Sign-in failed', 'The sign-in link expired. Start again.'), 400);
    const login = await githubLogin(env, code, fetchImpl);
    if (!login) return html(messagePage('Sign-in failed', "GitHub didn't confirm the sign-in. Start again."), 400);
    const nextCookie = /(?:^|;\s*)fleet_next=([^;]+)/.exec(request.headers.get('cookie') || '')?.[1];
    const headers = new Headers({ location: safeNext(nextCookie ? decodeURIComponent(nextCookie) : '') });
    headers.append('set-cookie', await makeSession(env, login));
    headers.append('set-cookie', 'fleet_state=; Path=/auth; Max-Age=0');
    headers.append('set-cookie', 'fleet_next=; Path=/auth; Max-Age=0');
    return new Response(null, { status: 303, headers });
  }
  if (request.method === 'POST' && path === '/auth/signout') {
    if (!sameOrigin(request, origin)) return html(messagePage('Not allowed', 'This form only works from fleet itself.'), 403);
    return redirect('/', { 'set-cookie': clearSession() });
  }

  // ---- cabinet
  if (path === '/console' || path.startsWith('/console/')) {
    if (!env.DB) return html(messagePage('Sign-in is not set up', 'This copy of fleet has no key store yet.'), 503);
    const session = await readSession(env, request);
    if (!session) return request.method === 'GET' ? redirect(`/auth/start?next=${encodeURIComponent(path + url.search)}`) : html(messagePage('Signed out', 'Sign in again.'), 401);
    const { login } = session;
    if (request.method === 'GET' && path === '/console/demo') return html(demoPage(), 200, { 'cache-control': 'no-store' });
    if (request.method === 'POST' && path === '/console/demo') {
      if (!sameOrigin(request, origin)) return json(403, { error: 'this only works from fleet itself' });
      const connected = vaultReady(env) ? await connectedKeys(env, login).catch(() => ({})) : {};
      const keys = Object.fromEntries(DEMO_PROVIDERS.filter((p) => connected[p] && providers[p]).map((p) => [p, connected[p]]));
      if (!Object.keys(keys).length) return json(400, { error: `connect ${DEMO_PROVIDERS.map((p) => providers[p]?.label || p).join(', ')} on the Providers page first` });
      const result = await demoRun(providers, keys, podCtx(env, login, fetchImpl, waitUntil));
      return json(200, result);
    }
    if (request.method === 'GET' && path === '/console') {
      return cabinet(env, origin, login, url.searchParams.get('section') || 'auto', providers, { errorsOnly: url.searchParams.get('only') === 'errors' });
    }
    if (request.method === 'POST') {
      if (!sameOrigin(request, origin)) return html(messagePage('Not allowed', 'This form only works from fleet itself.'), 403);
      if (path === '/console/keys') {
        const form = await request.formData().catch(() => null);
        const made = await createKey(env, login, form?.get('name'));
        return cabinet(env, origin, login, 'keys', providers, { keys: made.list, newKey: made.key, error: made.error });
      }
      if (path === '/console/try') return tryPod(request, env, login, providers, fetchImpl, waitUntil);
      const pc = /^\/console\/providers\/([a-z0-9]+)\/(connect|disconnect)$/.exec(path);
      if (pc) {
        const [, provider, action] = pc;
        if (!providers[provider] || providers[provider].demo) return cabinet(env, origin, login, 'providers', providers, { error: 'No such provider.' });
        if (!vaultReady(env)) return cabinet(env, origin, login, 'providers', providers, { error: 'Connecting providers is not set up on this copy of fleet.' });
        if (action === 'disconnect') {
          await disconnectProvider(env, login, provider);
          return cabinet(env, origin, login, 'providers', providers, { notice: `${providers[provider].label} disconnected. Fleet no longer has that key.` });
        }
        const form = await request.formData().catch(() => null);
        const parts = Object.fromEntries(fieldsOf(providers[provider]).map((f) => [f.id, form?.get(`f_${f.id}`) ?? (f.id === 'key' ? form?.get('key') : '')]));
        const joined = joinFields(providers[provider], parts);
        const done = joined.error ? joined : await connectProvider(env, login, provider, joined.value);
        return cabinet(env, origin, login, 'providers', providers, done.error ? { error: done.error } : { notice: `${providers[provider].label} connected. Your agent no longer needs to send ${providers[provider].keyHeader}.` });
      }
      if (path === '/console/limits') {
        const form = await request.formData().catch(() => null);
        const input = Object.fromEntries(['podsPerDay', 'maxCpu', 'maxRam', 'lifetimeMin'].map((k) => [k, form?.get(k)]));
        const checked = checkLimits(input);
        if (checked.error) return cabinet(env, origin, login, 'limits', providers, { error: checked.error, limits: { ...(await getLimits(env, login)), ...input } });
        await setLimits(env, login, checked.limits);
        return cabinet(env, origin, login, 'limits', providers, { limits: checked.limits, saved: true });
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
  if (await overMinuteLimit(login, { cache: env.LIMIT_CACHE })) return json(429, { error: 'too many requests for this account: at most 120 a minute. Wait a minute' });
  const keys = await keysFor(request, env, login, providers);
  const ctx = podCtx(env, login, fetchImpl, waitUntil);

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
  if (path === '/v1/pods' && request.method === 'GET') {
    const want = url.searchParams.get('status');
    const pods = await ctx.listPods();
    return json(200, { pods: want ? pods.filter((p) => p.status === want) : pods });
  }
  const m = /^\/v1\/pods\/([^/]+)(\/run|\/files)?$/.exec(path);
  if (m) {
    const id = decodeURIComponent(m[1]);
    if (m[2] === '/run' && request.method === 'POST') {
      const body = await readJson(request);
      if (!body) return json(400, { error: 'body is not JSON' });
      return out(await runPod(providers, keys, id, body, ctx));
    }
    if (m[2] === '/files' && request.method === 'PUT') {
      const body = await readJson(request);
      if (!body) return json(400, { error: 'body is not JSON' });
      return out(await writeFile(providers, keys, id, body, ctx));
    }
    if (m[2] === '/files' && request.method === 'GET') return out(await readFile(providers, keys, id, { path: url.searchParams.get('path') }, ctx));
    if (!m[2] && request.method === 'DELETE') return out(await stopPod(providers, keys, id, ctx));
  }
  return json(404, { error: 'no such API route' });
}

export default {
  // waitUntil lets the usage log be written after the answer is sent, so logging adds no time to a call.
  fetch: (request, env, ectx) =>
    handle(request, env, { waitUntil: ectx?.waitUntil ? (p) => ectx.waitUntil(p) : null }).catch((e) => json(500, { error: 'fleet failed: ' + String(e?.message || e).slice(0, 200) })),
};
