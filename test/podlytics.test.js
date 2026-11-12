import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { handle } from '../src/index.js';
import { measured, podlyticsData } from '../src/podlytics.js';
import { PROVIDERS } from '../src/providers/index.js';
import { fakeD1 } from './d1.js';

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const ORIGIN = 'https://fleet.test';
const NOW = new Date('2026-11-12T12:00:00Z');

function seeded() {
  const DB = fakeD1(SCHEMA);
  const add = (login, at, kind, provider, status, ms) =>
    DB.raw.query('INSERT INTO calls (login, at, kind, provider, ref, status, ms) VALUES (?, ?, ?, ?, ?, ?, ?)').run(login, at, kind, provider, 'pod_secretref', status, ms);
  const day = '2026-11-12T10:00:00.000Z';
  add('alice', day, 'start', 'daytona', 201, 3000);
  add('bob', day, 'start', 'daytona', 201, 4000);
  add('bob', day, 'start', 'daytona', 502, 900);
  add('alice', day, 'run', 'daytona', 200, 700);
  add('alice', '2026-09-01T00:00:00.000Z', 'start', 'daytona', 201, 99999); // older than 30 days
  return { DB };
}

describe('podlytics', () => {
  test('sums calls over every account, only successful calls count for speed, old calls drop out', async () => {
    const s = await measured(seeded(), NOW);
    expect(s.daytona.start).toEqual({ n: 3, ok: 2, p50: 4000, p90: 4000 });
    expect(s.daytona.run.p50).toBe(700);
    expect(await measured({}, NOW)).toEqual({});
  });

  test('every real provider is charted with a price per size; demo is not', () => {
    const d = podlyticsData(PROVIDERS, {});
    const ids = d.map((p) => p.id);
    for (const id of ['boat', 'daytona', 'e2b', 'isorun']) expect(ids).toContain(id);
    expect(ids).not.toContain('demo');
    expect(new Set(d.map((p) => p.color)).size).toBe(d.length); // every provider has its own colour
    for (const p of d) expect(p.hourly).toHaveLength(5);
    expect(d.find((p) => p.id === 'daytona').working).toBeTruthy();
    expect(d.find((p) => p.id === 'daytona').hourly[4]).toBeNull(); // Daytona stops at 4 vCPU
  });

  test('the page is public, its script parses, and no login or pod id reaches it', async () => {
    const res = await handle(new Request(`${ORIGIN}/podlytics`), seeded(), { providers: PROVIDERS });
    expect(res.status).toBe(200);
    const html = await res.text();
    for (const t of ['pod<span class="d">lytics</span></span>', 'Cost vs size', 'Start time vs cost', 'Starts that worked', '"id":"daytona"']) expect(html).toContain(t);
    for (const secret of ['alice', 'bob', 'secretref', '"id":"demo"']) expect(html).not.toContain(secret);
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) expect(() => new Function(m[1])).not.toThrow();
    const home = await (await handle(new Request(`${ORIGIN}/`), {}, { providers: PROVIDERS })).text();
    expect(home).toContain('href="/podlytics"');
  });
});
