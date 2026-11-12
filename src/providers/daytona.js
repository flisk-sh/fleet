// Daytona (daytona.io). Documented API: https://app.daytona.io/api · toolbox: https://proxy.app.daytona.io/toolbox/{id}
// Prices: https://www.daytona.io/pricing. One sandbox is at most 4 vCPU / 8 GB.
import { call, sleep } from './http.js';

const API = 'https://app.daytona.io/api';
const TOOLBOX = 'https://proxy.app.daytona.io/toolbox';
const CPU_HOUR = 0.0504;
const GIB_HOUR = 0.0162;
const auth = (key) => ({ authorization: `Bearer ${key}` });
const BAD = new Set(['error', 'build_failed', 'destroyed', 'destroying']);

export default {
  label: 'Daytona',
  keyHeader: 'X-Daytona-Key',
  priceSource: 'https://www.daytona.io/pricing',
  note: 'Up to 4 vCPU and 8 GB a pod. Output comes back as one stream.',
  price: (size) => (size.cpu > 4 || size.ram > 8 ? null : Math.round((size.cpu * CPU_HOUR + size.ram * GIB_HOUR) * 1000) / 1000),
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
    // autoStopInterval 60 min, autoDeleteInterval 0: a forgotten pod stops after an hour and is deleted on stop.
    let box = await call(fetchImpl, `${API}/sandbox`, {
      method: 'POST',
      headers: auth(key),
      body: { cpu: size.cpu, memory: Math.ceil(size.ram), autoStopInterval: Math.max(1, Math.ceil((size.ttl ?? 3600) / 60)), autoDeleteInterval: 0 },
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
