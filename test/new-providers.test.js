// The seven coming-soon providers added on 2026-11-12, tested against fake replies shaped like each provider's docs.
// None has met a real account: these tests pin what fleet sends and how it reads the answer, nothing more.
import { describe, expect, test } from 'bun:test';
import hopx from '../src/providers/hopx.js';
import runloop, { runloopSize, uuidv7 } from '../src/providers/runloop.js';
import e2b from '../src/providers/e2b.js';
import blaxel, { blaxelGb } from '../src/providers/blaxel.js';
import vercel, { parseVercelKey, readNdjson, vercelVcpus } from '../src/providers/vercel.js';
import sprites, { readSpriteFrames } from '../src/providers/sprites.js';
import morph, { morphMcu } from '../src/providers/morph.js';
import upstash, { upstashSize } from '../src/providers/upstash.js';
import tensorlake, { tensorlakeRam } from '../src/providers/tensorlake.js';
import freestyle from '../src/providers/freestyle.js';
import langsmith, { langsmithRam } from '../src/providers/langsmith.js';
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

describe('credentials with more than one part', async () => {
  const { joinFields, fieldsOf, splitFields } = await import('../src/providers/fields.js');
  test('most providers need one key; blaxel, vercel and boat need more', () => {
    for (const [name, p] of Object.entries(PROVIDERS)) {
      if (p.demo) continue;
      const n = fieldsOf(p).length;
      expect(n).toBe({ blaxel: 2, vercel: 3, boat: 2 }[name] ?? 1);
    }
  });
  test('parts join with a colon in order, optional trailing parts are dropped', () => {
    expect(joinFields(blaxel, { workspace: ' my-ws ', key: 'bl_abc' })).toEqual({ value: 'my-ws:bl_abc' });
    expect(joinFields(vercel, { token: 't', projectId: 'prj_1', teamId: '' })).toEqual({ value: 't:prj_1' });
    expect(joinFields(vercel, { token: 't', projectId: 'prj_1', teamId: 'team_2' })).toEqual({ value: 't:prj_1:team_2' });
    expect(joinFields(hopx, { key: 'k' })).toEqual({ value: 'k' });
  });
  test('a missing required part or a colon inside a part is refused', () => {
    expect(joinFields(blaxel, { workspace: '', key: 'bl_abc' }).error).toContain('Workspace');
    expect(joinFields(vercel, { token: 't', projectId: '', teamId: '' }).error).toContain('Project ID');
    expect(joinFields(blaxel, { workspace: 'a:b', key: 'k' }).error).toContain('colon');
  });
  test('what joinFields makes, the adapters read: blaxel header and vercel key', () => {
    expect(splitFields(blaxel, 'my-ws:bl_abc')).toEqual({ workspace: 'my-ws', key: 'bl_abc' });
    expect(parseVercelKey(joinFields(vercel, { token: 't', projectId: 'prj_1', teamId: 'team_2' }).value)).toEqual({ token: 't', projectId: 'prj_1', teamId: 'team_2' });
  });
  test('boat sends the optional organization as X-Boat-Org', async () => {
    const boat = (await import('../src/providers/boat.js')).default;
    const f = fakeFetch([{ status: 202, body: { sandbox: { id: 'bx_1' } } }, { status: 202, body: { sandbox: { id: 'bx_2' } } }]);
    await boat.create('boat_k:acme', size, f);
    expect(f.calls[0].headers).toMatchObject({ authorization: 'Bearer boat_k', 'x-boat-org': 'acme' });
    await boat.create('boat_k', size, f);
    expect(f.calls[1].headers['x-boat-org']).toBeUndefined();
  });
});

describe('every request to a provider carries a User-Agent', () => {
  test('call() and the direct fetches (e2b, sprites, vercel run) say who fleet is', async () => {
    const { UA } = await import('../src/providers/http.js');
    expect(UA).toContain('fleet');
    const seen = [];
    const spy = async (url, init = {}) => {
      seen.push(init.headers || {});
      return new Response('{}', { status: 200 });
    };
    await blaxel.create('ws:k', size, { fetchImpl: async (u, i) => (seen.push(i.headers), new Response(JSON.stringify({ metadata: { name: 'n', url: 'https://x' } }))) }).catch(() => {});
    await e2b.run('k', 'sb~tok~', 'ls', { fetchImpl: spy }).catch(() => {});
    await sprites.run('k', 'sp', 'ls', { fetchImpl: spy }).catch(() => {});
    await vercel.run('t:p', 'n.s', 'ls', { fetchImpl: spy }).catch(() => {});
    expect(seen).toHaveLength(4);
    for (const h of seen) expect(h['user-agent']).toBe(UA);
  });
});

