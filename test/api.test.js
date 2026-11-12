import { describe, expect, test } from 'bun:test';
import { handle } from '../src/index.js';
import { createKey } from '../src/store.js';
import { makeSession } from '../src/session.js';

import { readFileSync } from 'node:fs';
import { fakeD1 } from './d1.js';
const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const db = () => fakeD1(SCHEMA);
// Everything fleet stored, as one string, to check that no secret ever lands there.
const dump = (env) => JSON.stringify([env.DB.raw.query('SELECT * FROM keys').all(), env.DB.raw.query('SELECT * FROM pods').all()]);
const podsOf = (env, login) => env.DB.raw.query('SELECT * FROM pods WHERE login = ? ORDER BY n DESC').all(login).map((r) => ({ ...r, movedFrom: JSON.parse(r.moved_from), failedStart: r.failed_start ? JSON.parse(r.failed_start) : undefined }));
const provider = (name, price, fail = false) => ({
  label: name,
  keyHeader: `X-${name}-Key`,
  price: () => price,
  create: async () => {
    if (fail) throw new Error('down');
    return { id: 'one~secret-token~' };
  },
  run: async (key, id, command) => ({ stdout: `${command}\n`, stderr: '', exitCode: 0 }),
  stop: async () => {},
});
const providers = { cheap: provider('cheap', 0.01, true), mid: provider('mid', 0.05) };
const ORIGIN = 'https://fleet.test';

