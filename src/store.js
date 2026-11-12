// What fleet remembers, in D1 (see schema.sql). Never a provider key, never a provider's access token.
// Free plan: 100,000 rows written and 5 million rows read a day, so every write here is one row and every read uses an index.
import { sha256, newFleetKey } from './auth.js';

export const MAX_KEYS = 10;
const MAX_PODS = 100;
const DAY = 86400_000;
const HOUR = 3600_000;

const nowIso = () => new Date().toISOString();
const parse = (s, fallback) => {
  try {
    return s ? JSON.parse(s) : fallback;
  } catch {
    return fallback;
  }
};
const keyRow = (r) => ({ id: r.id, name: r.name, hash: r.hash, hint: r.hint, created: r.created, lastUsed: r.last_used });
const podRow = (r) => ({
  ref: r.ref,
  provider: r.provider,
  cpu: r.cpu,
  ram: r.ram,
  price: r.price,
  started: r.started,
  stopped: r.stopped,
  gone: r.gone,
  movedFrom: parse(r.moved_from, []),
  ...(r.failed_start ? { failedStart: parse(r.failed_start, []) } : {}),
});

export async function listKeys(env, login) {
  const { results } = await env.DB.prepare('SELECT * FROM keys WHERE login = ? ORDER BY created DESC').bind(login).all();
  return results.map(keyRow);
}

export async function createKey(env, login, name) {
  const list = await listKeys(env, login);
  if (list.length >= MAX_KEYS) return { error: `You have ${MAX_KEYS} keys. Revoke one first.`, list };
  const key = newFleetKey();
  const hash = await sha256(key);
  const entry = {
    id: hash.slice(0, 12),
    name: String(name || '').trim().slice(0, 40) || 'default',
    hash,
    hint: `${key.slice(0, 10)}…${key.slice(-4)}`,
    created: nowIso(),
    lastUsed: null,
  };
  await env.DB.prepare('INSERT INTO keys (hash, id, login, name, hint, created) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(entry.hash, entry.id, login, entry.name, entry.hint, entry.created)
    .run();
  return { key, entry, list: [entry, ...list] };
}

export async function revokeKey(env, login, id) {
  const r = await env.DB.prepare('DELETE FROM keys WHERE login = ? AND id = ?').bind(login, id).run();
  const list = await listKeys(env, login);
  return r.meta.changes ? { list } : { error: 'No such key.', list };
}

// API side: fleet key -> login. "Last used" is written at most once a day a key, to save writes.
export async function loginForKey(env, key) {
  if (!key || !key.startsWith('fleet_') || !env.DB) return null;
  const hash = await sha256(key);
  const row = await env.DB.prepare('SELECT login, last_used FROM keys WHERE hash = ?').bind(hash).first();
  if (!row) return null;
  if (Date.now() - Date.parse(row.last_used || 0) > DAY) {
    try {
      await env.DB.prepare('UPDATE keys SET last_used = ? WHERE hash = ?').bind(nowIso(), hash).run();
    } catch {}
  }
  return row.login;
}

// The pod id may hold a provider token (E2B), so only the part before "~" is kept.
export const podRef = (id) => String(id || '').split('~')[0];

export async function listPods(env, login) {
  const { results } = await env.DB.prepare('SELECT * FROM pods WHERE login = ? ORDER BY started DESC, n DESC LIMIT ?').bind(login, MAX_PODS).all();
  return results.map(podRow);
}

// How many pods this login started today: one indexed range read, no write.
export async function podsStartedToday(env, login) {
  const day = nowIso().slice(0, 10);
  const r = await env.DB.prepare('SELECT COUNT(*) AS c FROM pods WHERE login = ? AND started >= ?').bind(login, day).first();
  return r?.c ?? 0;
}

// One line, at most 240 characters, cut at a word.
const clip = (text) => {
  const one = String(text || '').replace(/\s+/g, ' ').trim();
  return one.length <= 240 ? one : `${one.slice(0, 240).replace(/\s+\S*$/, '')}…`;
};

export async function recordPod(env, login, type, data) {
  const now = nowIso();
  if (type === 'created') {
    await env.DB.prepare('INSERT INTO pods (login, ref, provider, cpu, ram, price, started, moved_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(login, podRef(data.id), data.provider, data.cpu, data.ram, data.pricePerHour ?? null, now, JSON.stringify((data.failed || []).map((f) => f.provider)))
      .run();
  } else if (type === 'failed') {
    const tried = (data.failed || []).map((f) => ({ provider: f.provider, error: clip(f.error) }));
    await env.DB.prepare('INSERT INTO pods (login, cpu, ram, started, failed_start) VALUES (?, ?, ?, ?, ?)').bind(login, data.cpu, data.ram, now, JSON.stringify(tried)).run();
  } else if (type === 'stopped') {
    await env.DB.prepare('UPDATE pods SET stopped = ? WHERE login = ? AND ref = ? AND stopped IS NULL').bind(now, login, podRef(data.id)).run();
  } else if (type === 'gone') {
    await env.DB.prepare('UPDATE pods SET gone = ? WHERE login = ? AND ref = ? AND gone IS NULL AND stopped IS NULL').bind(now, login, podRef(data.id)).run();
  }
}

// A pod fleet never saw stop: under an hour old it is probably running; older, the provider has likely stopped it.
export function podStatus(p, now = new Date()) {
  if (p.failedStart) return 'failed';
  if (p.stopped) return 'stopped';
  if (p.gone) return 'gone';
  return now - Date.parse(p.started) < HOUR ? 'running' : 'likely-stopped';
}

export function summarize(pods, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY).toISOString().slice(0, 10);
    days.push({
      day: d,
      started: pods.filter((p) => !p.failedStart && p.started?.startsWith(d)).length,
      failed: pods.filter((p) => p.failedStart && p.started?.startsWith(d)).length,
    });
  }
  const real = pods.filter((p) => !p.failedStart);
  return {
    running: real.filter((p) => podStatus(p, now) === 'running').length,
    startedToday: real.filter((p) => p.started?.startsWith(today)).length,
    movedToday: real.filter((p) => p.started?.startsWith(today) && p.movedFrom?.length).length,
    failedToday: pods.filter((p) => p.failedStart && p.started?.startsWith(today)).length,
    gone: real.filter((p) => p.gone).length,
    days,
  };
}