describe('vercel lifetime on the Hobby plan', () => {
  test('a longer ttl is capped at 45 minutes', async () => {
    const f = fakeFetch([{ body: { sandbox: { name: 'n' }, session: { id: 's', status: 'running' } } }]);
    await vercel.create('tok:prj_1', { cpu: 1, ram: 1, ttl: 3600 }, f);
    expect(json(f.calls[0]).timeout).toBe(2700000);
  });
});

describe('tensorlake (written from docs.tensorlake.ai, 2026-11-12)', () => {
  const id = 'sbx_123';
  test('create asks for resources inside the 1-8 GB per vCPU rule and waits for running', async () => {
    const f = fakeFetch([{ body: { sandbox_id: id, status: 'pending' } }, { body: { sandbox_id: id, status: 'running' } }]);
    const r = await tensorlake.create('tl_apiKey_x', size, f);
    expect(r).toEqual({ id });
    expect(f.calls[0].url).toBe('https://api.tensorlake.ai/sandboxes');
    expect(f.calls[0].headers.authorization).toBe('Bearer tl_apiKey_x');
    expect(json(f.calls[0])).toEqual({ resources: { cpus: 2, memory_mb: 4096 }, timeout_secs: 1800 });
    expect(tensorlakeRam({ cpu: 1, ram: 64 })).toBe(8);
    expect(tensorlakeRam({ cpu: 4, ram: 1 })).toBe(4);
  });
  test('create fails plainly when the sandbox never runs', async () => {
    const f = fakeFetch([{ body: { sandbox_id: id, status: 'terminated' } }]);
    await expect(tensorlake.create('k', size, f)).rejects.toThrow('terminated');
  });
  test('run starts sh -c, polls the process, then reads stdout and stderr lines', async () => {
    const f = fakeFetch([
      { body: { pid: 7, status: 'running' } },
      { body: { pid: 7, status: 'exited', exit_code: 3 } },
      { body: { lines: ['a', 'b'] } },
      { body: { lines: ['oops'] } },
    ]);
    const r = await tensorlake.run('k', id, 'echo a; echo b', f);
    expect(r).toEqual({ stdout: 'a\nb\n', stderr: 'oops\n', exitCode: 3 }); // line lists carry no line ends: the last one is put back
    expect(f.calls[0].url).toBe('https://sbx_123.sandbox.tensorlake.ai/api/v1/processes');
    expect(json(f.calls[0])).toEqual({ command: 'sh', args: ['-c', 'cd "$HOME" 2>/dev/null; echo a; echo b'] }); // starts in /, which is root-owned
    expect(f.calls[2].url).toEndWith('/api/v1/processes/7/stdout');
  });
  test('empty output stays empty', async () => {
    const f = fakeFetch([{ body: { pid: 7, status: 'exited', exit_code: 0 } }, { body: { lines: [] } }, { body: { lines: [] } }]);
    expect(await tensorlake.run('k', id, 'true', f)).toEqual({ stdout: '', stderr: '', exitCode: 0 });
  });
  test('stop deletes the sandbox; price and size', async () => {
    const f = fakeFetch([{ body: null }]);
    await tensorlake.stop('k', id, f);
    expect(f.calls[0]).toMatchObject({ method: 'DELETE', url: 'https://api.tensorlake.ai/sandboxes/sbx_123' });
    expect(tensorlake.price(size)).toBe(0.2);
    expect(tensorlake.price({ cpu: 32, ram: 64 })).toBeNull();
  });
});

