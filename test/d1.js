// A small stand-in for Cloudflare D1 over bun:sqlite, for tests and the local dev server.
import { Database } from 'bun:sqlite';

export function fakeD1(schema) {
  const db = new Database(':memory:');
  db.exec(schema);
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    first: async () => db.query(sql).get(...params) ?? null,
    all: async () => ({ results: db.query(sql).all(...params) }),
    run: async () => {
      const r = db.query(sql).run(...params);
      return { meta: { changes: r.changes } };
    },
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.run())), raw: db };
}
