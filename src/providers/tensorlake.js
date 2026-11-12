// Tensorlake Sandboxes (tensorlake.ai). REST docs: https://docs.tensorlake.ai/api-reference/v2/sandboxes/create.md
// Control plane on api.tensorlake.ai; commands go to the sandbox's own proxy host (<id>.sandbox.tensorlake.ai/api/v1/processes)
// with the same API key. Prices: https://docs.tensorlake.ai/platform/billing.md (Usage Credits rates).
// Not tested yet: written from the docs on 2026-11-12, never run on a real account.
// Guesses: the proxy host is built as <id>.sandbox.tensorlake.ai (the commands page uses that form), not read from
// ingress_endpoint; stdout/stderr come from the /stdout and /stderr line lists after the process has exited.
import { call, sleep } from './http.js';

const API = 'https://api.tensorlake.ai';
const CPU_HOUR = 0.07; // per active core-hour, Usage Credits plan
const GB_HOUR = 0.015; // per GB-hour of allocated RAM
const auth = (key) => ({ authorization: `Bearer ${key}` });
const host = (id) => `https://${encodeURIComponent(id)}.sandbox.tensorlake.ai`;

// Tensorlake wants 1 to 8 GB of RAM per vCPU.
export const tensorlakeRam = (size) => Math.min(size.cpu * 8, Math.max(size.cpu, size.ram));

export default {
  label: 'Tensorlake',
  keyHeader: 'X-Tensorlake-Key',
  help: 'https://github.com/flisk-sh/fleet/issues/4',
  priceSource: 'https://docs.tensorlake.ai/platform/billing.md',
  note: 'MicroVMs billed per second on active CPU. Free plan: one 1 vCPU / 1 GB sandbox at a time; prepaid credits allow 4 vCPU / 16 GB.',
  price: (size) => (size.cpu > 16 ? null : Math.round((size.cpu * CPU_HOUR + tensorlakeRam(size) * GB_HOUR) * 1000) / 1000),
  facts: {
    blurb: 'MicroVM sandboxes that boot in hundreds of milliseconds, with memory and files kept across suspend and resume.',
    regions: ['US', 'EU'],
    billing: 'per second, active CPU',
    credit: 'Free plan, no card; prepaid credit packs from $5',
    card: false,
    minimum: 0,
    maxCpu: 16,
    maxRam: 64,
    session: 7200, // free plan, verified account; 24 h on credits
    concurrent: 1, // free plan
    startsPerDay: null,
    badges: ['Free plan', 'No card', 'Suspend and resume'],
    source: 'https://docs.tensorlake.ai/platform/billing.md',
    signup: 'https://cloud.tensorlake.ai',
    keyPage: 'https://cloud.tensorlake.ai',
  },

  async create(key, size, { fetchImpl = fetch, wait = sleep } = {}) {
    let box = await call(fetchImpl, `${API}/sandboxes`, {
      method: 'POST',
      headers: auth(key),
      body: { resources: { cpus: size.cpu, memory_mb: Math.round(tensorlakeRam(size) * 1024) }, timeout_secs: size.ttl ?? 3600 },
    });
    const id = box?.sandbox_id;
    if (!id) throw new Error('Tensorlake returned no sandbox_id');
    for (let i = 0; box.status === 'pending' && i < 30; i++) {
      await wait(2000);
      box = await call(fetchImpl, `${API}/sandboxes/${encodeURIComponent(id)}`, { headers: auth(key) });
    }
    if (box.status !== 'running') throw new Error(`sandbox ${box.status || 'unknown'}${box.pending_reason ? ` (${box.pending_reason})` : ''}`);
    return { id };
  },

  async run(key, id, command, { fetchImpl = fetch, wait = sleep } = {}) {
    const base = `${host(id)}/api/v1/processes`;
    const p = await call(fetchImpl, base, { method: 'POST', headers: auth(key), body: { command: 'sh', args: ['-c', command] } });
    if (p?.pid === undefined || p?.pid === null) throw new Error('Tensorlake returned no process id');
    let st = p;
    for (let i = 0; st.status === 'running' && i < 1200; i++) {
      await wait(500);
      st = await call(fetchImpl, `${base}/${p.pid}`, { headers: auth(key) });
    }
    const lines = async (stream) => (await call(fetchImpl, `${base}/${p.pid}/${stream}`, { headers: auth(key) }))?.lines ?? [];
    const [out, err] = [await lines('stdout'), await lines('stderr')];
    return { stdout: out.join('\n'), stderr: err.join('\n'), exitCode: st.exit_code ?? (st.signal ? 128 : null) };
  },

  async stop(key, id, { fetchImpl = fetch } = {}) {
    await call(fetchImpl, `${API}/sandboxes/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth(key) });
  },
};
