// Fly.io Sprites (sprites.dev). API: https://api.sprites.dev/openapi.json · prices: https://fly.io/pricing
// Persistent microVMs that pause when idle (no compute charge then). Size is fixed by Fly: up to 8 vCPU, memory autoscaled.
// Exec answers a binary framed stream, as in Fly's JS SDK: each chunk starts with a stream id, 1 stdout, 2 stderr, 3 exit.
// Coming soon: written from the OpenAPI spec and SDK on 2026-11-12, never run on a real account.
import { call, UA } from './http.js';

const API = 'https://api.sprites.dev';
const CPU_HOUR = 0.0385; // billed on CPU time used, not reserved
const GB_HOUR = 0.021875;
const auth = (key) => ({ authorization: `Bearer ${key}` });

export function readSpriteFrames(bytes) {
  const dOut = new TextDecoder();
  const dErr = new TextDecoder();
  let stdout = '';
  let stderr = '';
  let exitCode = null;
  for (const chunk of bytes) {
    if (!chunk.length) continue;
    const kind = chunk[0];
    const data = chunk.subarray(1);
    if (kind === 1) stdout += dOut.decode(data, { stream: true });
    else if (kind === 2) stderr += dErr.decode(data, { stream: true });
    else if (kind === 3) exitCode = data[0] ?? 0;
  }
  return { stdout, stderr, exitCode };
}

async function chunksOf(res) {
  const out = [];
  const reader = res.body?.getReader?.();
  if (!reader) return [new Uint8Array(await res.arrayBuffer())];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

export default {
  label: 'Fly Sprites',
  keyHeader: 'X-Sprites-Key',
  help: 'https://github.com/flisk-sh/fleet/issues/4',
  priceSource: 'https://fly.io/pricing',
  note: 'Fixed size set by Fly (up to 8 vCPU, memory autoscaled); billed on use, nothing while idle.',
  price: (size) => (size.cpu > 8 ? null : Math.round((size.cpu * CPU_HOUR + size.ram * GB_HOUR) * 1000) / 1000),
  facts: {
    blurb: 'Persistent Linux microVMs on Fly.io that pause when idle and keep their disk. No charge for idle compute.',
    regions: [],
    billing: 'CPU time and memory used',
    credit: '$1 trial for new Fly accounts; an account whose trial ended must add a card first (seen 2026-11-12)',
    card: null,
    minimum: 0,
    maxCpu: 8,
    maxRam: null, // autoscaled by Fly
    session: null,
    concurrent: null,
    startsPerDay: null,
    badges: ['Free when idle', 'Keeps its disk'],
    source: 'https://fly.io/pricing',
    signup: 'https://sprites.dev',
    keyPage: 'https://sprites.dev/account',
  },

  async create(key, size, { fetchImpl = fetch } = {}) {
    const name = `fleet-${Date.now().toString(36)}${[...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    const made = await call(fetchImpl, `${API}/v1/sprites`, { method: 'POST', headers: auth(key), body: { name } });
    return { id: made?.name || name };
  },

  async run(key, id, command, { fetchImpl = fetch } = {}) {
    const qs = new URLSearchParams();
    for (const a of ['bash', '-lc', command]) qs.append('cmd', a);
    const res = await fetchImpl(`${API}/v1/sprites/${encodeURIComponent(id)}/exec?${qs}`, { method: 'POST', headers: { 'user-agent': UA, ...auth(key) } });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return readSpriteFrames(await chunksOf(res));
  },

  async stop(key, id, { fetchImpl = fetch } = {}) {
    await call(fetchImpl, `${API}/v1/sprites/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth(key) });
  },
};
