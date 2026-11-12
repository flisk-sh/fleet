// Daytona (daytona.io). Documented API: https://app.daytona.io/api · toolbox: https://proxy.app.daytona.io/toolbox/{id}
// Prices: https://www.daytona.io/pricing. One sandbox is at most 4 vCPU / 8 GB.
import { call, sleep } from './http.js';

const API = 'https://app.daytona.io/api';
const TOOLBOX = 'https://proxy.app.daytona.io/toolbox';
const CPU_HOUR = 0.0504;
const GIB_HOUR = 0.0162;
const auth = (key) => ({ authorization: `Bearer ${key}` });
const BAD = new Set(['error', 'build_failed', 'destroyed', 'destroying']);
// Daytona's default snapshots come with a fixed size, and its API refuses cpu/memory next to a snapshot
// ("Cannot specify Sandbox resources when using a snapshot", seen live on 2026-11-12). So fleet picks the smallest
// snapshot that fits the asked size, and prices the pod at that snapshot's size.
// Sizes from https://www.daytona.io/docs/en/sandboxes (default snapshots).
const SNAPSHOTS = [
  { name: 'daytona-small', cpu: 1, ram: 1 },
  { name: 'daytona-medium', cpu: 2, ram: 4 },
  { name: 'daytona-large', cpu: 4, ram: 8 },
];
export const snapshotFor = (size) => SNAPSHOTS.find((s) => s.cpu >= size.cpu && s.ram >= size.ram) || null;

export default {
  label: 'Daytona',
  keyHeader: 'X-Daytona-Key',
  priceSource: 'https://www.daytona.io/pricing',
  note: 'Sizes 1/1, 2/4 or 4/8 (vCPU/GB): fleet picks the smallest that fits. Output comes back as one stream.',
  price: (size) => {
    const s = snapshotFor(size);
    return s ? Math.round((s.cpu * CPU_HOUR + s.ram * GIB_HOUR) * 1000) / 1000 : null;
  },
  facts: {
    blurb: 'Sandboxes that start in milliseconds, with GPUs and Windows on request.',
    regions: ['EU', 'US'],
    billing: 'per second',
    credit: '$200 free credit, no card',
    card: false,
    minimum: 0,
    maxCpu: 4,
    maxRam: 8,
    session: null,
    concurrent: null,
    poolCpu: 10, // a new organisation's first tier: 10 vCPU across all sandboxes
    startsPerDay: null,
    badges: ['$200 credit', 'No card', 'EU and US'],
    source: 'https://www.daytona.io/pricing',
  },

  async create(key, size, { fetchImpl = fetch, wait = sleep } = {}) {
    // autoStopInterval = the pod's lifetime in minutes, autoDeleteInterval 0: a forgotten pod stops by itself and is deleted on stop.
    const snap = snapshotFor(size);
    if (!snap) throw new Error('size not offered: Daytona pods are at most 4 vCPU and 8 GB');
    let box = await call(fetchImpl, `${API}/sandbox`, {
      method: 'POST',
      headers: auth(key),
      body: { snapshot: snap.name, autoStopInterval: Math.max(1, Math.ceil((size.ttl ?? 3600) / 60)), autoDeleteInterval: 0 },
    });
    if (!box?.id) throw new Error('Daytona returned no sandbox id');
    for (let i = 0; box.state !== 'started' && i < 30; i++) {
      if (BAD.has(box.state)) throw new Error(`sandbox ${box.state}${box.errorReason ? `: ${box.errorReason}` : ''}`);
      await wait(2000);
      box = await call(fetchImpl, `${API}/sandbox/${encodeURIComponent(box.id)}`, { headers: auth(key) });
    }
    if (box.state !== 'started') throw new Error(`sandbox still ${box.state} after 60 s`);
    return { id: box.id };
  },

  async run(key, id, command, { fetchImpl = fetch } = {}) {
    const r = await call(fetchImpl, `${TOOLBOX}/${encodeURIComponent(id)}/process/execute`, {
      method: 'POST',
      headers: auth(key),
      body: { command, timeout: 600 },
    });
    return { stdout: r?.result ?? '', stderr: '', exitCode: r?.exitCode ?? null };
  },

  async stop(key, id, { fetchImpl = fetch } = {}) {
    await call(fetchImpl, `${API}/sandbox/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth(key) });
  },
};
