import { describe, expect, test } from 'bun:test';
import { createPod, parsePodId, pickOrder, priceTable, publicUrl, runPod, stopPod } from '../src/route.js';

const fake = (name, price, { fail = false } = {}) => ({
  label: name,
  keyHeader: `X-${name}-Key`,
  price: () => price,
  calls: [],
  async create(key, size) {
    this.calls.push(['create', key, size]);
    if (fail) throw new Error('out of capacity');
    return { id: `${name}-1` };
  },
  async run(key, id, command) {
    this.calls.push(['run', key, id, command]);
    return { stdout: 'hi\n', stderr: '', exitCode: 0 };
  },
  async stop(key, id) {
    this.calls.push(['stop', key, id]);
  },
});

describe('pickOrder', () => {
  const providers = { a: fake('a', 0.1), b: fake('b', 0.02), c: fake('c', 0.05), d: fake('d', null) };
  test('cheapest first, only providers with a key', () => {
    expect(pickOrder(providers, { a: 'k', b: 'k', c: 'k' }, { cpu: 2, ram: 4 }).order).toEqual(['b', 'c', 'a']);
    expect(pickOrder(providers, { a: 'k', c: 'k' }, { cpu: 2, ram: 4 }).order).toEqual(['c', 'a']);
  });
  test('a provider that does not offer the size is left out', () => {
    expect(pickOrder(providers, { a: 'k', d: 'k' }, { cpu: 2, ram: 4 }).order).toEqual(['a']);
    expect(pickOrder(providers, { d: 'k' }, { cpu: 2, ram: 4 }).error).toContain('none of your providers');
  });
  test('named provider needs its key', () => {
    expect(pickOrder(providers, { a: 'k' }, {}, { provider: 'a' }).order).toEqual(['a']);
    expect(pickOrder(providers, { a: 'k' }, {}, { provider: 'b' }).error).toContain('X-b-Key');
    expect(pickOrder(providers, { a: 'k' }, {}, { provider: 'zzz' }).error).toContain('unknown provider');
  });
  test("user's own order wins over price", () => {
    expect(pickOrder(providers, { a: 'k', b: 'k' }, {}, { order: ['a', 'b', 'c'] }).order).toEqual(['a', 'b']);
  });
  test('no key at all names the headers', () => {
    expect(pickOrder(providers, {}, {}).error).toContain('X-a-Key');
  });
});

describe('createPod', () => {
  test('starts on the cheapest provider', async () => {
    const providers = { a: fake('a', 0.1), b: fake('b', 0.02) };
    const r = await createPod(providers, { a: 'ka', b: 'kb' }, {});
    expect(r.status).toBe(201);
    expect(r.pod).toMatchObject({ id: 'pod_b_b-1', provider: 'b', cpu: 2, ram: 4, pricePerHour: 0.02, failed: [] });
    expect(providers.b.calls[0]).toEqual(['create', 'kb', { cpu: 2, ram: 4 }]);
    expect(providers.a.calls).toEqual([]);
  });
  test('moves to the next provider when one fails, and says so', async () => {
    const providers = { a: fake('a', 0.1), b: fake('b', 0.02, { fail: true }) };
    const r = await createPod(providers, { a: 'ka', b: 'kb' }, {});
    expect(r.pod.provider).toBe('a');
    expect(r.pod.failed).toEqual([{ provider: 'b', error: 'out of capacity' }]);
  });
  test('502 when every provider fails', async () => {
    const providers = { a: fake('a', 0.1, { fail: true }) };
    const r = await createPod(providers, { a: 'ka' }, {});
    expect(r.status).toBe(502);
    expect(r.failed).toHaveLength(1);
  });
  test('bad size is a 400', async () => {
    expect((await createPod({ a: fake('a', 1) }, { a: 'k' }, { cpu: 0 })).status).toBe(400);
    expect((await createPod({ a: fake('a', 1) }, { a: 'k' }, { ram: 'big' })).status).toBe(400);
  });
});