async function setup() {
  const env = { DB: db(), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's3cret' };
  const { key } = await createKey(env, 'octo', 'ci');
  const req = (method, path, body, headers = {}) =>
    handle(
      new Request(`${ORIGIN}${path}`, {
        method,
        headers: { authorization: `Bearer ${key}`, 'X-cheap-Key': 'c', 'X-mid-Key': 'm', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
      { providers },
    );
  const cookie = (await makeSession(env, 'octo')).split(';')[0];
  const page = (method, path, form, extra = {}) =>
    handle(
      new Request(`${ORIGIN}${path}`, {
        method,
        headers: { cookie, origin: ORIGIN, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...extra },
        body: form ? new URLSearchParams(form).toString() : undefined,
        redirect: 'manual',
      }),
      env,
      { providers },
    );
  return { env, key, req, page };
}

describe('HTTP API', () => {
  test('home page and prices need no key, and the page sends security headers', async () => {
    const home = await handle(new Request(`${ORIGIN}/`), {}, { providers });
    expect(home.status).toBe(200);
    expect(home.headers.get('x-frame-options')).toBe('DENY');
    expect(home.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(await home.text()).toContain('One API for every agent pod');
    const prices = await handle(new Request(`${ORIGIN}/v1/prices`), {}, { providers });
    expect((await prices.json()).prices.map((p) => p.provider)).toEqual(['cheap', 'mid']);
  });
  test('no fleet key is a 401', async () => {
    const r = await handle(new Request(`${ORIGIN}/v1/pods`, { method: 'POST' }), { DB: db() }, { providers });
    expect(r.status).toBe(401);
  });
  test('create falls back, run and stop work, and pod facts are kept without the token', async () => {
    const { env, req } = await setup();
    const made = await req('POST', '/v1/pods', {});
    expect(made.status).toBe(201);
    const pod = await made.json();
    expect(pod).toMatchObject({ id: 'pod_mid_one~secret-token~', provider: 'mid', failed: [{ provider: 'cheap', error: 'down' }] });
    expect(await (await req('POST', `/v1/pods/${pod.id}/run`, { command: 'echo hi' })).json()).toEqual({ stdout: 'echo hi\n', stderr: '', exitCode: 0 });
    expect(await (await req('DELETE', `/v1/pods/${pod.id}`)).json()).toEqual({ stopped: true });
    const stored = podsOf(env, 'octo');
    expect(stored[0]).toMatchObject({ ref: 'pod_mid_one', provider: 'mid', movedFrom: ['cheap'] });
    expect(stored[0].stopped).toBeTruthy();
    expect(dump(env)).not.toContain('secret-token');
  });
  test('bad JSON and unknown routes', async () => {
    const { env, key, req } = await setup();
    const bad = await handle(new Request(`${ORIGIN}/v1/pods`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: '{' }), env, { providers });
    expect(bad.status).toBe(400);
    expect((await req('GET', '/v1/nope')).status).toBe(404);
  });
});

describe('cabinet', () => {
  test('without a session the console sends you to sign in', async () => {
    const env = { DB: db(), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's3cret' };
    const r = await handle(new Request(`${ORIGIN}/console`, { redirect: 'manual' }), env, { providers });
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe('/auth/start?next=%2Fconsole');
  });
  test('a forged or expired cookie is not a session', async () => {
    const env = { DB: db(), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's3cret' };
    const forged = await handle(new Request(`${ORIGIN}/console`, { headers: { cookie: 'fleet_sess=octo.9999999999999.bad' }, redirect: 'manual' }), env, { providers });
    expect(forged.status).toBe(303);
    const old = (await makeSession(env, 'octo', Date.now() - 8 * 86400_000)).split(';')[0];
    const expired = await handle(new Request(`${ORIGIN}/console`, { headers: { cookie: old }, redirect: 'manual' }), env, { providers });
    expect(expired.status).toBe(303);
  });
  test('every section renders', async () => {
    const { page } = await setup();
    for (const [section, text] of [
      ['overview', 'Started today'],
      ['pods', 'Start your first pod'],
      ['keys', 'Create key'],
      ['providers', 'X-mid-Key'],
      ['docs', 'SKILL.md'],
      ['start', 'Set up your'],
      ['usage', 'No calls yet'],
      ['limits', 'Save limits'],
    ]) {
      const r = await page('GET', `/console?section=${section}`);
      expect(r.status).toBe(200);
      expect(await r.text()).toContain(text);
    }
  });
  test('create a second key: both work, the new one is shown once', async () => {
    const { env, key, page, req } = await setup();
    const r = await page('POST', '/console/keys', { name: 'laptop' });
    const body = await r.text();
    const second = /fleet_[a-f0-9]{48}/.exec(body)[0];
    expect(body).toContain("Copy it now");
    const call = (k) => handle(new Request(`${ORIGIN}/v1/pods`, { method: 'POST', headers: { authorization: `Bearer ${k}`, 'X-mid-Key': 'm' }, body: '{}' }), env, { providers });
    expect((await call(key)).status).toBe(201);
    expect((await call(second)).status).toBe(201);
    expect(await (await page('GET', '/console?section=keys')).text()).not.toContain(second);
    expect((await req('GET', '/v1/nope')).status).toBe(404);
  });
  test('revoke stops a key working', async () => {
    const { env, key, page } = await setup();
    const id = env.DB.raw.query("SELECT id FROM keys WHERE login = 'octo'").get().id;
    expect((await page('POST', `/console/keys/${id}/revoke`)).status).toBe(200);
    const r = await handle(new Request(`${ORIGIN}/v1/pods`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: '{}' }), env, { providers });
    expect(r.status).toBe(401);
  });
  test('ten keys at most', async () => {
    const { page } = await setup();
    for (let i = 0; i < 9; i++) await page('POST', '/console/keys', { name: `k${i}` });
    expect(await (await page('POST', '/console/keys', { name: 'eleven' })).text()).toContain('Revoke one first');
  });
  test('forms from another site are refused', async () => {
    const { page } = await setup();
    expect((await page('POST', '/console/keys', { name: 'x' }, { origin: 'https://evil.test' })).status).toBe(403);
    expect((await page('POST', '/auth/signout', null, { origin: 'https://evil.test' })).status).toBe(403);
  });
});

describe('dogfood run 3 fixes', () => {
  test('a start that fails on every provider shows up, with each provider\'s answer', async () => {
    const { env, req, page } = await setup();
    const r = await req('POST', '/v1/pods', {}, { 'X-mid-Key': '' });
    expect(r.status).toBe(502);
    const stored = podsOf(env, 'octo');
    expect(stored[0].failedStart).toEqual([{ provider: 'cheap', error: 'down' }]);
    expect(await (await page('GET', '/console?section=pods')).text()).toContain('start failed: cheap: down');
    expect(await (await page('GET', '/console')).text()).toMatch(/<b>1<\/b><span>Failed starts today/);
  });
  test('sign-in comes back to the page you asked for, and only to our own pages', async () => {
    const { safeNext } = await import('../src/index.js');
    expect(safeNext('/console?section=try')).toBe('/console?section=try');
    for (const bad of ['//evil.test', 'https://evil.test', '/console/../x', '/consolex', '', null]) expect(safeNext(bad)).toBe('/console');
    const env = { DB: db(), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's3cret', DEV_LOGIN: 'octo' };
    const r = await handle(new Request(`${ORIGIN}/auth/start?next=%2Fconsole%3Fsection%3Dtry`, { redirect: 'manual' }), env, { providers });
    expect(r.headers.get('location')).toBe('/console?section=try');
  });
  test('a pod older than an hour that fleet never saw stop counts as likely stopped', async () => {
    const { podStatus, summarize } = await import('../src/store.js');
    const now = new Date('2026-11-12T12:00:00Z');
    const young = { started: '2026-11-12T11:30:00Z' };
    const old = { started: '2026-11-12T10:00:00Z' };
    expect(podStatus(young, now)).toBe('running');
    expect(podStatus(old, now)).toBe('likely-stopped');
    expect(summarize([young, old], now).running).toBe(1);
  });
});

describe('free-plan guards and demo pods', () => {
  test('more than 120 calls a minute from one account gets 429', async () => {
    const { env, req } = await setup();
    const store = new Map();
    env.LIMIT_CACHE = { match: async (u) => (store.has(u) ? new Response(store.get(u)) : undefined), put: async (u, r) => void store.set(u, await r.text()) };
    for (let i = 0; i < 120; i++) await req('GET', '/v1/nope');
    const r = await req('GET', '/v1/nope');
    expect(r.status).toBe(429);
  });
  test('the daily pod cap answers 429 without starting anything', async () => {
    const { env, req } = await setup();
    const day = new Date().toISOString();
    const insert = env.DB.raw.prepare("INSERT INTO pods (login, started, moved_from) VALUES ('octo', ?, '[]')");
    for (let i = 0; i < 300; i++) insert.run(day);
    const r = await req('POST', '/v1/pods', {});
    expect(r.status).toBe(429);
    expect((await r.json()).error).toContain('daily pod limit');
  });
  test('the demo provider is never in the price table', async () => {
    const { PROVIDERS } = await import('../src/providers/index.js');
    const r = await handle(new Request(`${ORIGIN}/v1/prices`), {}, { providers: PROVIDERS });
    expect((await r.json()).prices.map((p) => p.provider)).not.toContain('demo');
  });
  test('a demo pod starts, runs, stops, and dies after its time to live', async () => {
    const demo = (await import('../src/providers/demo.js')).default;
    const { id } = await demo.create('ttl=5');
    expect((await demo.run('k', id, 'echo hello')).stdout).toStartWith('hello\n[demo pod');
    await demo.stop('k', id);
    const old = `${(Date.now() - 1000).toString(36)}-x`;
    await expect(demo.run('k', old, 'ls')).rejects.toThrow('expired');
    await expect(demo.stop('k', old)).rejects.toThrow('expired');
  });
  test('try a pod with the demo needs no key', async () => {
    const { PROVIDERS } = await import('../src/providers/index.js');
    const env = { DB: db(), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's3cret' };
    const cookie = (await makeSession(env, 'octo')).split(';')[0];
    const r = await handle(
      new Request(`${ORIGIN}/console/try`, { method: 'POST', headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'demo', command: 'echo hi' }) }),
      env,
      { providers: PROVIDERS },
    );
    expect(r.status).toBe(200);
    expect((await r.json()).stdout).toStartWith('hi\n');
  });
});