describe('freestyle (REST paths read from the freestyle npm package, 2026-11-12)', () => {
  const id = 'vm-abc';
  test('create lets the VM out to the Internet, then grows it to the asked size', async () => {
    const f = fakeFetch([{ body: { id, state: 'starting' } }, { body: { id, state: 'running' } }, { body: {} }]);
    expect(await freestyle.create('fk', size, f)).toEqual({ id });
    expect(f.calls[0].url).toBe('https://api.freestyle.sh/v5/vms');
    expect(f.calls[0].headers.authorization).toBe('Bearer fk');
    expect(json(f.calls[0]).firewall.rules[0]).toEqual({ action: 'allow', source: {}, destination: { public: true } });
    expect(json(f.calls[0]).ttlSeconds).toBe(1800);
    expect(f.calls[2].url).toBe('https://api.freestyle.sh/v5/vms/vm-abc/resize');
    expect(json(f.calls[2])).toEqual({ cpu: 2, memory: 4096 });
  });
  test('a refused grow-only resize keeps the default VM, a server error does not', async () => {
    const ok = fakeFetch([{ body: { id, state: 'running' } }, { status: 400, body: { message: 'grow-only' } }]);
    expect(await freestyle.create('fk', size, ok)).toEqual({ id });
    const bad = fakeFetch([{ body: { id, state: 'running' } }, { status: 500, body: { message: 'boom' } }]);
    await expect(freestyle.create('fk', size, bad)).rejects.toThrow('HTTP 500');
  });
  test('run uses exec-await and reads statusCode; a killed command is 124', async () => {
    const f = fakeFetch([{ body: { stdout: 'hi\n', stderr: '', statusCode: 0 } }, { body: { stdout: '', stderr: '', statusCode: null } }]);
    expect(await freestyle.run('fk', id, 'echo hi', f)).toEqual({ stdout: 'hi\n', stderr: '', exitCode: 0 });
    expect(f.calls[0].url).toBe('https://api.freestyle.sh/v5/vms/vm-abc/exec-await');
    expect(json(f.calls[0])).toEqual({ command: 'echo hi', timeoutMs: 300000 });
    expect((await freestyle.run('fk', id, 'sleep 99', f)).exitCode).toBe(124);
  });
  test('stop deletes the VM; price', async () => {
    const f = fakeFetch([{ body: null }]);
    await freestyle.stop('fk', id, f);
    expect(f.calls[0]).toMatchObject({ method: 'DELETE', url: 'https://api.freestyle.sh/v5/vms/vm-abc' });
    expect(freestyle.price(size)).toBe(0.132);
  });
});

describe('langsmith sandboxes (written from the LangSmith REST docs, 2026-11-12)', () => {
  const id = 'f1e2-uuid';
  test('create makes a disposable sandbox with memory inside the 2-6 GiB per vCPU band', async () => {
    const f = fakeFetch([{ status: 201, body: { id, name: 'sbx', status: 'provisioning' } }, { body: { status: 'ready' } }]);
    expect(await langsmith.create('lsv2_x', size, f)).toEqual({ id });
    expect(f.calls[0].url).toBe('https://api.smith.langchain.com/api/v2/sandboxes/boxes');
    expect(f.calls[0].headers['x-api-key']).toBe('lsv2_x');
    expect(json(f.calls[0])).toEqual({ vcpus: 2, mem_bytes: 4 * 1024 ** 3, persistent: false, idle_ttl_seconds: 1800 });
    expect(f.calls[1].url).toBe('https://api.smith.langchain.com/api/v2/sandboxes/boxes/f1e2-uuid/status');
    expect(langsmithRam({ cpu: 1, ram: 1 })).toBe(2);
    expect(langsmithRam({ cpu: 1, ram: 32 })).toBe(6);
  });
  test('create names a failed sandbox', async () => {
    const f = fakeFetch([{ status: 201, body: { id, status: 'failed', status_message: 'no capacity' } }]);
    await expect(langsmith.create('k', size, f)).rejects.toThrow('no capacity');
  });
  test('run posts an sh -c argv to execute and reads exit_code', async () => {
    const f = fakeFetch([{ body: { stdout: 'x\n', stderr: 'e', exit_code: 2 } }]);
    expect(await langsmith.run('k', id, 'echo x', f)).toEqual({ stdout: 'x\n', stderr: 'e', exitCode: 2 });
    expect(f.calls[0].url).toBe('https://api.smith.langchain.com/api/v2/sandboxes/f1e2-uuid/execute');
    expect(json(f.calls[0]).command).toEqual(['sh', '-c', 'echo x']);
  });
  test('stop deletes the box; price', async () => {
    const f = fakeFetch([{ status: 204, bytes: '' }]);
    await langsmith.stop('k', id, f);
    expect(f.calls[0]).toMatchObject({ method: 'DELETE', url: 'https://api.smith.langchain.com/api/v2/sandboxes/boxes/f1e2-uuid' });
    expect(langsmith.price(size)).toBe(0.189);
  });
});
