// What fleet remembers. Never a provider key, never a provider's access token.
//   key:<sha256 of fleet key>  -> login             (the API looks keys up here)
//   keys:<login>               -> [{ id, name, hash, hint, created, lastUsed }]   up to 10
//   pods:<login>               -> [{ ref, provider, cpu, ram, price, started, stopped, gone, movedFrom }]   newest first, up to 100
// Sessions are signed cookies, not stored, so sign-in needs no KV write and no read-after-write.
import { sha256, newFleetKey } from './auth.js';

export const MAX_KEYS = 10;
const MAX_PODS = 100;
const LAST_USED_EVERY_MS = 3600_000; // KV on the free plan allows 1,000 writes a day: note "last used" at most once an hour a key

const read = async (env, k, fallback) => {
  try {
    const v = await env.KV.get(k);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const write = (env, k, v) => env.KV.put(k, JSON.stringify(v));

// Keys made before the cabinet: one hash at user:<login>. Turn it into the list once.
export async function listKeys(env, login) {
  const list = await read(env, `keys:${login}`, null);
  if (list) return list;
  const old = await env.KV.get(`user:${login}`).catch(() => null);
  if (!old) return [];
  const migrated = [{ id: old.slice(0, 12), name: 'default', hash: old, hint: '', created: null, lastUsed: null }];
  await write(env, `keys:${login}`, migrated);
  return migrated;
}

export async function createKey(env, login, name) {
  const list = await listKeys(env, login);
  if (list.length >= MAX_KEYS) return { error: `You have ${MAX_KEYS} keys. Revoke one first.`, list };
  const key = newFleetKey();
  const hash = await sha256(key);
  const clean = String(name || '').trim().slice(0, 40) || 'default';
  const entry = { id: hash.slice(0, 12), name: clean, hash, hint: `${key.slice(0, 10)}…${key.slice(-4)}`, created: new Date().toISOString(), lastUsed: null };
  const next = [entry, ...list];
  await env.KV.put(`key:${hash}`, login);
  await write(env, `keys:${login}`, next);
  return { key, entry, list: next };
}

export async function revokeKey(env, login, id) {
  const list = await listKeys(env, login);
  const hit = list.find((k) => k.id === id);
  if (!hit) return { error: 'No such key.', list };
  const next = list.filter((k) => k.id !== id);
  await env.KV.delete(`key:${hit.hash}`);
  await write(env, `keys:${login}`, next);
  if (!next.length) await env.KV.delete(`user:${login}`).catch(() => {});
  return { list: next };
}

// API side: fleet key -> login, and note when it was last used.
export async function loginForKey(env, key) {
  if (!key || !key.startsWith('fleet_') || !env.KV) return null;
  const hash = await sha256(key);
  const login = await env.KV.get(`key:${hash}`);
  if (!login) return null;
  try {
    const list = await read(env, `keys:${login}`, null);
    const me = list?.find((k) => k.hash === hash);
    if (me && Date.now() - Date.parse(me.lastUsed || 0) > LAST_USED_EVERY_MS) {
      me.lastUsed = new Date().toISOString();
      await write(env, `keys:${login}`, list);
    }
  } catch {}
  return login;
}

// The pod id may hold a provider token (E2B), so only the part before "~" is kept.
export const podRef = (id) => String(id || '').split('~')[0];

export async function listPods(env, login) {
  return read(env, `pods:${login}`, []);
}

export async function recordPod(env, login, type, data) {
  const list = await listPods(env, login);
  const now = new Date().toISOString();
  if (type === 'created') {
    list.unshift({
      ref: podRef(data.id),
      provider: data.provider,
      cpu: data.cpu,
      ram: data.ram,
      price: data.pricePerHour,
      started: now,
      stopped: null,
      gone: null,
      movedFrom: (data.failed || []).map((f) => f.provider),
    });
  } else if (type === 'failed') {
    // A start that failed on every provider: kept so the cabinet can say why. Provider error text only, never a key.
    list.unshift({
      ref: null,
      provider: null,
      cpu: data.cpu,
      ram: data.ram,
      price: null,
      started: now,
      stopped: null,
      gone: null,
      movedFrom: [],
      failedStart: (data.failed || []).map((f) => ({ provider: f.provider, error: String(f.error || '').slice(0, 160) })),
    });
  } else {
    const pod = list.find((p) => p.ref && p.ref === podRef(data.id));
    if (!pod) return;
    if (type === 'stopped' && !pod.stopped) pod.stopped = now;
    if (type === 'gone' && !pod.gone && !pod.stopped) pod.gone = now;
  }
  await write(env, `pods:${login}`, list.slice(0, MAX_PODS));
}

// Overview numbers, all from the pod list.
const HOUR = 3600_000;
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
    const d = new Date(now.getTime() - i * 86400_000).toISOString().slice(0, 10);
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