describe('screens from the owner: get started, catalog, usage, limits, pricing, docs', () => {
  test('public docs, pricing and SKILL.md need no key', async () => {
    const { PROVIDERS } = await import('../src/providers/index.js');
    const get = (p) => handle(new Request(`${ORIGIN}${p}`), {}, { providers: PROVIDERS });
    const docs = await (await get('/docs')).text();
    for (const t of ['Start a pod', 'Run a command', 'Stop a pod', 'data-tab="ts"', 'claude mcp add']) expect(docs).toContain(t);
    const pricing = await (await get('/pricing')).text();
    expect(pricing).toContain('What a month of pods costs');
    expect(pricing).toContain('"id":"daytona"');
    expect(pricing).not.toContain('"id":"demo"');
    const skill = await get('/SKILL.md');
    expect(skill.headers.get('content-type')).toContain('text/markdown');
    expect(await skill.text()).toStartWith('---\nname: fleet');
    for (const p of ['/docs', '/pricing']) {
      const html = await (await get(p)).text();
      for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Function(m[1])).not.toThrow();
    }
  });
  test('a brand-new account lands on Get started; with a key it lands on Overview', async () => {
    const env = { DB: db(), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's3cret' };
    const cookie = (await makeSession(env, 'newbie')).split(';')[0];
    const fresh = await (await handle(new Request(`${ORIGIN}/console`, { headers: { cookie } }), env, { providers })).text();
    expect(fresh).toContain('Set up your');
    const { page } = await setup();
    expect(await (await page('GET', '/console')).text()).toContain('Started today');
  });
  test('the catalog has a card and badges per provider', async () => {
    const { PROVIDERS } = await import('../src/providers/index.js');
    const env = { DB: db(), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's3cret' };
    const cookie = (await makeSession(env, 'octo')).split(';')[0];
    const html = await (await handle(new Request(`${ORIGIN}/console?section=providers`, { headers: { cookie } }), env, { providers: PROVIDERS })).text();
    expect((html.match(/class="pcard"/g) || []).length).toBe(Object.values(PROVIDERS).filter((p) => !p.demo).length);
    expect(html).toContain('$200 credit');
    expect(html).toContain('No card needed');
  });
  test('every start, run and stop goes to the usage log, failures too', async () => {
    const { env, req, page } = await setup();
    const pod = await (await req('POST', '/v1/pods', {})).json();
    await req('POST', `/v1/pods/${pod.id}/run`, { command: 'ls' });
    await req('DELETE', `/v1/pods/${pod.id}`);
    await req('POST', '/v1/pods', {}, { 'X-mid-Key': '' });
    const rows = env.DB.raw.query("SELECT kind, status, provider, ref FROM calls WHERE login = 'octo' ORDER BY n").all();
    expect(rows.map((r) => `${r.kind}:${r.status}`)).toEqual(['start:201', 'run:200', 'stop:200', 'start:502']);
    expect(rows[0]).toMatchObject({ provider: 'mid', ref: 'pod_mid_one' });
    expect(env.DB.raw.query("SELECT error FROM calls WHERE status = 502").get().error).toBe('no provider could start a pod: cheap down');
    expect(JSON.stringify(rows)).not.toContain('secret-token');
    const usage = await (await page('GET', '/console?section=usage')).text();
    expect(usage).toContain('pod_mid_one');
    const errors = await (await page('GET', '/console?section=usage&only=errors')).text();
    expect(errors).toContain('502');
    expect(errors).not.toContain('>201<');
  });
  test('own limits: saved, checked, and enforced on new pods', async () => {
    const { env, req, page } = await setup();
    const bad = await (await page('POST', '/console/limits', { podsPerDay: '0', maxCpu: '2', maxRam: '4', lifetimeMin: '30' })).text();
    expect(bad).toContain('podsPerDay must be');
    const ok = await (await page('POST', '/console/limits', { podsPerDay: '1', maxCpu: '2', maxRam: '4', lifetimeMin: '30' })).text();
    expect(ok).toContain('Saved');
    expect((await req('POST', '/v1/pods', { cpu: 4, ram: 4 })).status).toBe(400);
    const sizes = [];
    const original = providers.mid.create;
    providers.mid.create = async (key, size) => (sizes.push(size), { id: 'one' });
    try {
      expect((await req('POST', '/v1/pods', { cpu: 2, ram: 4 })).status).toBe(201);
      expect(sizes[0].ttl).toBe(1800);
      const capped = await req('POST', '/v1/pods', { cpu: 2, ram: 4 });
      expect(capped.status).toBe(429);
    } finally {
      providers.mid.create = original;
    }
  });
});

