import { describe, expect, test } from 'bun:test';
import boat from '../src/providers/boat.js';
import isorun, { baseFor } from '../src/providers/isorun.js';
import e2b, { frame, readFrames } from '../src/providers/e2b.js';
import daytona from '../src/providers/daytona.js';

// A fake provider: records every request and answers from a list, in order.
function fakeFetch(answers) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    const a = answers.shift();
    if (!a) throw new Error(`unexpected call to ${url}`);
    const body = a.bytes ?? (typeof a.body === 'string' ? a.body : JSON.stringify(a.body ?? null));
    return new Response(body, { status: a.status ?? 200 });
  };
  return { calls, fetchImpl };
}
const json = (c) => JSON.parse(c.body);
const size = { cpu: 2, ram: 4 };
const wait = async () => {};

describe('prices at 2 vCPU / 4 GB match the vendors pages', () => {
  test('boat small', () => expect(boat.price(size)).toBe(0.018));
  test('isorun 2+4', () => expect(isorun.price(size)).toBe(0.11));
  test('e2b', () => expect(e2b.price(size)).toBe(0.166));
  test('daytona', () => expect(daytona.price(size)).toBe(0.166));
  test('sizes a provider does not sell are null', () => {
    expect(boat.price({ cpu: 32, ram: 4 })).toBeNull();
    expect(daytona.price({ cpu: 8, ram: 8 })).toBeNull();
    expect(e2b.price({ cpu: 16, ram: 4 })).toBeNull();
    expect(boat.price({ cpu: 2, ram: 8 })).toBe(0.036);
  });
});

describe('boat', () => {
  test('create picks the smallest type and reads sandbox.id', async () => {
    const f = fakeFetch([{ status: 202, body: { ok: true, sandbox: { id: 'bx_1', state: 'provisioning' } } }]);
    expect(await boat.create('boat_k', size, f)).toEqual({ id: 'bx_1' });
    expect(f.calls[0]).toMatchObject({ url: 'https://boat.dev/api/v1/sandboxes', method: 'POST' });
    expect(f.calls[0].headers.authorization).toBe('Bearer boat_k');
    expect(json(f.calls[0])).toEqual({ type: 'small', snapshots: false, ttlSeconds: 3600 });
  });
  test('run retries while the machine starts, then returns output', async () => {
    const f = fakeFetch([
      { status: 409, body: { ok: false, code: 'sandbox_starting', message: 'starting' } },
      { body: { ok: true, exitCode: 3, stdout: 'out', stderr: 'err' } },
    ]);
    expect(await boat.run('k', 'bx_1', 'ls', { ...f, wait })).toEqual({ stdout: 'out', stderr: 'err', exitCode: 3 });
    expect(f.calls).toHaveLength(2);
    expect(f.calls[1].url).toBe('https://boat.dev/api/v1/sandboxes/bx_1/commands');
    expect(json(f.calls[1])).toEqual({ command: 'ls', timeoutSeconds: 600 });
  });
  test('run does not retry a real error', async () => {
    const f = fakeFetch([{ status: 409, body: { ok: false, code: 'machine_not_running', message: 'not running' } }]);
    await expect(boat.run('k', 'bx_1', 'ls', { ...f, wait })).rejects.toThrow('HTTP 409: not running');
  });
  test('stop', async () => {
    const f = fakeFetch([{ status: 202, body: { ok: true } }]);
    await boat.stop('k', 'bx_1', f);
    expect(f.calls[0]).toMatchObject({ url: 'https://boat.dev/api/v1/sandboxes/bx_1/stop', method: 'POST' });
  });
});

describe('isorun', () => {
  test('region comes from the key', () => {
    expect(baseFor('isorun_live_us_abc')).toBe('https://run-us.isorun.ai');
    expect(() => baseFor('nope')).toThrow('no region');
  });
  test('create, run, stop', async () => {
    const f = fakeFetch([{ body: { id: 'run1', status: 'running' } }, { body: { exit_code: 0, stdout: 'hi\n', stderr: '' } }, { body: { status: 'destroyed' } }]);
    expect(await isorun.create('isorun_live_eu_k', size, f)).toEqual({ id: 'run1' });
    expect(f.calls[0].url).toBe('https://run-eu.isorun.ai/v1/runs');
    expect(json(f.calls[0])).toMatchObject({ vcpus: 2, mem_mib: 4096, timeout: 3600 });
    expect(await isorun.run('isorun_live_eu_k', 'run1', 'echo hi', f)).toEqual({ stdout: 'hi\n', stderr: '', exitCode: 0 });
    expect(f.calls[1].url).toBe('https://run-eu.isorun.ai/v1/runs/run1/exec');
    await isorun.stop('isorun_live_eu_k', 'run1', f);
    expect(f.calls[2]).toMatchObject({ url: 'https://run-eu.isorun.ai/v1/runs/run1', method: 'DELETE' });
  });
});

