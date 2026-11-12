// boat (boat.dev). API: https://docs.boat.dev/api/v1 · prices: https://docs.boat.dev/pricing
// Sizes are fixed machine types, so fleet picks the smallest type that fits the asked size.
import { call, sleep } from './http.js';

const BASE = 'https://boat.dev/api/v1';
const TYPES = [
  { type: 'small', cpu: 2, ram: 4, price: 0.018 },
  { type: 'default', cpu: 4, ram: 8, price: 0.036 },
  { type: 'large', cpu: 8, ram: 16, price: 0.072 },
  { type: 'xlarge', cpu: 16, ram: 32, price: 0.2 },
];
const fit = (size) => TYPES.find((t) => t.cpu >= size.cpu && t.ram >= size.ram) || null;
const auth = (key) => ({ authorization: `Bearer ${key}` });

export default {
  label: 'boat',
  keyHeader: 'X-Boat-Key',
  priceSource: 'https://docs.boat.dev/pricing',
  note: 'Needs a boat plan ($20 a month after a 7-day trial). Machines in Europe only.',
  price: (size) => fit(size)?.price ?? null,
  facts: {
    blurb: 'Full Linux VMs with Docker inside, SSH and a desktop. Disk kept between stops.',
    regions: ['EU'],
    billing: 'per second',
    credit: '7-day trial with a card',
    card: true,
    minimum: 20, // dollars a month: the $20 plan includes $20 of VM time
    maxCpu: 16,
    maxRam: 32,
    session: null,
    concurrent: 100,
    startsPerDay: 200,
    badges: ['Cheapest per hour', 'EU only', '$20 plan'],
    source: 'https://docs.boat.dev/pricing',
  },

  async create(key, size, { fetchImpl = fetch } = {}) {
    const t = fit(size);
    if (!t) throw new Error('size not offered');
    // snapshots:false — a stop erases the disk, so a stopped pod leaves nothing billed behind.
    const made = await call(fetchImpl, `${BASE}/sandboxes`, { method: 'POST', headers: auth(key), body: { type: t.type, snapshots: false, ttlSeconds: size.ttl ?? 3600 } });
    const id = made?.sandbox?.id;
    if (!id) throw new Error('boat returned no sandbox id');
    return { id };
  },

  // boat holds a command for up to 60 s while the machine starts, then answers 409: retry a few times.
  async run(key, id, command, { fetchImpl = fetch, wait = sleep } = {}) {
    let last;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await call(fetchImpl, `${BASE}/sandboxes/${encodeURIComponent(id)}/commands`, {
          method: 'POST',
          headers: auth(key),
          body: { command, timeoutSeconds: 600 },
        });
        return { stdout: r?.stdout ?? '', stderr: r?.stderr ?? '', exitCode: r?.exitCode ?? null };
      } catch (e) {
        last = e;
        const starting = e.status === 409 && /starting/.test(`${e.data?.code || ''} ${e.data?.error?.code || ''}`);
        const restoring = e.status === 502 && e.data?.error?.details?.retryable === true;
        if (!starting && !restoring) throw e;
        await wait(2000);
      }
    }
    throw last;
  },

  async stop(key, id, { fetchImpl = fetch } = {}) {
    await call(fetchImpl, `${BASE}/sandboxes/${encodeURIComponent(id)}/stop`, { method: 'POST', headers: auth(key), body: {} });
  },
};