test('with waitUntil, the usage log is written after the answer and still lands', async () => {
  const { env, key } = await setup();
  const later = [];
  const r = await handle(new Request(`${ORIGIN}/v1/pods`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'X-mid-Key': 'm' }, body: '{}' }), env, { providers, waitUntil: (p) => later.push(p) });
  expect(r.status).toBe(201);
  expect(later).toHaveLength(1);
  await Promise.all(later);
  expect(env.DB.raw.query("SELECT kind, status FROM calls").all()).toEqual([{ kind: 'start', status: 201 }]);
});

describe('connect a provider once', () => {
  const SECRET = 'x'.repeat(40);
  async function connectedSetup() {
    const base = await setup();
    base.env.PROVIDER_KEYS_SECRET = SECRET;
    return base;
  }
  test('the key is stored encrypted, shows only its last 4 characters, and pod calls use it', async () => {
    const { env, key, page } = await connectedSetup();
    const used = [];
    const original = providers.mid.create;
    providers.mid.create = async (k) => (used.push(k), { id: 'one' });
    try {
      const r = await (await page('POST', '/console/providers/mid/connect', { key: 'mid-secret-key-1234' })).text();
      expect(r).toContain('mid connected');
      expect(r).toContain('key ending 1234');
      expect(dump(env)).not.toContain('mid-secret-key-1234');
      const call = await handle(new Request(`${ORIGIN}/v1/pods`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: '{"provider":"mid"}' }), env, { providers });
      expect(call.status).toBe(201);
      expect(used).toEqual(['mid-secret-key-1234']);
      await handle(new Request(`${ORIGIN}/v1/pods`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'X-mid-Key': 'from-header' }, body: '{"provider":"mid"}' }), env, { providers });
      expect(used[1]).toBe('from-header');
    } finally {
      providers.mid.create = original;
    }
  });
  test('disconnect deletes the key', async () => {
    const { env, key, page } = await connectedSetup();
    await page('POST', '/console/providers/mid/connect', { key: 'mid-secret-key-1234' });
    expect(await (await page('POST', '/console/providers/mid/disconnect')).text()).toContain('mid disconnected');
    expect(env.DB.raw.query('SELECT COUNT(*) AS c FROM provider_keys').get().c).toBe(0);
    const call = await handle(new Request(`${ORIGIN}/v1/pods`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: '{"provider":"mid"}' }), env, { providers });
    expect(call.status).toBe(400);
  });
  test('a key that does not look like one is refused; no secret means no connect', async () => {
    const { page } = await connectedSetup();
    expect(await (await page('POST', '/console/providers/mid/connect', { key: 'a b' })).text()).toContain('does not look like an API key');
    const plain = await setup();
    expect(await (await plain.page('POST', '/console/providers/mid/connect', { key: 'mid-secret-key-1234' })).text()).toContain('not set up');
    expect(await (await plain.page('GET', '/console?section=providers')).text()).not.toContain('class="conn"');
  });
  test('a key sealed with another secret is skipped, not crashed on', async () => {
    const { env, key, page } = await connectedSetup();
    await page('POST', '/console/providers/mid/connect', { key: 'mid-secret-key-1234' });
    env.PROVIDER_KEYS_SECRET = 'y'.repeat(40);
    const call = await handle(new Request(`${ORIGIN}/v1/pods`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: '{"provider":"mid"}' }), env, { providers });
    expect(call.status).toBe(400);
  });
  test('try a pod picks a connected provider first, not the demo', async () => {
    const { env, page } = await connectedSetup();
    await page('POST', '/console/providers/mid/connect', { key: 'mid-secret-key-1234' });
    const html = await (await page('GET', '/console?section=try')).text();
    expect(html).toContain('const C=["mid"]');
    expect(html).toContain("$('prov').value=C[0]");
  });
  test('try a pod uses the connected key when none is pasted', async () => {
    const { env, page } = await connectedSetup();
    await page('POST', '/console/providers/mid/connect', { key: 'mid-secret-key-1234' });
    const cookie = (await makeSession(env, 'octo')).split(';')[0];
    const r = await handle(new Request(`${ORIGIN}/console/try`, { method: 'POST', headers: { cookie, origin: ORIGIN, 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'mid', command: 'echo hi' }) }), env, { providers });
    expect(r.status).toBe(200);
  });
});

