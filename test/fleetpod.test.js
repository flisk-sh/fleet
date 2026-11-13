// fleetd and the fleetpod adapter: the adapter against fake replies, and fleetd itself on a random local port.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import fleetpod, { parseKey } from '../src/providers/fleetpod.js';
import { createFleetd } from '../fleetd/fleetd.mjs';

const TOKEN = 'a-long-test-token-1234';

describe('fleetpod adapter', () => {
  test('parses token@address and refuses plain http away from localhost', () => {
    expect(parseKey('tok@https://x.hf.space/')).toEqual({ token: 'tok', base: 'https://x.hf.space' });
    expect(parseKey('tok@http://localhost:7860').base).toBe('http://localhost:7860');
    expect(() => parseKey('tok@http://example.com')).toThrow(/https/);
    expect(() => parseKey('nope')).toThrow(/token/);
  });
  test('is free up to 2 vCPU / 16 GB, not offered above', () => {
    expect(fleetpod.price({ cpu: 1, ram: 1 })).toBe(0);
    expect(fleetpod.price({ cpu: 4, ram: 8 })).toBeNull();
  });
});

describe('fleetd on a real local port', () => {
  let server, key;
  beforeAll(async () => {
    server = createFleetd({ token: TOKEN, maxPods: 2 });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    key = `${TOKEN}@http://127.0.0.1:${server.address().port}`;
  });
  afterAll(async () => {
    await server.closeAll();
    server.close();
  });

  test('start, run, timeout, stop, stop again', async () => {
    const { id } = await fleetpod.create(key, { cpu: 1, ram: 1 });
    const a = await fleetpod.run(key, id, 'echo hi; pwd; echo "token=$FLEETD_TOKEN"; exit 3');
    expect(a.stdout).toContain('hi\n');
    expect(a.stdout).toContain('token=\n'); // the host's secret never reaches a pod
    expect(a.exitCode).toBe(3);
    const t = Date.now();
    const slow = await (await fetch(`http://127.0.0.1:${server.address().port}/pods/${id}/exec`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ command: 'sleep 30', timeout: 1 }) })).json();
    expect(slow.exitCode).toBe(124);
    expect(Date.now() - t).toBeLessThan(5000);
    await fleetpod.stop(key, id);
    await fleetpod.stop(key, id); // second stop is fine
    await expect(fleetpod.run(key, id, 'echo x')).rejects.toThrow(/404/);
  });

  test('wrong token is refused and the pod limit holds', async () => {
    await expect(fleetpod.create(`wrong-token-1234567@http://127.0.0.1:${server.address().port}`, { cpu: 1, ram: 1 })).rejects.toThrow(/401/);
    const a = await fleetpod.create(key, { cpu: 1, ram: 1 });
    const b = await fleetpod.create(key, { cpu: 1, ram: 1 });
    await expect(fleetpod.create(key, { cpu: 1, ram: 1 })).rejects.toThrow(/429/);
    await fleetpod.stop(key, a.id);
    await fleetpod.stop(key, b.id);
  });
});
