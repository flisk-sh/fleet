// The browser pod's page-side half (web/browserpod/pod.js) against a stand-in for the emulator: the shared folder is a
// real temp folder and every line "typed" on the console runs in a real sh, so the runner script itself is tested.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_FILE, exitOf, podOver, sq } from '../web/browserpod/pod.js';

function fakeEngine(dir) {
  const shared = join(dir, 'mnt');
  const home = join(dir, 'home');
  mkdirSync(shared);
  mkdirSync(home);
  let listener = () => {};
  const say = (text) => { for (const b of Buffer.from(text)) listener(b); };
  const typed = [];
  return {
    typed,
    destroyed: false,
    add_listener: (_name, fn) => { listener = fn; setTimeout(() => say('Welcome\r\n~% '), 5); },
    serial0_send(line) {
      typed.push(line);
      // The boot line: the real image mounts the folder; here it only has to exist.
      if (line.includes('stty -echo')) { mkdirSync(join(shared, '.pod'), { recursive: true }); return say('@@podup@@\r\n'); }
      const child = spawn('sh', ['-c', line.replaceAll('/mnt/.pod', join(shared, '.pod'))], { env: { PATH: process.env.PATH, HOME: home } });
      child.stdout.on('data', (d) => say(String(d)));
    },
    create_file: async (path, bytes) => {
      const text = path === '/.pod/run' || /\/c\d+$/.test(path) ? Buffer.from(String(Buffer.from(bytes)).replaceAll('/mnt/.pod', join(shared, '.pod'))) : Buffer.from(bytes);
      writeFileSync(join(shared, path), text);
    },
    read_file: async (path) => new Uint8Array(readFileSync(join(shared, path))),
    destroy() { this.destroyed = true; },
  };
}

describe('browser pod', () => {
  let dir, engine, pod;
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'browserpod-'));
    engine = fakeEngine(dir);
    pod = podOver(engine);
    await pod.ready(5000);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test('run gives stdout, stderr and the exit code, and starts in the home folder', async () => {
    const r = await pod.run('echo hi; pwd; echo oops >&2; exit 3');
    expect(r.stdout).toContain('hi\n');
    expect(r.stdout).toContain(join(dir, 'home'));
    expect(r.stderr).toBe('oops\n');
    expect(r.exitCode).toBe(3);
  });

  test('output with the done mark or a prompt in it cannot end a command early', async () => {
    const r = await pod.run('echo "@@poddone99@@ ~% "; sleep 0.2; echo after');
    expect(r.stdout).toBe('@@poddone99@@ ~% \nafter\n');
  });

  test('a command over its time is killed and reports 124', async () => {
    const t = Date.now();
    const r = await pod.run('sleep 20; echo never', { timeout: 1 });
    expect(r.exitCode).toBe(124);
    expect(r.stdout).toBe('');
    expect(Date.now() - t).toBeLessThan(8000);
    expect((await pod.run('echo alive')).stdout).toBe('alive\n');
  });

  test('write then read, with quotes in the path, in a new folder', async () => {
    await pod.write("site/it's here/index.html", "<h1>café 'x'</h1>\n");
    expect(await pod.read("site/it's here/index.html")).toEqual({ content: "<h1>café 'x'</h1>\n", encoding: 'utf8' });
    expect((await pod.run("cat \"site/it's here/index.html\"")).stdout).toContain('café');
  });

  test('bytes that are not text come back as base64', async () => {
    await pod.write('pic.bin', new Uint8Array([0, 255, 254, 1]));
    expect(await pod.read('pic.bin')).toEqual({ content: Buffer.from([0, 255, 254, 1]).toString('base64'), encoding: 'base64' });
  });

  test('a missing file and a file over the cap are errors, not empty answers', async () => {
    await expect(pod.read('nope.txt')).rejects.toThrow(/no such file/);
    await expect(pod.write('big', 'x'.repeat(MAX_FILE + 1))).rejects.toThrow(/over 256 KB/);
  });

  test('calls made at the same time run one after another', async () => {
    const [a, b] = await Promise.all([pod.run('sleep 0.3; echo a'), pod.run('echo b')]);
    expect([a.stdout, b.stdout]).toEqual(['a\n', 'b\n']);
  });

  test('stop ends the engine and later calls say so', async () => {
    await pod.stop();
    expect(engine.destroyed).toBe(true);
    await expect(pod.run('echo x')).rejects.toThrow(/stopped/);
  });
});

describe('browser pod helpers', () => {
  test('sq keeps any path one shell word', () => {
    expect(sq("a'b; rm -rf /")).toBe(`'a'\\''b; rm -rf /'`);
  });
  test('exitOf maps a kill and a lost mark to 124, garbage to -1', () => {
    expect(exitOf('0\n', false)).toBe(0);
    expect(exitOf('137\n', false)).toBe(124);
    expect(exitOf('', true)).toBe(124);
    expect(exitOf('', false)).toBe(-1);
  });
  test('a pod that never shows a prompt fails to start', async () => {
    const quiet = { add_listener() {}, serial0_send() {}, create_file: async () => {}, read_file: async () => new Uint8Array() };
    await expect(podOver(quiet).ready(50)).rejects.toThrow(/did not start/);
  });
});
