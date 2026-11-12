import { describe, expect, test } from 'bun:test';
import { handle } from '../src/index.js';
import { createKey } from '../src/store.js';
import { makeSession } from '../src/session.js';

const kv = () => {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k) };
};
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
  const env = { KV: kv(), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's3cret' };
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
    const r = await handle(new Request(`${ORIGIN}/v1/pods`, { method: 'POST' }), { KV: kv() }, { providers });
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
    const stored = JSON.parse(env.KV.m.get('pods:octo'));
    expect(stored[0]).toMatchObject({ ref: 'pod_mid_one', provider: 'mid', movedFrom: ['cheap'] });
    expect(stored[0].stopped).toBeTruthy();
    expect([...env.KV.m.values()].join(' ')).not.toContain('secret-token');
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
    const env = { KV: kv(), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's3cret' };
    const r = await handle(new Request(`${ORIGIN}/console`, { redirect: 'manual' }), env, { providers });
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe('/auth/start?next=%2Fconsole');
  });
  test('a forged or expired cookie is not a session', async () => {
    const env = { KV: kv(), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's3cret' };
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
      ['docs', 'pod_create'],
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
    const id = JSON.parse(env.KV.m.get('keys:octo'))[0].id;
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
  test('an old single key from before the cabinet still works and shows up', async () => {
    const env = { KV: kv(), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's3cret' };
    await env.KV.put('key:abc123abc123ff', 'octo');
    await env.KV.put('user:octo', 'abc123abc123ff');
    const cookie = (await makeSession(env, 'octo')).split(';')[0];
    const r = await handle(new Request(`${ORIGIN}/console?section=keys`, { headers: { cookie } }), env, { providers });
    expect(await r.text()).toContain('default');
  });
});

describe('dogfood run 3 fixes', () => {
  test('a start that fails on every provider shows up, with each provider\'s answer', async () => {
    const { env, req, page } = await setup();
    const r = await req('POST', '/v1/pods', {}, { 'X-mid-Key': '' });
    expect(r.status).toBe(502);
    const stored = JSON.parse(env.KV.m.get('pods:octo'));
    expect(stored[0].failedStart).toEqual([{ provider: 'cheap', error: 'down' }]);
    expect(await (await page('GET', '/console?section=pods')).text()).toContain('start failed: cheap: down');
    expect(await (await page('GET', '/console')).text()).toMatch(/<b>1<\/b><span>Failed starts today/);
  });
  test('sign-in comes back to the page you asked for, and only to our own pages', async () => {
    const { safeNext } = await import('../src/index.js');
    expect(safeNext('/console?section=try')).toBe('/console?section=try');
    for (const bad of ['//evil.test', 'https://evil.test', '/console/../x', '/consolex', '', null]) expect(safeNext(bad)).toBe('/console');
    const env = { KV: kv(), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's3cret', DEV_LOGIN: 'octo' };
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
    expect([...env.KV.m.values()].join(' ')).not.toContain('my-provider-key');
    expect(JSON.parse(env.KV.m.get('pods:octo'))[0].stopped).toBeTruthy();
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
  test('lists three tools and creates a pod', async () => {
    const { req } = await setup();
    const list = await (await req('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
    expect(list.result.tools.map((t) => t.name)).toEqual(['pod_create', 'pod_run', 'pod_stop']);
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
  for (const section of ['overview', 'pods', 'keys', 'try', 'providers', 'docs']) {
    const html = await (await page('GET', `/console?section=${section}`)).text();
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Function(m[1])).not.toThrow();
  }
});