describe('try a pod', () => {
  test('starts, runs, stops, times each step, and keeps no key', async () => {
    const { env, page } = await setup();
    const r = await handle(
      new Request(`${ORIGIN}/console/try`, {
        method: 'POST',
        headers: { cookie: (await makeSession(env, 'octo')).split(';')[0], origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'mid', key: 'my-provider-key', command: 'echo hi' }),
      }),
      env,
      { providers },
    );
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d).toMatchObject({ pod: 'pod_mid_one', provider: 'mid', stdout: 'echo hi\n', exitCode: 0, stopError: null });
    for (const k of ['createMs', 'runMs', 'stopMs', 'totalMs']) expect(typeof d[k]).toBe('number');
    expect(dump(env)).not.toContain('my-provider-key');
    expect(podsOf(env, 'octo')[0].stopped).toBeTruthy();
    expect(await (await page('GET', '/console?section=try')).text()).toContain('Start pod');
  });
  test('needs a key, a known provider and our own origin', async () => {
    const { env } = await setup();
    const cookie = (await makeSession(env, 'octo')).split(';')[0];
    const post = (body, origin = ORIGIN) =>
      handle(new Request(`${ORIGIN}/console/try`, { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env, { providers });
    expect((await post({ provider: 'mid' })).status).toBe(400);
    expect((await post({ provider: 'zzz', key: 'k' })).status).toBe(400);
    expect((await post({ provider: 'mid', key: 'k' }, 'https://evil.test')).status).toBe(403);
    const down = await post({ provider: 'cheap', key: 'k' });
    expect(down.status).toBe(502);
    expect((await down.json()).failed[0].provider).toBe('cheap');
  });
});

