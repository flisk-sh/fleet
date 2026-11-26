import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fakeD1 } from './d1.js';
import { listCalls } from '../src/store.js';

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

describe('listCalls', () => {
  test('returns the newest calls first and only the asked login', async () => {
    const env = { DB: fakeD1(SCHEMA) };
    const add = (login, at, status) => env.DB.raw.query('INSERT INTO calls (login, at, kind, status, ms) VALUES (?, ?, ?, ?, ?)').run(login, at, 'run', status, 5);
    add('octo', '2026-11-26T10:00:00Z', 200);
    add('other', '2026-11-26T10:30:00Z', 200);
    add('octo', '2026-11-26T11:00:00Z', 500);
    const all = await listCalls(env, 'octo');
    expect(all.map((c) => c.at)).toEqual(['2026-11-26T11:00:00Z', '2026-11-26T10:00:00Z']);
    expect((await listCalls(env, 'octo', { errorsOnly: true })).map((c) => c.status)).toEqual([500]);
  });

  test('is ordered by the calls_login_at index, not a sort of every row', () => {
    const env = { DB: fakeD1(SCHEMA) };
    const plan = env.DB.raw.query("EXPLAIN QUERY PLAN SELECT * FROM calls WHERE login = ? ORDER BY at DESC, n DESC LIMIT ?").all('octo', 200).map((r) => r.detail).join(' ');
    expect(plan).toContain('calls_login_at');
    expect(plan).not.toContain('TEMP B-TREE');
  });
});