describe('run and stop', () => {
  const providers = { a: fake('a', 0.1) };
  test('pod id carries provider and provider id', () => {
    expect(parsePodId('pod_a_x_y-1', providers)).toEqual({ provider: 'a', providerId: 'x_y-1' });
    expect(parsePodId('pod_zzz_1', providers)).toBeNull();
    expect(parsePodId('nope', providers)).toBeNull();
  });
  test('run returns stdout, stderr, exitCode', async () => {
    const r = await runPod(providers, { a: 'ka' }, 'pod_a_a-1', { command: 'echo hi' });
    expect(r).toEqual({ status: 200, result: { stdout: 'hi\n', stderr: '', exitCode: 0 } });
  });
  test('run needs a command and the right key', async () => {
    expect((await runPod(providers, { a: 'ka' }, 'pod_a_a-1', {})).status).toBe(400);
    expect((await runPod(providers, {}, 'pod_a_a-1', { command: 'ls' })).error).toContain('X-a-Key');
    expect((await runPod(providers, { a: 'ka' }, 'pod_b_1', { command: 'ls' })).status).toBe(404);
  });
  test('stop', async () => {
    expect(await stopPod(providers, { a: 'ka' }, 'pod_a_a-1')).toEqual({ status: 200, result: { stopped: true } });
  });
});

describe('a pod that died', () => {
  const gone = () => Object.assign(new Error('HTTP 404: sandbox not found'), { status: 404 });
  const dead = { a: { ...fake('a', 0.1), run: async () => { throw gone(); }, stop: async () => { throw gone(); } } };
  test('run says the pod is gone (410), not a provider outage', async () => {
    const r = await runPod(dead, { a: 'ka' }, 'pod_a_x', { command: 'ls' });
    expect(r.status).toBe(410);
    expect(r.error).toContain('this pod is gone');
  });
  test('stop on a dead pod succeeds, so retries are safe', async () => {
    expect(await stopPod(dead, { a: 'ka' }, 'pod_a_x')).toEqual({ status: 200, result: { stopped: true, alreadyGone: true } });
  });
  test('other provider errors are still 502', async () => {
    const down = { a: { ...fake('a', 0.1), run: async () => { throw Object.assign(new Error('HTTP 500: boom'), { status: 500 }); } } };
    expect((await runPod(down, { a: 'ka' }, 'pod_a_x', { command: 'ls' })).status).toBe(502);
  });
});

test('price table is sorted, not-offered last', () => {
  const t = priceTable({ a: fake('a', 0.1), d: fake('d', null), b: fake('b', 0.02) });
  expect(t.map((p) => p.provider)).toEqual(['b', 'a', 'd']);
});

describe('public pods and public URLs', () => {
  test('public: true reaches the provider as part of the size; anything else is a normal pod', async () => {
    const a = fake('a', 0.1);
    await createPod({ a }, { a: 'ka' }, { public: true });
    await createPod({ a }, { a: 'ka' }, { public: 'yes' });
    expect(a.calls[0][2]).toMatchObject({ public: true });
    expect(a.calls[1][2].public).toBeUndefined();
  });

  test('a provider that can expose a port answers its URL and gets the startup command', async () => {
    const a = { ...fake('a', 0.1), seen: null, async publicUrl(key, id, port, opts) { this.seen = { key, id, port, startup: opts.startup }; return { url: `https://${id}-${port}.example` }; } };
    const r = await publicUrl({ a }, { a: 'ka' }, 'pod_a_a-1', { port: 3000, startup: 'cd ~/app && flisk up' });
    expect(r).toEqual({ status: 200, result: { url: 'https://a-1-3000.example', port: 3000, wakesOnVisit: false, expiresAt: null } });
    expect(a.seen).toEqual({ key: 'ka', id: 'a-1', port: 3000, startup: 'cd ~/app && flisk up' });
  });

  test('bad ports, missing keys, unknown pods and providers without the feature', async () => {
    const a = { ...fake('a', 0.1), async publicUrl() { return { url: 'x' }; } };
    const b = fake('b', 0.1);
    expect((await publicUrl({ a }, { a: 'ka' }, 'pod_a_a-1', { port: 0 })).status).toBe(400);
    expect((await publicUrl({ a }, { a: 'ka' }, 'pod_a_a-1', { port: '3000x' })).status).toBe(400);
    expect((await publicUrl({ a }, { a: 'ka' }, 'pod_a_a-1', { port: 3000, startup: 'x'.repeat(2001) })).status).toBe(400);
    expect((await publicUrl({ a }, {}, 'pod_a_a-1', { port: 3000 })).error).toContain('X-a-Key');
    expect((await publicUrl({ a }, { a: 'ka' }, 'pod_z_1', { port: 3000 })).status).toBe(404);
    const no = await publicUrl({ b }, { b: 'kb' }, 'pod_b_b-1', { port: 3000 });
    expect(no.status).toBe(501);
  });

  test('a pod the provider no longer has is 410', async () => {
    const a = { ...fake('a', 0.1), async publicUrl() { const e = new Error('HTTP 404'); e.status = 404; throw e; } };
    expect((await publicUrl({ a }, { a: 'ka' }, 'pod_a_a-1', { port: 3000 })).status).toBe(410);
  });
});
