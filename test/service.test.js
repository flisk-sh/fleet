import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { handle } from '../src/index.js';
import { createKey } from '../src/store.js';
import { fakeD1 } from './d1.js';

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const SECRET = 'x'.repeat(40);
const ORIGIN = 'https://fleet.test';
const stopped = [];
const providers = {
  fake: {
    label: 'Fake',
    keyHeader: 'X-Fake-Key',
    price: () => 0.01,
    create: async () => ({ id: 'one' }),
    run: async (key, id, command) => ({ stdout: `${key}|${command}`, stderr: '', exitCode: 0 }),
    stop: async (key, id) => void stopped.push(id),
  },
};
const env = () => ({ DB: fakeD1(SCHEMA), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's', PROVIDER_KEYS_SECRET: 'p'.repeat(40), CHAT_SERVICE_SECRET: SECRET });
const call = (e, method, path, body, headers = {}) =>
  handle(new Request(`${ORIGIN}${path}`, { method, headers: { authorization: `Bearer ${SECRET}`, 'x-on-behalf-of': 'octo', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), e, { providers });

describe('trusted site (chat.flisk.si) calls', () => {
  test('connect a provider key for a login, then start, run and stop a pod with it and no key header', async () => {
    const e = env();
    expect((await call(e, 'GET', '/v1/connections')).status).toBe(200);
    const put = await call(e, 'PUT', '/v1/connections/fake', { key: 'provider-key-1234' });
    expect(put.status).toBe(200);
    const list = await (await call(e, 'GET', '/v1/connections')).json();
    expect(Object.keys(list.connections)).toEqual(['fake']);
    expect(JSON.stringify(list)).not.toContain('provider-key');
    const made = await (await call(e, 'POST', '/v1/pods', { provider: 'fake' })).json();
    const ran = await (await call(e, 'POST', `/v1/pods/${made.id}/run`, { command: 'echo hi' })).json();
    expect(ran.stdout).toBe('provider-key-1234|echo hi');
    expect((await call(e, 'DELETE', `/v1/pods/${made.id}`)).status).toBe(200);
    expect((await call(e, 'DELETE', '/v1/connections/fake')).status).toBe(200);
    expect(Object.keys((await (await call(e, 'GET', '/v1/connections')).json()).connections)).toEqual([]);
  });

  test('another login sees nothing of the first login', async () => {
    const e = env();
    await call(e, 'PUT', '/v1/connections/fake', { key: 'provider-key-1234' });
    const other = await (await call(e, 'GET', '/v1/connections', undefined, { 'x-on-behalf-of': 'mallory' })).json();
    expect(other.connections).toEqual({});
  });

  test('a wrong secret, a missing or odd login, or a short secret is refused', async () => {
    const e = env();
    expect((await call(e, 'GET', '/v1/connections', undefined, { authorization: `Bearer ${'y'.repeat(40)}` })).status).toBe(401);
    expect((await call(e, 'GET', '/v1/connections', undefined, { 'x-on-behalf-of': '' })).status).toBe(401);
    expect((await call(e, 'GET', '/v1/connections', undefined, { 'x-on-behalf-of': 'a/b' })).status).toBe(401);
    const short = { ...env(), CHAT_SERVICE_SECRET: 'short' };
    expect((await handle(new Request(`${ORIGIN}/v1/connections`, { headers: { authorization: 'Bearer short', 'x-on-behalf-of': 'octo' } }), short, { providers })).status).toBe(401);
  });

  test('an ordinary fleet key cannot connect provider keys', async () => {
    const e = env();
    const { key } = await createKey(e, 'octo', 'ci');
    const res = await handle(new Request(`${ORIGIN}/v1/connections/fake`, { method: 'PUT', headers: { authorization: `Bearer ${key}` }, body: JSON.stringify({ key: 'provider-key-1234' }) }), e, { providers });
    expect(res.status).toBe(403);
  });
});
