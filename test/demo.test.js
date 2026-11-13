import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demoPage, demoRun, JOBS, jobOrders, RECORDED } from '../src/demo.js';
import { handle } from '../src/index.js';

// A local "provider": a pod is a folder, and commands really run in it with sh (python3 runs the written tests).
function localProvider() {
  const stops = [];
  const dir = mkdtempSync(join(tmpdir(), 'fleet-race-'));
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

describe('agent race', () => {
  test('all jobs run in parallel, every pod stops, and the planted bug is fixed in the same pod', async () => {
    const { provider, dir, stops } = localProvider();
    const events = [];
    const r = await demoRun({ local: provider }, { local: 'k' }, {}, (e) => events.push(e));
    rmSync(dir, { recursive: true, force: true });
    expect(r.total).toBe(JOBS.length);
    expect(r.passed).toBe(JOBS.length);
    expect(r.ok).toBe(true);
    expect(r.fixed).toBe(1);
    const fixed = r.jobs.find((j) => j.fixed);
    expect(fixed.id).toBe('wordcount');
    expect(fixed.steps.map((s) => s.kind)).toEqual(['start', 'write', 'test', 'fix', 'test', 'stop']);
    expect(fixed.steps[2].ok).toBe(false);
    expect(fixed.steps[4].ok).toBe(true);
    // each test run keeps its own lines: the failing first run stays visible in the log
    expect(fixed.steps[2].output).toContain('test_extra_spaces FAIL');
    expect(fixed.steps[4].output).toContain('test_extra_spaces ok');
    for (const j of r.jobs.filter((x) => !x.fixed)) expect(j.steps.map((s) => s.kind)).toEqual(['start', 'write', 'test', 'stop']);
    expect(stops).toHaveLength(JOBS.length);
    expect(events[0].type).toBe('plan');
    expect(events.filter((e) => e.type === 'job-end')).toHaveLength(JOBS.length);
    const firstEnd = Math.min(...r.jobs.map((j) => j.endMs));
    expect(r.jobs.every((j) => j.startMs < firstEnd)).toBe(true);
  }, 30000);
  test('jobs are spread over the connected providers, each falling back to the others', () => {
    const p = (price) => ({ label: 'x', keyHeader: 'X', price: () => price });
    const { orders } = jobOrders({ a: p(1), b: p(2), c: p(3) }, { a: 'k', b: 'k', c: 'k' });
    expect(orders.map((o) => o[0])).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
    expect(orders[1]).toEqual(['b', 'c', 'a']);
  });
  test('a provider that cannot start a pod falls back to the next one', async () => {
    const { provider, dir } = localProvider();
    const broken = { ...provider, create: async () => { throw new Error('HTTP 503: busy'); }, price: () => 0.001 };
    const r = await demoRun({ broken, local: provider }, { broken: 'k', local: 'k' }, {});
    rmSync(dir, { recursive: true, force: true });
    expect(r.ok).toBe(true);
    expect(r.providersUsed).toEqual(['local']);
    // broken is cheaper, so jobs 1, 3 and 5 ask it first and fall back; jobs 2, 4 and 6 ask local first.
    expect(r.jobs.map((j) => (j.fellBackFrom || []).join())).toEqual(['broken', '', 'broken', '', 'broken', '']);
  }, 30000);
  test('the planted bug is real: the first code fails its test and the fix passes', () => {
    const j = JOBS.find((x) => x.fix);
    expect(j.code).toContain('split(" ")');
    expect(j.fix).toContain('split()');
    expect(j.tests).toContain('extra_spaces');
  });
  test('without a connected provider the run says so', async () => {
    const r = await demoRun({}, {}, {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain('connect');
  });
  test('the page has the run button, the timeline and the endpoint it calls, and says pod not sandbox', () => {
    const html = demoPage();
    expect(html).toContain('id="go"');
    expect(html).toContain("fetch('/console/demo'");
    expect(html).toContain('id="board"');
    expect(html).toContain('noindex');
    expect(html.split('<main')[1].split('</main>')[0].replace(/<script>[^]*?<\/script>/g, '').toLowerCase()).not.toContain('sandbox'); // provider product names live in the logo data only
  });
  test('the recorded run is consistent: real providers, the fix, and the totals add up', () => {
    expect(RECORDED.jobs.map((j) => j.id)).toEqual(JOBS.map((j) => j.id)); // re-record the race (and these ids) whenever the job list changes
    expect(RECORDED.sequentialMs).toBe(RECORDED.jobs.reduce((sum, j) => sum + j.endMs - j.startMs, 0));
    expect(RECORDED.totalMs).toBe(Math.max(...RECORDED.jobs.map((j) => j.endMs)));
    expect(RECORDED.jobs.filter((j) => j.fixed).map((j) => j.id)).toEqual(['wordcount']);
    for (const j of RECORDED.jobs) for (const [a, b] of j.steps.slice(1).map((s, i) => [j.steps[i], s])) expect(b.startMs).toBe(a.endMs);
    expect(JSON.stringify(RECORDED)).not.toContain('pod_');
  });
  test('/demo is public: it plays the recorded run and links to the live race', async () => {
    const r = await handle(new Request('https://fleet.flisk.si/demo'), {});
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('window.__REPLAY__=');
    expect(html).toContain('href="/console/demo"');
    expect(html).toContain('Watch the run');
    expect(demoPage()).not.toContain('window.__REPLAY__=');
  });
  test('the home page sends visitors to the public recorded race, not to a sign-in', async () => {
    const html = await (await handle(new Request('https://fleet.flisk.si/'), {})).text();
    expect(html).toContain('href="/demo">Watch agents race');
  });
  test('every page has Demo in the top nav, pointing at the public race', async () => {
    for (const path of ['/', '/pricing', '/docs', '/demo']) {
      const html = await (await handle(new Request(`https://fleet.flisk.si${path}`), {})).text();
      expect(html).toMatch(/<a href="\/demo"[^>]*>Demo<\/a>/);
    }
  });
});
