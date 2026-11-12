// Isorun (isorun.ai). API: https://docs.isorun.ai/api-reference · prices: https://docs.isorun.ai/getting-started/pricing
// The region is part of the key (isorun_live_us_...), and the API host is per region.
import { call } from './http.js';

const CPU_HOUR = 0.025;
const GIB_HOUR = 0.015;
const auth = (key) => ({ authorization: `Bearer ${key}` });

export function baseFor(key) {
  const region = String(key).split('_')[2];
  if (!/^[a-z]{2,4}$/.test(region || '')) throw new Error('Isorun key has no region (expected isorun_live_<region>_...)');
  return `https://run-${region}.isorun.ai`;
}

export default {
  label: 'Isorun',
  keyHeader: 'X-Isorun-Key',
  priceSource: 'https://docs.isorun.ai/getting-started/pricing',
  note: 'Pay per second, no minimum.',
  price: (size) => Math.round((size.cpu * CPU_HOUR + size.ram * GIB_HOUR) * 1000) / 1000,

  async create(key, size, { fetchImpl = fetch } = {}) {
    const made = await call(fetchImpl, `${baseFor(key)}/v1/runs`, {
      method: 'POST',
      headers: auth(key),
      // timeout: Isorun destroys the run by itself after an hour, so a forgotten pod stops billing.
      body: { image: 'ubuntu:24.04', vcpus: size.cpu, mem_mib: Math.round(size.ram * 1024), timeout: 3600 },
    });
    if (!made?.id) throw new Error('Isorun returned no run id');
    return { id: made.id };
  },

  async run(key, id, command, { fetchImpl = fetch } = {}) {
    const r = await call(fetchImpl, `${baseFor(key)}/v1/runs/${encodeURIComponent(id)}/exec`, {
      method: 'POST',
      headers: auth(key),
      body: { command, timeout: 600 },
    });
    return { stdout: r?.stdout ?? '', stderr: r?.stderr ?? '', exitCode: r?.exit_code ?? null };
  },

  async stop(key, id, { fetchImpl = fetch } = {}) {
    await call(fetchImpl, `${baseFor(key)}/v1/runs/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth(key) });
  },
};
