// The seven coming-soon providers added on 2026-11-12, tested against fake replies shaped like each provider's docs.
// None has met a real account: these tests pin what fleet sends and how it reads the answer, nothing more.
import { describe, expect, test } from 'bun:test';
import hopx from '../src/providers/hopx.js';
import runloop, { runloopSize, uuidv7 } from '../src/providers/runloop.js';
import blaxel, { blaxelGb } from '../src/providers/blaxel.js';
import vercel, { parseVercelKey, readNdjson, vercelVcpus } from '../src/providers/vercel.js';
import sprites, { readSpriteFrames } from '../src/providers/sprites.js';
import morph, { morphMcu } from '../src/providers/morph.js';
import upstash, { upstashSize } from '../src/providers/upstash.js';
import { PROVIDERS } from '../src/providers/index.js';

function fakeFetch(answers) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    const a = answers.shift();
    if (!a) throw new Error(`unexpected call to ${url}`);
    const body = a.bytes ?? (typeof a.body === 'string' ? a.body : JSON.stringify(a.body ?? null));
    return new Response(body, { status: a.status ?? 200 });
  };
  return { calls, fetchImpl, wait: async () => {} };
}
const json = (c) => JSON.parse(c.body);
const size = { cpu: 2, ram: 4, ttl: 1800 };

describe('every provider has what the cabinet and routing need', () => {
  for (const [name, p] of Object.entries(PROVIDERS)) {
    if (p.demo) continue;
    test(name, () => {
      for (const k of ['label', 'keyHeader', 'priceSource', 'create', 'run', 'stop', 'price', 'facts']) expect(p[k]).toBeDefined();
      expect(p.keyHeader).toMatch(/^X-[A-Za-z0-9]+-Key$/);
      expect(Boolean(p.working) !== Boolean(p.help)).toBe(true); // working, or coming soon with a help link
      expect(p.facts.blurb.length).toBeGreaterThan(10);
    });
  }
  test('key headers are unique', () => {
    const h = Object.values(PROVIDERS).map((p) => p.keyHeader.toLowerCase());
    expect(new Set(h).size).toBe(h.length);
  });
});

