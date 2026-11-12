// Morph Cloud (morph.so). API: https://cloud.morph.so/api/openapi.json · prices: https://cloud.morph.so/web/subscribe
// MicroVMs started from snapshots. Fleet makes a sized snapshot of the minimal image, boots an instance from it,
// polls until it is ready, and runs commands with the synchronous exec call.
// 1 MCU = 1 vCPU-hour + 4 GB RAM-hours, $0.05 an MCU.
// Not tested yet: written from the OpenAPI spec on 2026-11-12, never run on a real account.
// Guess: Morph reuses a snapshot with the same image and size; if not, each start leaves one small snapshot behind.
import { call, sleep } from './http.js';

const API = 'https://cloud.morph.so/api';
const MCU = 0.05;
const auth = (key) => ({ authorization: `Bearer ${key}` });
export const morphMcu = (size) => Math.max(size.cpu, size.ram / 4);

export default {
  label: 'Morph',
  keyHeader: 'X-Morph-Key',
  help: 'https://github.com/flisk-sh/fleet/issues/4',
  priceSource: 'https://cloud.morph.so/web/subscribe',
  note: 'MicroVMs from snapshots. 4 GB per vCPU is included in the price.',
  price: (size) => (size.cpu > 64 ? null : Math.round(morphMcu(size) * MCU * 1000) / 1000),
  facts: {
    blurb: 'MicroVMs that start, branch and pause from snapshots, with synchronous exec over HTTP.',
    regions: [],
    billing: 'per MCU (1 vCPU + 4 GB an hour)',
    credit: '300 MCU starting credit on the Developer plan (docs disagree)',
    card: null,
    minimum: 0,
    maxCpu: 64,
    maxRam: 256,
    session: null,
    concurrent: null,
    startsPerDay: null,
    badges: ['Snapshots', 'Sync exec'],
    source: 'https://cloud.morph.so/docs/documentation/setup/plans',
    signup: 'https://cloud.morph.so',
    keyPage: 'https://cloud.morph.so',
  },

  async create(key, size, { fetchImpl = fetch, wait = sleep } = {}) {
    const snap = await call(fetchImpl, `${API}/snapshot`, {
      method: 'POST',
      headers: auth(key),
      body: { image_id: 'morphvm-minimal', vcpus: size.cpu, memory: Math.round(size.ram * 1024), disk_size: 8192 },
    });
    if (!snap?.id) throw new Error('Morph returned no snapshot id');
    let box = await call(fetchImpl, `${API}/instance`, {
      method: 'POST',
      headers: auth(key),
      body: { snapshot_id: snap.id, ttl_seconds: size.ttl ?? 3600, ttl_action: 'stop' },
    });
    if (!box?.id) throw new Error('Morph returned no instance id');
    const id = box.id;
    for (let i = 0; box.status !== 'ready' && i < 30; i++) {
      if (box.status === 'error') throw new Error('instance error');
      await wait(2000);
      box = await call(fetchImpl, `${API}/instance/${encodeURIComponent(id)}`, { headers: auth(key) });
    }
    if (box.status !== 'ready') throw new Error(`instance still ${box.status} after 60 s`);
    return { id };
  },

  async run(key, id, command, { fetchImpl = fetch } = {}) {
    const r = await call(fetchImpl, `${API}/instance/${encodeURIComponent(id)}/exec`, { method: 'POST', headers: auth(key), body: { command: ['sh', '-c', command] } });
    return { stdout: r?.stdout ?? '', stderr: r?.stderr ?? '', exitCode: r?.exit_code ?? null };
  },

  async stop(key, id, { fetchImpl = fetch } = {}) {
    await call(fetchImpl, `${API}/instance/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth(key) });
  },
};
