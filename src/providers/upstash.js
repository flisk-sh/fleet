// Upstash Box. Docs: https://upstash.com/docs/box · prices: https://upstash.com/docs/box/overall/pricing
// Sizes small (2 vCPU / 4 GB), medium (4 / 8) and large (8 / 16), billed per active CPU hour.
// Working: run on a real account on 2026-11-12. The REST paths were read from the @upstash/box 0.8.0 SDK source (they are
// not in Upstash's public API docs) and matched the live service.
import { call, sleep } from './http.js';

const API = 'https://us-east-1.box.upstash.com';
const SIZES = [
  { name: 'small', cpu: 2, ram: 4, hour: 0.1 },
  { name: 'medium', cpu: 4, ram: 8, hour: 0.2 },
  { name: 'large', cpu: 8, ram: 16, hour: 0.4 },
];
export const upstashSize = (size) => SIZES.find((s) => s.cpu >= size.cpu && s.ram >= size.ram) || null;
const auth = (key) => ({ 'x-box-api-key': key });

export default {
  label: 'Upstash Box',
  keyHeader: 'X-Upstash-Key',
  working: '2026-11-12', // real account run: start, run with env/cwd/timeout, files, timeout (exit 124), stop, stop again
  priceSource: 'https://upstash.com/docs/box/overall/pricing',
  note: 'Sizes 2/4, 4/8 or 8/16 (vCPU/GB), billed only while the CPU works. US East only.',
  price: (size) => upstashSize(size)?.hour ?? null,
  facts: {
    blurb: 'Serverless agent boxes with Node, Python, Go, Ruby or Rust, billed per active CPU hour.',
    regions: ['US'],
    billing: 'per active CPU hour',
    credit: 'Free plan: 5 CPU hours a month, 10 boxes at once',
    card: null,
    minimum: 0,
    maxCpu: 8,
    maxRam: 16,
    session: 259200,
    concurrent: 10, // free plan
    startsPerDay: null,
    badges: ['Free monthly hours', 'Pay for active CPU'],
    source: 'https://upstash.com/docs/box/overall/pricing',
    signup: 'https://console.upstash.com',
    keyPage: 'https://console.upstash.com',
  },

  async create(key, size, { fetchImpl = fetch, wait = sleep } = {}) {
    const s = upstashSize(size);
    if (!s) throw new Error('size not offered: Upstash boxes are at most 8 vCPU and 16 GB');
    let box = await call(fetchImpl, `${API}/v2/box`, {
      method: 'POST',
      headers: auth(key),
      // A public pod is a normal (not ephemeral) box: only those can have public URLs. It has no ttl; it pauses itself after an
      // idle hour (no compute is billed while paused), a visit to its URL wakes it, and whoever asked for it deletes it.
      body: size.public ? { size: s.name, runtime: 'python' } : { size: s.name, runtime: 'python', ephemeral: true, ttl: Math.min(259200, size.ttl ?? 3600) },
    });
    if (!box?.id) throw new Error('Upstash returned no box id');
    const id = box.id;
    for (let i = 0; box.status === 'creating' && i < 30; i++) {
      await wait(2000);
      box = await call(fetchImpl, `${API}/v2/box/${encodeURIComponent(id)}`, { headers: auth(key) });
    }
    if (box.status === 'error' || box.status === 'deleted') throw new Error(`box ${box.status}`);
    if (box.status === 'creating') throw new Error('box still creating after 60 s');
    return { id };
  },

  async run(key, id, command, { fetchImpl = fetch } = {}) {
    const r = await call(fetchImpl, `${API}/v2/box/${encodeURIComponent(id)}/exec`, { method: 'POST', headers: auth(key), body: { command: ['sh', '-c', command] } });
    return { stdout: r?.output ?? '', stderr: r?.error ?? '', exitCode: r?.exit_code ?? null };
  },

  // POST /v2/box/:id/preview answers { url: https://<box>-<port>.preview.box.upstash.com }; PUT /v2/box/:id/startup sets the
  // init command the box runs on every start (read from the @upstash/box 0.8.0 SDK, getPublicURL and setInitCommand).
  async publicUrl(key, id, port, { fetchImpl = fetch, startup = '' } = {}) {
    if (startup) await call(fetchImpl, `${API}/v2/box/${encodeURIComponent(id)}/startup`, { method: 'PUT', headers: auth(key), body: { init_command: startup } });
    const r = await call(fetchImpl, `${API}/v2/box/${encodeURIComponent(id)}/preview`, { method: 'POST', headers: auth(key), body: { port } });
    if (!r?.url) throw new Error('Upstash returned no public URL (only boxes started with public: true can have one)');
    return { url: r.url, wakesOnVisit: true };
  },

  async stop(key, id, { fetchImpl = fetch } = {}) {
    await call(fetchImpl, `${API}/v2/box/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth(key) });
  },
};