describe('sizes and prices', () => {
  test('runloop rounds to its custom sizes', () => {
    expect(runloopSize({ cpu: 3, ram: 3 })).toEqual({ cpu: 4, ram: 4 });
    expect(runloopSize({ cpu: 1, ram: 1 })).toEqual({ cpu: 1, ram: 1 });
    expect(runloopSize({ cpu: 16, ram: 65 })).toBeNull();
    expect(runloop.price(size)).toBe(0.317);
  });
  test('blaxel bills memory, 2 GB per vCPU', () => {
    expect(blaxelGb({ cpu: 4, ram: 2 })).toBe(8);
    expect(blaxel.price(size)).toBe(0.166);
  });
  test('vercel gives 2 GB per vCPU in even steps', () => {
    expect(vercelVcpus({ cpu: 1, ram: 1 })).toBe(1);
    expect(vercelVcpus({ cpu: 3, ram: 4 })).toBe(4);
    expect(vercelVcpus({ cpu: 2, ram: 10 })).toBe(6);
  });
  test('morph counts MCUs, upstash picks a size', () => {
    expect(morphMcu({ cpu: 1, ram: 8 })).toBe(2);
    expect(morph.price(size)).toBe(0.1);
    expect(upstashSize({ cpu: 3, ram: 4 }).name).toBe('medium');
    expect(upstash.price({ cpu: 16, ram: 4 })).toBeNull();
  });
  test('uuidv7 is a version 7 uuid', () => {
    expect(uuidv7()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('hopx', () => {
  test('create polls until running and packs host and token into the id', async () => {
    const f = fakeFetch([
      { status: 201, body: { id: 'sb1', status: 'creating', public_host: 'sb1.hopx.dev', auth_token: 'jwt1' } },
      { body: { id: 'sb1', status: 'running', public_host: 'sb1.hopx.dev', auth_token: 'jwt1' } },
    ]);
    expect(await hopx.create('hk', size, f)).toEqual({ id: 'sb1~sb1.hopx.dev~jwt1' });
    expect(f.calls[0]).toMatchObject({ url: 'https://api.hopx.dev/v1/sandboxes', method: 'POST' });
    expect(json(f.calls[0])).toMatchObject({ vcpu: 2, memory_mb: 4096, timeout_seconds: 1800 });
    expect(f.calls[0].headers.authorization).toBe('Bearer hk');
  });
  test('run goes to the sandbox host with the sandbox token; stop uses the sandbox id', async () => {
    const f = fakeFetch([{ body: { stdout: 'hi\n', stderr: '', exit_code: 0 } }, { body: { status: 'deleted' } }]);
    expect(await hopx.run('hk', 'sb1~sb1.hopx.dev~jwt1', 'echo hi', f)).toEqual({ stdout: 'hi\n', stderr: '', exitCode: 0 });
    expect(f.calls[0].url).toBe('https://sb1.hopx.dev/commands/run');
    expect(f.calls[0].headers.authorization).toBe('Bearer jwt1');
    await hopx.stop('hk', 'sb1~sb1.hopx.dev~jwt1', f);
    expect(f.calls[1]).toMatchObject({ url: 'https://api.hopx.dev/v1/sandboxes/sb1', method: 'DELETE' });
  });
});

describe('runloop', () => {
  test('create asks for a custom size and long-polls until running', async () => {
    const f = fakeFetch([{ body: { id: 'dbx_1', status: 'provisioning' } }, { body: { id: 'dbx_1', status: 'running' } }]);
    expect(await runloop.create('rk', size, f)).toEqual({ id: 'dbx_1' });
    expect(json(f.calls[0]).launch_parameters).toEqual({ resource_size_request: 'CUSTOM_SIZE', custom_cpu_cores: 2, custom_gb_memory: 4, keep_alive_time_seconds: 1800 });
    expect(f.calls[1].url).toBe('https://api.runloop.ai/v1/devboxes/dbx_1/wait_for_status');
  });
  test('run waits for a long command to complete', async () => {
    const f = fakeFetch([{ body: { status: 'running', execution_id: 'ex1' } }, { body: { status: 'completed', execution_id: 'ex1', stdout: 'done', stderr: 'w', exit_status: 2 } }]);
    expect(await runloop.run('rk', 'dbx_1', 'make', f)).toEqual({ stdout: 'done', stderr: 'w', exitCode: 2 });
    expect(json(f.calls[0]).command).toBe('make');
    expect(f.calls[1].url).toBe('https://api.runloop.ai/v1/devboxes/dbx_1/executions/ex1/wait_for_status');
  });
  test('stop shuts the devbox down', async () => {
    const f = fakeFetch([{ body: { status: 'shutdown' } }]);
    await runloop.stop('rk', 'dbx_1', f);
    expect(f.calls[0]).toMatchObject({ url: 'https://api.runloop.ai/v1/devboxes/dbx_1/shutdown', method: 'POST' });
  });
});

describe('blaxel', () => {
  test('create sends memory in MB and a ttl, run goes to the sandbox url, stop deletes by name', async () => {
    const f = fakeFetch([
      { body: { metadata: { name: 'fleet-x', url: 'https://sbx-fleet-x-ws.us-pdx-1.bl.run' }, status: 'DEPLOYED' } },
      { body: { stdout: 'ok', stderr: '', exitCode: 0 } },
      { body: {} },
    ]);
    const { id } = await blaxel.create('ws:bk', size, f);
    expect(id).toBe('fleet-x~https://sbx-fleet-x-ws.us-pdx-1.bl.run');
    expect(json(f.calls[0]).spec.runtime).toMatchObject({ memory: 4096, ttl: '30m' });
    expect(f.calls[0].headers).toMatchObject({ authorization: 'Bearer bk', 'x-blaxel-workspace': 'ws' });
    expect(await blaxel.run('ws:bk', id, 'ls', f)).toEqual({ stdout: 'ok', stderr: '', exitCode: 0 });
    expect(f.calls[1].url).toBe('https://sbx-fleet-x-ws.us-pdx-1.bl.run/process');
    await blaxel.stop('ws:bk', id, f);
    expect(f.calls[2]).toMatchObject({ url: 'https://api.blaxel.ai/v0/sandboxes/fleet-x', method: 'DELETE' });
  });
});

describe('vercel', () => {
  test('the key carries the project and optional team', () => {
    expect(parseVercelKey('tok:prj_1:team_2')).toEqual({ token: 'tok', projectId: 'prj_1', teamId: 'team_2' });
    expect(() => parseVercelKey('tok')).toThrow('project id');
  });
  test('create, run (NDJSON) and stop', async () => {
    const nd = [JSON.stringify({ command: { id: 'c1', exitCode: null } }), JSON.stringify({ stream: 'stdout', data: 'hi\n' }), JSON.stringify({ stream: 'stderr', data: 'w' }), JSON.stringify({ command: { id: 'c1', exitCode: 3 } })].join('\n');
    const f = fakeFetch([
      { body: { sandbox: { name: 'fleet-a', currentSessionId: 's1' }, session: { id: 's1', status: 'pending' } } },
      { body: { session: { id: 's1', status: 'running' } } },
      { body: nd },
      { body: {} },
    ]);
    const { id } = await vercel.create('tok:prj_1:team_2', size, f);
    expect(id).toBe('fleet-a.s1');
    expect(f.calls[0].url).toBe('https://api.vercel.com/v4/sandboxes?teamId=team_2');
    expect(json(f.calls[0])).toMatchObject({ projectId: 'prj_1', resources: { vcpus: 2, memory: 4096 }, timeout: 1800000, persistent: false });
    expect(await vercel.run('tok:prj_1:team_2', id, 'echo hi', f)).toEqual({ stdout: 'hi\n', stderr: 'w', exitCode: 3 });
    expect(json(f.calls[2])).toMatchObject({ command: 'bash', args: ['-lc', 'echo hi'], wait: true, logs: true });
    await vercel.stop('tok:prj_1:team_2', id, f);
    expect(f.calls[3].url).toBe('https://api.vercel.com/v2/sandboxes/fleet-a?teamId=team_2&projectId=prj_1&deleteOrphanSnapshots=true');
  });
  test('an error line in the stream is an error', () => {
    expect(() => readNdjson(JSON.stringify({ stream: 'error', data: 'boom' }))).toThrow('boom');
  });
});

describe('sprites', () => {
  test('binary frames: 1 stdout, 2 stderr, 3 exit', () => {
    const enc = (k, s) => new Uint8Array([k, ...new TextEncoder().encode(s)]);
    expect(readSpriteFrames([enc(1, 'he'), enc(1, 'llo'), enc(2, 'oops'), new Uint8Array([3, 7])])).toEqual({ stdout: 'hello', stderr: 'oops', exitCode: 7 });
  });
  test('create by name, run with cmd params, stop', async () => {
    const f = fakeFetch([{ status: 201, body: { name: 'fleet-s', status: 'cold' } }, { bytes: new Uint8Array([1, 104, 105, 3, 0]) }, { status: 204, body: '' }]);
    expect(await sprites.create('org/id/secret', size, f)).toEqual({ id: 'fleet-s' });
    const out = await sprites.run('k', 'fleet-s', 'echo "a b"', f);
    expect(f.calls[1].url).toBe(`https://api.sprites.dev/v1/sprites/fleet-s/exec?cmd=bash&cmd=-lc&cmd=${encodeURIComponent('echo "a b"').replace(/%20/g, '+')}`);
    expect(out.stdout).toContain('hi');
    await sprites.stop('k', 'fleet-s', f);
    expect(f.calls[2]).toMatchObject({ url: 'https://api.sprites.dev/v1/sprites/fleet-s', method: 'DELETE' });
  });
});

describe('morph', () => {
  test('snapshot, boot, poll, exec, delete', async () => {
    const f = fakeFetch([
      { body: { id: 'snapshot_1', status: 'ready' } },
      { body: { id: 'morphvm_1', status: 'pending' } },
      { body: { id: 'morphvm_1', status: 'ready' } },
      { body: { stdout: 'x', stderr: '', exit_code: 0 } },
      { body: {} },
    ]);
    expect(await morph.create('mk', size, f)).toEqual({ id: 'morphvm_1' });
    expect(json(f.calls[0])).toMatchObject({ image_id: 'morphvm-minimal', vcpus: 2, memory: 4096 });
    expect(json(f.calls[1])).toMatchObject({ snapshot_id: 'snapshot_1', ttl_seconds: 1800, ttl_action: 'stop' });
    expect(await morph.run('mk', 'morphvm_1', 'ls', f)).toEqual({ stdout: 'x', stderr: '', exitCode: 0 });
    expect(json(f.calls[3])).toEqual({ command: ['sh', '-c', 'ls'] });
    await morph.stop('mk', 'morphvm_1', f);
    expect(f.calls[4]).toMatchObject({ url: 'https://cloud.morph.so/api/instance/morphvm_1', method: 'DELETE' });
  });
});

describe('upstash box', () => {
  test('create an ephemeral box, exec, delete', async () => {
    const f = fakeFetch([{ body: { id: 'box_1', status: 'creating' } }, { body: { id: 'box_1', status: 'idle' } }, { body: { output: 'o', error: 'e', exit_code: 1 } }, { body: {} }]);
    expect(await upstash.create('uk', size, f)).toEqual({ id: 'box_1' });
    expect(json(f.calls[0])).toMatchObject({ size: 'small', ephemeral: true, ttl: 1800 });
    expect(f.calls[0].headers['x-box-api-key']).toBe('uk');
    expect(await upstash.run('uk', 'box_1', 'false', f)).toEqual({ stdout: 'o', stderr: 'e', exitCode: 1 });
    await upstash.stop('uk', 'box_1', f);
    expect(f.calls[3]).toMatchObject({ url: 'https://us-east-1.box.upstash.com/v2/box/box_1', method: 'DELETE' });
  });
});
