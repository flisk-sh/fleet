// LangSmith Sandboxes (LangChain). REST: https://docs.langchain.com/langsmith/smith-api/sandboxes/create-a-sandbox.md
// Host api.smith.langchain.com, key in X-API-Key. Prices: sandbox usage in LSU at $1.00 each (LangSmith pricing calculator):
// 0.0576 LSU per vCPU-hour, 0.01845 per GiB-hour. Not tested yet: written from the docs on 2026-11-12, never run on a real account.
// Guesses: the ready status is the word "ready" (the stop docs say "Stop a ready sandbox"); the exec `command` array is run as
// sh -c; fleet makes a disposable sandbox (persistent: false), so nothing is kept or billed for storage after the pod stops.
import { call, sleep } from './http.js';

const API = 'https://api.smith.langchain.com/api/v2/sandboxes';
const CPU_HOUR = 0.0576;
const GIB_HOUR = 0.01845;
const GIB = 1024 ** 3;
const auth = (key) => ({ 'x-api-key': key });

// LangSmith ties memory to CPU at 4 GiB per vCPU and accepts 50% either way.
export const langsmithRam = (size) => Math.min(size.cpu * 6, Math.max(size.cpu * 2, size.ram));

export default {
  label: 'LangSmith Sandboxes',
  keyHeader: 'X-Langsmith-Key',
  help: 'https://github.com/flisk-sh/fleet/issues/4',
  priceSource: 'https://docs.langchain.com/langsmith/pricing-plans',
  note: 'MicroVMs billed in LangSmith usage units ($1 each). Memory is 2 to 6 GiB per vCPU, up to 16 vCPU. Web egress is restricted on non-Enterprise plans.',
  price: (size) => (size.cpu > 16 ? null : Math.round((size.cpu * CPU_HOUR + langsmithRam(size) * GIB_HOUR) * 1000) / 1000),
  facts: {
    blurb: 'Full-root microVM workspaces from LangChain, with snapshots, an auth proxy and a Deep Agents backend.',
    regions: ['US', 'EU'],
    billing: 'per hour of allocated vCPU and memory, in LangSmith usage units',
    credit: 'Developer plan is free, then pay as you go',
    card: null,
    minimum: 0,
    maxCpu: 16,
    maxRam: 64,
    session: null,
    concurrent: null,
    startsPerDay: null,
    badges: ['Free developer plan', 'Auth proxy', 'Snapshots'],
    source: 'https://docs.langchain.com/langsmith/sandboxes',
    signup: 'https://smith.langchain.com',
    keyPage: 'https://smith.langchain.com/settings',
  },

  async create(key, size, { fetchImpl = fetch, wait = sleep } = {}) {
    let box = await call(fetchImpl, `${API}/boxes`, {
      method: 'POST',
      headers: auth(key),
      body: { vcpus: size.cpu, mem_bytes: Math.round(langsmithRam(size) * GIB), persistent: false, idle_ttl_seconds: size.ttl ?? 3600 },
    });
    const id = box?.id;
    if (!id) throw new Error('LangSmith returned no sandbox id');
    for (let i = 0; box.status !== 'ready' && i < 30; i++) {
      if (/fail|error|deleted|stopped/i.test(box.status || '')) throw new Error(`sandbox ${box.status}${box.status_message ? `: ${box.status_message}` : ''}`);
      await wait(2000);
      box = await call(fetchImpl, `${API}/boxes/${encodeURIComponent(id)}/status`, { headers: auth(key) });
    }
    if (box.status !== 'ready') throw new Error(`sandbox still ${box.status} after 60 s`);
    return { id };
  },

  async run(key, id, command, { fetchImpl = fetch } = {}) {
    const r = await call(fetchImpl, `${API}/${encodeURIComponent(id)}/execute`, {
      method: 'POST',
      headers: auth(key),
      body: { command: ['sh', '-c', command], timeout_seconds: 120 },
    });
    return { stdout: r?.stdout ?? '', stderr: r?.stderr ?? '', exitCode: r?.exit_code ?? null };
  },

  async stop(key, id, { fetchImpl = fetch } = {}) {
    await call(fetchImpl, `${API}/boxes/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth(key) });
  },
};
