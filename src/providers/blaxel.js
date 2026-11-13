// Blaxel (blaxel.ai) sandboxes. API: https://docs.blaxel.ai/api-reference/introduction · prices: https://blaxel.ai/pricing
// Control plane on api.blaxel.ai/v0; commands go to the sandbox's own host (metadata.url).
// Blaxel bills memory only: a sandbox gets 1 vCPU for every 2 GB, so fleet asks for enough memory for the cores.
// Working: run on a real account on 2026-11-12. The plain API key is accepted on the sandbox host, and a waited
// command answers within 60 s (Blaxel's limit for waitForCompletion). Blaxel's image has busybox timeout: see wrapCommand.
// A key may be sent as "<workspace>:<key>" for accounts with several workspaces.
import { call } from './http.js';

const API = 'https://api.blaxel.ai/v0';
const GB_HOUR = 0.0000115 * 3600;
const VERSION = '2026-04-16';
const IMAGE = 'blaxel/base-image:latest';

const parseKey = (key) => {
  const m = /^([a-z0-9-]+):(.+)$/.exec(String(key));
  return m ? { workspace: m[1], token: m[2] } : { workspace: '', token: String(key) };
};
const headers = (key) => {
  const { workspace, token } = parseKey(key);
  return { authorization: `Bearer ${token}`, 'blaxel-version': VERSION, ...(workspace ? { 'x-blaxel-workspace': workspace } : {}) };
};
// Memory in GB that gives at least size.cpu cores and at least size.ram GB.
export const blaxelGb = (size) => Math.max(size.ram, size.cpu * 2);

const pack = (name, url) => [name, url || ''].join('~');
// When runtime.ttl deletes the sandbox. Fleet's names start with the creation time (fleet-<base36 ms>-<hex>).
export function blaxelEnd(name, box) {
  const at = box?.spec?.runtime?.expires;
  if (at && !Number.isNaN(Date.parse(at))) return new Date(at).toISOString();
  const ttl = /^(\d+)m$/.exec(String(box?.spec?.runtime?.ttl ?? ''));
  const made = Date.parse(box?.metadata?.createdAt || '') || parseInt(/^fleet-([0-9a-z]+)-/.exec(name)?.[1] || '', 36);
  return ttl && made ? new Date(made + Number(ttl[1]) * 60_000).toISOString() : null;
}
const unpack = (s) => {
  const [name, url] = String(s).split('~');
  return { name, url };
};

export default {
  label: 'Blaxel',
  keyHeader: 'X-Blaxel-Key',
  working: '2026-11-12', // real account run: start, run with env/cwd/timeout, files, timeout (exit 124), stop, stop again
  priceSource: 'https://blaxel.ai/pricing',
  note: 'Billed on memory only (1 vCPU per 2 GB); standby is free. Commands answer within 60 s.',
  price: (size) => {
    const gb = blaxelGb(size);
    return gb > 64 ? null : Math.round(gb * GB_HOUR * 1000) / 1000;
  },
  facts: {
    blurb: 'MicroVM sandboxes that sleep when idle and wake in under 25 ms, with no charge while asleep.',
    regions: ['US', 'EU'],
    billing: 'per second, memory only',
    credit: 'Up to $200 free credit, no card',
    card: false,
    minimum: 0,
    maxCpu: null, // not published: set per tier in the console
    maxRam: null,
    session: null,
    concurrent: null,
    startsPerDay: null,
    badges: ['$200 credit', 'No card', 'Free standby'],
    source: 'https://blaxel.ai/pricing',
    signup: 'https://app.blaxel.ai',
    keyPage: 'https://app.blaxel.ai/profile/security',
    // Blaxel gives two values for one key: BL_WORKSPACE and BL_API_KEY. Joined as "workspace:key".
    fields: [
      { id: 'workspace', label: 'Workspace', placeholder: 'BL_WORKSPACE, e.g. my-workspace-123456' },
      { id: 'key', label: 'API key', placeholder: 'BL_API_KEY, starts with bl_', secret: true },
    ],
  },

  async create(key, size, { fetchImpl = fetch } = {}) {
    const name = `fleet-${Date.now().toString(36)}-${[...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    const mins = Math.max(5, Math.ceil((size.ttl ?? 3600) / 60));
    // Creation waits until the sandbox is ready (or fails), so no polling.
    const box = await call(fetchImpl, `${API}/sandboxes`, {
      method: 'POST',
      headers: headers(key),
      body: { metadata: { name }, spec: { runtime: { image: IMAGE, memory: blaxelGb(size) * 1024, ttl: `${mins}m` }, region: 'auto' } },
    });
    if (/fail/i.test(box?.status || '')) throw new Error(`sandbox ${box.status}`);
    const url = box?.metadata?.url;
    if (!url) throw new Error('Blaxel returned no sandbox url');
    return { id: pack(box.metadata.name || name, url) };
  },

  async run(key, id, command, { fetchImpl = fetch } = {}) {
    const { url } = unpack(id);
    const r = await call(fetchImpl, `${url.replace(/\/$/, '')}/process`, {
      method: 'POST',
      headers: headers(key),
      body: { command, waitForCompletion: true, timeout: 60 },
    });
    return { stdout: r?.stdout ?? '', stderr: r?.stderr ?? '', exitCode: r?.exitCode ?? null };
  },

  // POST /sandboxes/:name/previews { metadata: { name }, spec: { port, public: true } } answers spec.url; previews are private
  // unless public is true (@blaxel/core sandbox/preview.js). An idle sandbox goes to standby with its memory and a request to
  // the preview URL wakes it (support.blaxel.ai), so the running app needs no startup command. But runtime.ttl deletes the
  // sandbox at a fixed time after it was made, whatever it is doing, so the link ends then: spec.runtime.expires, else the
  // creation time (in fleet's name for it, or metadata.createdAt) plus the ttl.
  async publicUrl(key, id, port, { fetchImpl = fetch } = {}) {
    const { name } = unpack(id);
    const base = `${API}/sandboxes/${encodeURIComponent(name)}`;
    const pname = `preview-${port}`;
    let p;
    try {
      p = await call(fetchImpl, `${base}/previews`, { method: 'POST', headers: headers(key), body: { metadata: { name: pname }, spec: { port, public: true } } });
    } catch (e) {
      if (e.status !== 409) throw e;
      p = await call(fetchImpl, `${base}/previews/${pname}`, { headers: headers(key) });
    }
    const url = p?.spec?.url;
    if (!url) throw new Error('Blaxel returned no preview URL');
    if (p?.spec?.public === false) throw new Error(`the preview of port ${port} is private`);
    const box = await call(fetchImpl, base, { headers: headers(key) }).catch(() => null);
    return { url, wakesOnVisit: true, expiresAt: blaxelEnd(name, box) };
  },

  async stop(key, id, { fetchImpl = fetch } = {}) {
    await call(fetchImpl, `${API}/sandboxes/${encodeURIComponent(unpack(id).name)}`, { method: 'DELETE', headers: headers(key) });
  },
};
