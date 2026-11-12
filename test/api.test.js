import { describe, expect, test } from 'bun:test';
import { handle } from '../src/index.js';
import { issueKey } from '../src/auth.js';

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
    return { id: 'one' };
  },
  run: async (key, id, command) => ({ stdout: `${command}\n`, stderr: '', exitCode: 0 }),
  stop: async () => {},
});
const providers = { cheap: provider('cheap', 0.01, true), mid: provider('mid', 0.05) };

async function setup() {
  const env = { KV: kv(), PUBLIC_ORIGIN: 'https://fleet.test' };
  const key = await issueKey(env, 'octo');
  const req = (method, path, body, headers = {}) =>
    handle(
      new Request(`https://fleet.test${path}`, {
        method,
        headers: { authorization: `Bearer ${key}`, 'X-cheap-Key': 'c', 'X-mid-Key': 'm', ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
      { providers },
    );
  return { env, key, req };
}

describe('HTTP API', () => {
  test('home page and prices need no key', async () => {
    const home = await handle(new Request('https://fleet.test/'), {}, { providers });
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('One API for every agent pod');
    const prices = await handle(new Request('https://fleet.test/v1/prices'), {}, { providers });
    expect((await prices.json()).prices.map((p) => p.provider)).toEqual(['cheap', 'mid']);
  });
  test('no fleet key is a 401', async () => {
    const r = await handle(new Request('https://fleet.test/v1/pods', { method: 'POST' }), { KV: kv() }, { providers });
    expect(r.status).toBe(401);
  });
  test('create falls back, run and stop work', async () => {
    const { req } = await setup();
    const made = await req('POST', '/v1/pods', {});
    expect(made.status).toBe(201);
    const pod = await made.json();
    expect(pod).toMatchObject({ id: 'pod_mid_one', provider: 'mid', failed: [{ provider: 'cheap', error: 'down' }] });
    const ran = await req('POST', `/v1/pods/${pod.id}/run`, { command: 'echo hi' });
    expect(await ran.json()).toEqual({ stdout: 'echo hi\n', stderr: '', exitCode: 0 });
    const stopped = await req('DELETE', `/v1/pods/${pod.id}`);
    expect(await stopped.json()).toEqual({ stopped: true });
  });
  test('bad JSON and unknown routes', async () => {
    const { env, key } = await setup();
    const bad = await handle(new Request('https://fleet.test/v1/pods', { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: '{' }), env, { providers });
    expect(bad.status).toBe(400);
    const { req } = await setup();
    expect((await req('GET', '/v1/nope')).status).toBe(404);
  });
  test('a new key replaces the old one, and only hashes are stored', async () => {
    const { env, key } = await setup();
    const again = await issueKey(env, 'octo');
    expect(again).not.toBe(key);
    const old = await handle(new Request('https://fleet.test/v1/pods', { method: 'POST', headers: { authorization: `Bearer ${key}` } }), env, { providers });
    expect(old.status).toBe(401);
    expect([...env.KV.m.keys(), ...env.KV.m.values()].join(' ')).not.toContain(again);
  });
});

describe('MCP', () => {
  test('lists three tools and creates a pod', async () => {
    const { req } = await setup();
    const list = await (await req('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json();
    expect(list.result.tools.map((t) => t.name)).toEqual(['pod_create', 'pod_run', 'pod_stop']);
    const call = await (await req('POST', '/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'pod_create', arguments: {} } })).json();
    expect(call.result.isError).toBe(false);
    expect(JSON.parse(call.result.content[0].text).id).toBe('pod_mid_one');
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
