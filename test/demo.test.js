import { describe, expect, test } from 'bun:test';
import { demoRun, DEMO_FILES, demoPage } from '../src/demo.js';

// A fake sandbox provider whose "python3 -m unittest" really runs the written tests in a temp folder.
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function localProvider(label = 'local') {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-demo-'));
  return {
    dir,
    provider: {
      label,
      keyHeader: 'X-Local-Key',
      price: () => 0.01,
      create: async () => ({ id: 'local' }),
      async run(key, id, command, { cwd } = {}) {
        const p = Bun.spawnSync(['sh', '-c', command], { cwd: join(dir, cwd || '.'), env: { PATH: process.env.PATH } });
        return { stdout: p.stdout.toString(), stderr: p.stderr.toString(), exitCode: p.exitCode };
      },
      async writeFile() {},
      stop: async () => {},
    },
  };
}
const write = (dir, path, content) => {
  mkdirSync(join(dir, path.split('/').slice(0, -1).join('/')), { recursive: true });
  writeFileSync(join(dir, path), content);
};

describe('agent demo', () => {
  test('the written code and tests pass when run for real, and the sandbox is stopped', async () => {
    const { provider, dir } = localProvider();
    for (const [p, c] of Object.entries(DEMO_FILES)) write(dir, p, c);
    const providers = { local: provider };
    const r = await demoRun(providers, { local: 'k' }, {});
    rmSync(dir, { recursive: true, force: true });
    expect(r.ok).toBe(true);
    expect(r.steps.map((s) => s.name)).toEqual(['Start a sandbox on the cheapest provider you connected', 'Write the agent\'s code and its tests', 'Run the tests (60 s limit)', 'Stop the sandbox']);
    expect(r.steps.every((s) => s.ok)).toBe(true);
  });
  test('without a connected provider the start step says so, and nothing is run', async () => {
    const r = await demoRun({}, {}, {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain('no provider');
  });
  test('the page has the button and the endpoint it calls', () => {
    const html = demoPage();
    expect(html).toContain('id="go"');
    expect(html).toContain("fetch('/console/demo'");
    expect(html).toContain('noindex');
  });
});
