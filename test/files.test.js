// Run options and files are shell lines fleet builds on top of run(). These tests run those lines in a real sh,
// in a temp folder that stands in for the pod, so a quoting mistake fails here and not on a user's pod.
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handle } from '../src/index.js';
import { readFile, runPod, shq, wrapCommand, writeFile, MAX_FILE_BYTES } from '../src/route.js';
import { createKey } from '../src/store.js';
import { fakeD1 } from './d1.js';

const dir = mkdtempSync(join(tmpdir(), 'fleet-pod-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// A provider whose pod is a local sh in `dir`, like a provider that runs the line in a shell.
const shell = {
  label: 'shell',
  keyHeader: 'X-shell-Key',
  price: () => 0.01,
  create: async () => ({ id: 'local' }),
  async run(key, id, command) {
    const p = Bun.spawnSync(['sh', '-c', command], { cwd: dir, env: { PATH: process.env.PATH } });
    return { stdout: p.stdout.toString(), stderr: p.stderr.toString(), exitCode: p.exitCode };
  },
  stop: async () => {},
};
const providers = { shell };
const keys = { shell: 'k' };
const ID = 'pod_shell_local';

describe('wrapCommand', () => {
  test('no options leaves the command alone', () => {
    expect(wrapCommand('ls -la')).toEqual({ command: 'ls -la' });
  });
  test('bad options are refused', () => {
    expect(wrapCommand('ls', { env: { '1x': 'a' } }).error).toContain('not a valid variable name');
    expect(wrapCommand('ls', { env: ['a'] }).error).toContain('object');
    expect(wrapCommand('ls', { env: { A: { b: 1 } } }).error).toContain('string');
    expect(wrapCommand('ls', { cwd: '' }).error).toContain('cwd');
    expect(wrapCommand('ls', { timeout: 0 }).error).toContain('timeout');
    expect(wrapCommand('ls', { timeout: 1.5 }).error).toContain('timeout');
  });
  test('shq survives quotes', async () => {
    const r = await runPod(providers, keys, ID, { command: `printf %s ${shq(`it's "quoted" $HOME \`x\``)}` });
    expect(r.result.stdout).toBe(`it's "quoted" $HOME \`x\``);
  });
});

describe('run options in a real shell', () => {
  test('env and cwd', async () => {
    const r = await runPod(providers, keys, ID, { command: 'echo "$GREETING $WHO" && pwd', env: { GREETING: "it's", WHO: 'me; rm -rf /' }, cwd: '/tmp' });
    expect(r.status).toBe(200);
    const [said, where] = r.result.stdout.trim().split('\n');
    expect(said).toBe("it's me; rm -rf /");
    expect(where).toMatch(/\/tmp$/);
    expect(r.result.timedOut).toBeUndefined();
  });
  test('timeout stops a long command and says so', async () => {
    const t0 = Date.now();
    const r = await runPod(providers, keys, ID, { command: 'sleep 5', timeout: 1 });
    expect(Date.now() - t0).toBeLessThan(4000);
    expect(r.result.timedOut).toBe(true);
    expect(r.result.exitCode).toBe(124);
  });
  test('a quick command with a timeout is not timed out', async () => {
    const r = await runPod(providers, keys, ID, { command: 'echo ok', timeout: 5 });
    expect(r.result).toMatchObject({ stdout: 'ok\n', exitCode: 0, timedOut: false });
  });
});

describe('files in a real shell', () => {
  test('write text, making folders, then read it back', async () => {
    const text = "line one\nit's \"two\" $PATH `three`\nüñïçødé ✓\n";
    const w = await writeFile(providers, keys, ID, { path: 'deep/er/note.txt', content: text });
    expect(w).toEqual({ status: 200, result: { path: 'deep/er/note.txt', bytes: new TextEncoder().encode(text).length } });
    expect(readFileSync(join(dir, 'deep/er/note.txt'), 'utf8')).toBe(text);
    const r = await readFile(providers, keys, ID, { path: 'deep/er/note.txt' });
    expect(r.result).toMatchObject({ encoding: 'utf8', content: text });
  });
  test('binary goes in and comes out as base64', async () => {
    const bytes = new Uint8Array([0, 255, 128, 10, 0xc3]);
    const b64 = btoa(String.fromCharCode(...bytes));
    expect((await writeFile(providers, keys, ID, { path: 'bin.dat', content: b64, encoding: 'base64' })).status).toBe(200);
    expect([...readFileSync(join(dir, 'bin.dat'))]).toEqual([...bytes]);
    const r = await readFile(providers, keys, ID, { path: 'bin.dat' });
    expect(r.result).toMatchObject({ encoding: 'base64', content: b64, bytes: 5 });
  });
  test('a path with spaces and quotes', async () => {
    const path = "my dir/it's here.txt";
    expect((await writeFile(providers, keys, ID, { path, content: 'x' })).status).toBe(200);
    expect((await readFile(providers, keys, ID, { path })).result.content).toBe('x');
  });
  test('missing file is 404, big file is 413, bad input is 400', async () => {
    expect((await readFile(providers, keys, ID, { path: 'nope.txt' })).status).toBe(404);
    writeFileSync(join(dir, 'big.bin'), new Uint8Array(MAX_FILE_BYTES + 1));
    const big = await readFile(providers, keys, ID, { path: 'big.bin' });
    expect(big.status).toBe(413);
    expect((await writeFile(providers, keys, ID, { path: 'x', content: 'a'.repeat(MAX_FILE_BYTES + 1) })).status).toBe(413);
    expect((await writeFile(providers, keys, ID, { path: '', content: 'a' })).status).toBe(400);
    expect((await writeFile(providers, keys, ID, { path: 'a', content: 1 })).status).toBe(400);
    expect((await writeFile(providers, keys, ID, { path: 'a', content: 'a', encoding: 'hex' })).status).toBe(400);
    expect((await readFile(providers, keys, ID, {})).status).toBe(400);
  });
  test('writing into a place the pod cannot write is 422 with the reason', async () => {
    writeFileSync(join(dir, 'afile'), 'x');
    const r = await writeFile(providers, keys, ID, { path: 'afile/inside.txt', content: 'x' });
    expect(r.status).toBe(422);
    expect(r.error).toContain('could not write');
  });
});

describe('HTTP and MCP', () => {
  const ORIGIN = 'https://fleet.test';
  const setup = async () => {
    const env = { DB: fakeD1(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')), PUBLIC_ORIGIN: ORIGIN };
    const { key } = await createKey(env, 'octo', 'ci');
    const req = (method, path, body) =>
      handle(new Request(`${ORIGIN}${path}`, { method, headers: { authorization: `Bearer ${key}`, 'X-shell-Key': 'k' }, body: body === undefined ? undefined : JSON.stringify(body) }), env, { providers });
    return { req };
  };
  test('PUT and GET /v1/pods/:id/files, GET /v1/pods', async () => {
    const { req } = await setup();
    const made = await (await req('POST', '/v1/pods', {})).json();
    expect((await req('PUT', `/v1/pods/${made.id}/files`, { path: 'api.txt', content: 'hello' })).status).toBe(200);
    const got = await (await req('GET', `/v1/pods/${made.id}/files?path=api.txt`)).json();
    expect(got.content).toBe('hello');
    const list = await (await req('GET', '/v1/pods')).json();
    expect(list.pods).toHaveLength(1);
    expect(list.pods[0]).toMatchObject({ id: made.id, provider: 'shell', status: 'running' });
    expect((await (await req('GET', '/v1/pods?status=stopped')).json()).pods).toHaveLength(0);
    await req('DELETE', `/v1/pods/${made.id}`);
    expect((await (await req('GET', '/v1/pods?status=stopped')).json()).pods).toHaveLength(1);
  });
  test('MCP pod_write_file, pod_read_file, pod_list and pod_run with options', async () => {
    const { req } = await setup();
    const call = async (name, args) => {
      const r = await (await req('POST', '/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).json();
      return { isError: r.result.isError, data: JSON.parse(r.result.content[0].text) };
    };
    const { data: pod } = await call('pod_create', {});
    expect((await call('pod_write_file', { id: pod.id, path: 'm/cp.txt', content: 'via mcp' })).isError).toBe(false);
    expect((await call('pod_read_file', { id: pod.id, path: 'm/cp.txt' })).data.content).toBe('via mcp');
    expect((await call('pod_read_file', { id: pod.id, path: 'm/none' })).isError).toBe(true);
    expect((await call('pod_run', { id: pod.id, command: 'cat cp.txt; echo " $X"', cwd: 'm', env: { X: 'y' } })).data.stdout).toBe('via mcp y\n');
    const { data: list } = await call('pod_list', { status: 'running' });
    expect(list.pods.map((p) => p.id)).toEqual([pod.id]);
  });
});

describe('timeout on an image whose timeout(1) dies from the signal (busybox, as on Blaxel)', () => {
  test('a stub timeout that sleeps then kills itself still ends as 124 and timedOut', async () => {
    const bin = mkdtempSync(join(tmpdir(), 'fleet-bin-'));
    writeFileSync(join(bin, 'timeout'), '#!/bin/sh\nsleep "$3"\nkill -TERM $$\n', { mode: 0o755 });
    const stubbed = {
      ...shell,
      async run(key, id, command) {
        const p = Bun.spawnSync(['sh', '-c', command], { cwd: dir, env: { PATH: `${bin}:${process.env.PATH}` } });
        return { stdout: p.stdout.toString(), stderr: p.stderr.toString(), exitCode: p.exitCode ?? -1 };
      },
    };
    const r = await runPod({ shell: stubbed }, keys, ID, { command: 'sleep 9', timeout: 1 });
    rmSync(bin, { recursive: true, force: true });
    expect(r.result).toMatchObject({ exitCode: 124, timedOut: true });
  });
  test('a command that fails fast with a high exit code is not called a timeout', async () => {
    const r = await runPod(providers, keys, ID, { command: 'exit 200', timeout: 5 });
    expect(r.result).toMatchObject({ exitCode: 200, timedOut: false });
  });
});
