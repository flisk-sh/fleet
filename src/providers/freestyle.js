// Freestyle VMs (freestyle.sh). The docs show the SDK only; the REST paths below were read from the `freestyle` npm package
// 0.2.23 source (base https://api.freestyle.sh, /v5/vms, /exec-await). Prices: https://www.freestyle.sh/docs/vms/pricing-and-limits
// Not tested yet: written on 2026-11-12, never run on a real account.
// Guesses: a VM has no size field on create, so fleet boots the default and then calls POST /resize (grow-only) and ignores
// a refusal; exec-await is called without the SDK's background header, so a command over about 5 minutes may be cut off.
import { call, sleep } from './http.js';

const API = 'https://api.freestyle.sh';
const CPU_HOUR = 0.04032;
const GIB_HOUR = 0.0129;
const auth = (key) => ({ authorization: `Bearer ${key}` });
const vm = (id) => `${API}/v5/vms/${encodeURIComponent(id)}`;

export default {
  label: 'Freestyle',
  keyHeader: 'X-Freestyle-Key',
  help: 'https://github.com/flisk-sh/fleet/issues/4',
  priceSource: 'https://www.freestyle.sh/docs/vms/pricing-and-limits',
  note: 'Full Linux VMs that start in milliseconds and can run for weeks. Free plan: 10 VMs at once, 200 vCPU-hours a month.',
  price: (size) => (size.cpu > 32 ? null : Math.round((size.cpu * CPU_HOUR + size.ram * GIB_HOUR) * 1000) / 1000),
  facts: {
    blurb: 'Persistent Linux VMs with full KVM, memory-keeping pause and instant snapshots.',
    regions: ['US'],
    billing: 'per second, allocated vCPU and memory',
    credit: 'Free plan: 200 vCPU-hours and 400 GiB-hours a month',
    card: false,
    minimum: 0,
    maxCpu: 32,
    maxRam: 64,
    session: null,
    concurrent: 10, // free plan
    startsPerDay: null,
    badges: ['Free plan', 'No time limit', 'Memory snapshots'],
    source: 'https://www.freestyle.sh/docs/vms/pricing-and-limits',
    signup: 'https://dash.freestyle.sh',
    keyPage: 'https://dash.freestyle.sh',
  },

  async create(key, size, { fetchImpl = fetch, wait = sleep } = {}) {
    let box = await call(fetchImpl, `${API}/v5/vms`, {
      method: 'POST',
      headers: auth(key),
      body: {
        // A VM reaches nothing it has not been allowed to: let it out to the public Internet.
        firewall: { rules: [{ action: 'allow', source: {}, destination: { public: true } }] },
        ttlSeconds: size.ttl ?? 3600,
        metadata: { source: 'fleet' },
      },
    });
    const id = box?.id;
    if (!id) throw new Error('Freestyle returned no vm id');
    for (let i = 0; box.state && box.state !== 'running' && i < 30; i++) {
      if (/stopped|paused/.test(box.state)) throw new Error(`vm ${box.state}`);
      await wait(2000);
      box = await call(fetchImpl, vm(id), { headers: auth(key) });
    }
    if (box.state && box.state !== 'running') throw new Error(`vm still ${box.state} after 60 s`);
    try {
      await call(fetchImpl, `${vm(id)}/resize`, { method: 'POST', headers: auth(key), body: { cpu: size.cpu, memory: Math.round(size.ram * 1024) } });
    } catch (e) {
      if (!(e.status >= 400 && e.status < 500)) throw e; // grow-only: a smaller ask than the default is refused, keep the default
    }
    return { id };
  },

  async run(key, id, command, { fetchImpl = fetch } = {}) {
    const r = await call(fetchImpl, `${vm(id)}/exec-await`, { method: 'POST', headers: auth(key), body: { command, timeoutMs: 300000 } });
    return { stdout: r?.stdout ?? '', stderr: r?.stderr ?? '', exitCode: r?.statusCode ?? 124 };
  },

  async stop(key, id, { fetchImpl = fetch } = {}) {
    await call(fetchImpl, vm(id), { method: 'DELETE', headers: auth(key) });
  },
};
