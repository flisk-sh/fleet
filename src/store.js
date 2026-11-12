// What fleet remembers, in D1 (see schema.sql). Never a provider key, never a provider's access token.
// Free plan: 100,000 rows written and 5 million rows read a day, so every write here is one row and every read uses an index.
import { sha256, newFleetKey } from './auth.js';
import { PODS_PER_DAY } from './limit.js';
import { open, seal } from './vault.js';

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

// ---- usage log
export async function logCall(env, login, c) {
  await env.DB.prepare('INSERT INTO calls (login, at, kind, provider, ref, status, ms, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(login, nowIso(), c.kind, c.provider ?? null, c.id ? podRef(c.id) : null, c.status, Math.round(c.ms), c.error ? clip(c.error) : null)
    .run();
}

export async function listCalls(env, login, { errorsOnly = false, limit = 200 } = {}) {
  const sql = `SELECT * FROM calls WHERE login = ?${errorsOnly ? ' AND status >= 400' : ''} ORDER BY n DESC LIMIT ?`;
  const { results } = await env.DB.prepare(sql).bind(login, limit).all();
  return results;
}

// ---- each account's own limits
export const LIMIT_DEFAULTS = { podsPerDay: PODS_PER_DAY, maxCpu: 16, maxRam: 64, lifetimeMin: 60 };
export const LIMIT_RANGES = { podsPerDay: [1, PODS_PER_DAY], maxCpu: [1, 16], maxRam: [1, 64], lifetimeMin: [5, 1440] };

export async function getLimits(env, login) {
  const r = await env.DB.prepare('SELECT * FROM limits WHERE login = ?').bind(login).first();
  if (!r) return { ...LIMIT_DEFAULTS };
  return { podsPerDay: r.pods_per_day, maxCpu: r.max_cpu, maxRam: r.max_ram, lifetimeMin: r.lifetime_min };
}

// Values outside the allowed range are an error, not silently clamped.
export function checkLimits(input) {
  const out = {};
  for (const [k, [lo, hi]] of Object.entries(LIMIT_RANGES)) {
    const v = Number(input[k]);
    if (!Number.isFinite(v) || v < lo || v > hi || (k !== 'maxRam' && !Number.isInteger(v))) return { error: `${k} must be ${k === 'maxRam' ? 'a number' : 'a whole number'} from ${lo} to ${hi}` };
    out[k] = v;
  }
  return { limits: out };
}

export async function setLimits(env, login, l) {
  await env.DB.prepare(
    'INSERT INTO limits (login, pods_per_day, max_cpu, max_ram, lifetime_min, updated) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(login) DO UPDATE SET pods_per_day = excluded.pods_per_day, max_cpu = excluded.max_cpu, max_ram = excluded.max_ram, lifetime_min = excluded.lifetime_min, updated = excluded.updated',
  )
    .bind(login, l.podsPerDay, l.maxCpu, l.maxRam, l.lifetimeMin, nowIso())
    .run();
}

// ---- provider keys connected once in the cabinet (encrypted; see vault.js)

export async function connectProvider(env, login, provider, key) {
  const clean = String(key || '').trim();
  if (clean.length < 8 || clean.length > 400 || /\s/.test(clean)) return { error: 'That does not look like an API key. Paste the whole key, with no spaces.' };
  const sealed = await seal(env.PROVIDER_KEYS_SECRET, clean);
  await env.DB.prepare(
    'INSERT INTO provider_keys (login, provider, sealed, hint, created) VALUES (?, ?, ?, ?, ?) ON CONFLICT(login, provider) DO UPDATE SET sealed = excluded.sealed, hint = excluded.hint, created = excluded.created',
  )
    .bind(login, provider, sealed, clean.slice(-4), nowIso())
    .run();
  return { ok: true };
}

export async function disconnectProvider(env, login, provider) {
  await env.DB.prepare('DELETE FROM provider_keys WHERE login = ? AND provider = ?').bind(login, provider).run();
}

// For pages: which providers are connected, never the key itself.
export async function listConnections(env, login) {
  const { results } = await env.DB.prepare('SELECT provider, hint, created FROM provider_keys WHERE login = ?').bind(login).all();
  return Object.fromEntries(results.map((r) => [r.provider, { hint: r.hint, created: r.created }]));
}

// For pod calls: the decrypted keys, used for this call only. A key that no longer decrypts (secret changed) is skipped.
export async function connectedKeys(env, login) {
  const { results } = await env.DB.prepare('SELECT provider, sealed FROM provider_keys WHERE login = ?').bind(login).all();
  const out = {};
  for (const r of results) {
    try {
      out[r.provider] = await open(env.PROVIDER_KEYS_SECRET, r.sealed);
    } catch {}
  }
  return out;
}
