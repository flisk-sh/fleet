import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demoRun, demoPage, FLAVOURS, flavourFiles } from '../src/demo.js';

// A local "provider": a pod is a folder, and commands really run in it with sh (python3 runs the written tests).
function localProvider() {
  const stops = [];
  const dir = mkdtempSync(join(tmpdir(), 'fleet-icecream-'));
  let n = 0;
  return {
    dir,
    stops,
    provider: {
      label: 'local',
      keyHeader: 'X-Local-Key',
      price: () => 0.01,
      create: async () => {
        const id = `pod${++n}`;
        mkdirSync(join(dir, id), { recursive: true });
        return { id };
      },
      async run(key, id, command, { cwd } = {}) {
        const root = join(dir, id);
        const p = Bun.spawnSync(['sh', '-c', command], { cwd: join(root, cwd || '.'), env: { PATH: process.env.PATH } });
        return { stdout: p.stdout.toString(), stderr: p.stderr.toString(), exitCode: p.exitCode };
      },
      stop: async (key, id) => {
        stops.push(id);
      },
    },
  };
}

describe('ice-cream saga', () => {
  test('four flavours run in parallel; the planted bug is undone and its kitchen closed; the others are served', async () => {
    const { provider, dir, stops } = localProvider();
    // Each pod is a folder: writeFile runs a shell line in it, so the files land under that pod's folder.
    const r = await demoRun({ local: provider }, { local: 'k' }, {});
    rmSync(dir, { recursive: true, force: true });
    expect(r.total).toBe(FLAVOURS.length);
    expect(r.served).toBe(FLAVOURS.length - 1);
    expect(r.ok).toBe(false);
    const straw = r.flavours.find((f) => f.name === 'Strawberry');
    expect(straw.ok).toBe(false);
    expect(straw.steps.at(-1).name).toBe('Undo: close the kitchen');
    expect(straw.steps.at(-1).kind).toBe('undo'); // the page keeps the recalled ship in the harbour for this kind
    expect(r.flavours.find((f) => f.name === 'Vanilla').steps.at(-1).kind).toBe('close');
    expect(stops).toHaveLength(FLAVOURS.length); // every kitchen closes, served or undone
    // parallel: every flavour starts before the first one ends
    const firstEnd = Math.min(...r.flavours.map((f) => f.endMs));
    expect(r.flavours.every((f) => f.startMs < firstEnd)).toBe(true);
  }, 30000); // four real python runs at once: slow on a busy machine
  test('a flavour without the bug has passing tests in its own output', async () => {
    const f = FLAVOURS.find((x) => !x.bug);
    const files = flavourFiles(f);
    expect(files['work/scoop.py']).toContain(`return flavour + " scoop"`);
    expect(files['work/test_scoop.py']).toContain(`"${f.name} scoop"`);
  });
  test('without a connected provider the order says so', async () => {
    const r = await demoRun({}, {}, {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain('connect');
  });
  test('the page has the order button, the animation and the endpoint it calls', () => {
    const html = demoPage();
    expect(html).toContain('id="go"');
    expect(html).toContain("fetch('/console/demo'");
    expect(html).toContain('transition');
    expect(html).toContain('noindex');
  });
});
