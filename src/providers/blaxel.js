// Blaxel (blaxel.ai) sandboxes. API: https://docs.blaxel.ai/api-reference/introduction · prices: https://blaxel.ai/pricing
// Control plane on api.blaxel.ai/v0; commands go to the sandbox's own host (metadata.url).
// Blaxel bills memory only: a sandbox gets 1 vCPU for every 2 GB, so fleet asks for enough memory for the cores.
// Coming soon: written from the docs on 2026-11-12, never run on a real account.
// Guesses: the plain API key is accepted on the sandbox host (the docs say "Bearer (JWT)"), and a waited command
// answers within 60 s (Blaxel's limit for waitForCompletion).
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
const unpack = (s) => {
  const [name, url] = String(s).split('~');
  return { name, url };
};

export default {
  label: 'Blaxel',
  keyHeader: 'X-Blaxel-Key',
  help: 'https://github.com/flisk-sh/fleet/issues/4',
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

  async stop(key, id, { fetchImpl = fetch } = {}) {
    await call(fetchImpl, `${API}/sandboxes/${encodeURIComponent(unpack(id).name)}`, { method: 'DELETE', headers: headers(key) });
  },
};