test('isorun: a region runner that does not answer gets a plain message', async () => {
  const f = fakeFetch([{ status: 521, body: 'error code: 521' }]);
  await expect(isorun.create('isorun_live_eu_k', size, f)).rejects.toThrow("Isorun's runner at run-eu.isorun.ai did not answer");
  const bad = fakeFetch([{ status: 401, body: { error: 'invalid API key' } }]);
  await expect(isorun.create('isorun_live_us_k', size, bad)).rejects.toThrow('HTTP 401');
});

describe('e2b', () => {
  const b64 = (s) => btoa(s);
  const join = (...parts) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  };
  const end = (obj) => {
    const f = frame(obj);
    f[0] = 0x02;
    return f;
  };
  test('create keeps the envd token in the id', async () => {
    const f = fakeFetch([{ status: 201, body: { sandboxID: 'sb1', envdAccessToken: 'tok', domain: null } }]);
    expect(await e2b.create('e2b_k', size, f)).toEqual({ id: 'sb1~tok~' });
    expect(f.calls[0].url).toBe('https://api.e2b.app/v2/sandboxes');
    expect(f.calls[0].headers['x-api-key']).toBe('e2b_k');
    expect(json(f.calls[0])).toEqual({ templateID: 'base', timeout: 3600 });
  });
  test('run decodes Connect frames', async () => {
    const bytes = join(
      frame({ event: { start: { pid: 7 } } }),
      frame({ event: { data: { stdout: b64('hello ') } } }),
      frame({ event: { data: { stderr: b64('warn') } } }),
      frame({ event: { data: { stdout: b64('world') } } }),
      frame({ event: { end: { exitCode: 2, exited: true } } }),
      end({}),
    );
    const f = fakeFetch([{ bytes }]);
    expect(await e2b.run('k', 'sb1~tok~', 'ls', f)).toEqual({ stdout: 'hello world', stderr: 'warn', exitCode: 2 });
    expect(f.calls[0].url).toBe('https://49983-sb1.e2b.app/process.Process/Start');
    expect(f.calls[0].headers['x-access-token']).toBe('tok');
    const sent = JSON.parse(new TextDecoder().decode(f.calls[0].body.subarray(5)));
    expect(sent.process.args).toEqual(['-l', '-c', 'ls']);
  });
  test('exit code 0 may be left out; stream error is thrown', () => {
    expect(readFrames(join(frame({ event: { end: { exited: true } } }), end({}))).exitCode).toBe(0);
    expect(() => readFrames(end({ error: { code: 'unavailable', message: 'gone' } }))).toThrow('unavailable: gone');
  });
  test('stop treats 404 as already stopped', async () => {
    const f = fakeFetch([{ status: 404, body: { message: 'not found' } }]);
    await e2b.stop('k', 'sb1~tok~', f);
    expect(f.calls[0]).toMatchObject({ url: 'https://api.e2b.app/sandboxes/sb1', method: 'DELETE' });
  });
});

test('daytona: the smallest default snapshot that fits, never cpu and memory next to it', async () => {
  const { snapshotFor } = await import('../src/providers/daytona.js');
  expect(snapshotFor({ cpu: 1, ram: 1 }).name).toBe('daytona-small');
  expect(snapshotFor({ cpu: 2, ram: 4 }).name).toBe('daytona-medium');
  expect(snapshotFor({ cpu: 3, ram: 2 }).name).toBe('daytona-large');
  expect(snapshotFor({ cpu: 8, ram: 8 })).toBeNull();
  expect(daytona.price({ cpu: 1, ram: 1 })).toBe(0.067);
  expect(daytona.price({ cpu: 3, ram: 2 })).toBe(0.331);
});

describe('daytona', () => {
  test('create waits until started', async () => {
    const f = fakeFetch([{ body: { id: 'd1', state: 'creating' } }, { body: { id: 'd1', state: 'started' } }]);
    expect(await daytona.create('dk', size, { ...f, wait })).toEqual({ id: 'd1' });
    expect(json(f.calls[0])).toEqual({ snapshot: 'daytona-medium', autoStopInterval: 60, autoDeleteInterval: 0 });
    expect(f.calls[1].url).toBe('https://app.daytona.io/api/sandbox/d1');
  });
  test('create fails on an error state', async () => {
    const f = fakeFetch([{ body: { id: 'd1', state: 'error', errorReason: 'quota' } }]);
    await expect(daytona.create('dk', size, { ...f, wait })).rejects.toThrow('sandbox error: quota');
  });
  test('run and stop', async () => {
    const f = fakeFetch([{ body: { result: 'hi\n', exitCode: 0 } }, { body: { id: 'd1' } }]);
    expect(await daytona.run('dk', 'd1', 'echo hi', f)).toEqual({ stdout: 'hi\n', stderr: '', exitCode: 0 });
    expect(f.calls[0].url).toBe('https://proxy.app.daytona.io/toolbox/d1/process/execute');
    await daytona.stop('dk', 'd1', f);
    expect(f.calls[1]).toMatchObject({ url: 'https://app.daytona.io/api/sandbox/d1', method: 'DELETE' });
  });
});