describe('MCP', () => {
  test('lists the tools and creates a pod', async () => {
    const { req } = await setup();
    const list = await (await req('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
    expect(list.result.tools.map((t) => t.name)).toEqual(['pod_create', 'pod_run', 'pod_write_file', 'pod_read_file', 'pod_list', 'pod_stop']);
    const call = await (await req('POST', '/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'pod_create', arguments: {} } })).json();
    expect(call.result.isError).toBe(false);
    expect(JSON.parse(call.result.content[0].text).provider).toBe('mid');
    const bad = await (await req('POST', '/mcp', { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'pod_run', arguments: { id: 'x', command: 'ls' } } })).json();
    expect(bad.result.isError).toBe(true);
  });
  test('initialize and notification', async () => {
    const { req } = await setup();
    const init = await (await req('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })).json();
    expect(init.result.serverInfo.name).toBe('fleet');
    expect((await req('POST', '/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
  });
});

test('every inline page script parses', async () => {
  const { page } = await setup();
  for (const section of ['start', 'overview', 'pods', 'usage', 'keys', 'try', 'providers', 'limits', 'docs']) {
    const html = await (await page('GET', `/console?section=${section}`)).text();
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Function(m[1])).not.toThrow();
  }
});

describe('provider status', () => {
  test('Daytona is working, the rest are coming soon with a help link, on the home page, the API and the cabinet', async () => {
    const { PROVIDERS } = await import('../src/providers/index.js');
    const { priceTable } = await import('../src/route.js');
    const table = priceTable(PROVIDERS);
    expect(table.find((p) => p.provider === 'daytona')).toMatchObject({ status: 'working', tested: '2026-11-12' });
    for (const p of table.filter((x) => x.provider !== 'daytona')) {
      expect(p.status).toBe('soon');
      expect(p.help).toMatch(/^https:\/\/github\.com\/flisk-sh\/fleet\/issues\/\d+$/);
    }
    const home = await (await handle(new Request(`${ORIGIN}/`), {}, { providers: PROVIDERS })).text();
    const soon = table.length - 1;
    expect(home).toContain(`1 working · ${soon} coming soon`);
    expect(home.match(/class="st ok"/g)).toHaveLength(1);
    expect(home.match(/class="st soon"/g)).toHaveLength(soon);
    // the example route only ever shows a working provider starting the pod
    expect(home).toMatch(/<li class="win"[^>]*><span>●<\/span><span>Daytona<\/span>/);
    const cab = await (await handle(new Request(`${ORIGIN}/console?section=providers`, { headers: { cookie: (await makeSession({ SESSION_SECRET: 's3cret' }, 'octo')).split(';')[0] } }), { DB: db(), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's3cret' }, { providers: PROVIDERS })).text();
    expect(cab.indexOf('<b>Daytona</b>')).toBeLessThan(cab.indexOf('<b>boat</b>'));
    expect(cab).toContain('Help us finish it');
    expect(cab).toContain('Working now');
  });
});
