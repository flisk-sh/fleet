// Runloop (runloop.ai) devboxes. API: https://docs.runloop.ai/api-reference · prices: https://www.runloop.ai/pricing
// Everything is plain JSON on api.runloop.ai. Waits are long-polls that answer within about 25-30 s, so fleet loops them.
// Not tested yet: written from the OpenAPI spec on 2026-11-12, never run on a real account.
import { call, sleep } from './http.js';

const API = 'https://api.runloop.ai';
const CPU_HOUR = 0.108;
const GB_HOUR = 0.0252;
const auth = (key) => ({ authorization: `Bearer ${key}` });

// Runloop takes custom sizes of 0.5, 1 or an even number of cores up to 16, and 1 or an even number of GB up to 64.
export function runloopSize(size) {
  const cpu = size.cpu === 1 ? 1 : size.cpu + (size.cpu % 2);
  const ram = size.ram <= 1 ? 1 : Math.ceil(size.ram / 2) * 2;
  return cpu > 16 || ram > 64 ? null : { cpu, ram };
}

// UUIDv7: the command id Runloop asks for, so a retried execute is not run twice.
export function uuidv7(now = Date.now()) {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const ts = BigInt(now);
  for (let i = 0; i < 6; i++) b[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn);
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const out = (r) => ({ stdout: r?.stdout ?? '', stderr: r?.stderr ?? '', exitCode: r?.exit_status ?? null });

export default {
  label: 'Runloop',
  keyHeader: 'X-Runloop-Key',
  help: 'https://github.com/flisk-sh/fleet/issues/4',
  blocked: { kind: 'invite', note: 'Runloop sign-up is by invitation only (waitlist: support@runloop.ai), so we cannot test it yet.' },
  priceSource: 'https://www.runloop.ai/pricing',
  note: 'Devboxes for coding agents. Winding down: transition support ends 13 Nov 2026 (Upstash, Nov 2026). Sign-up is by invitation only.',
  price: (size) => {
    const s = runloopSize(size);
    return s ? Math.round((s.cpu * CPU_HOUR + s.ram * GB_HOUR) * 1000) / 1000 : null;
  },
  facts: {
    blurb: 'Devboxes for building, running and testing AI coding agents, with snapshots and blueprints.',
    regions: ['US'],
    billing: 'per second',
    credit: 'Invitation only: join the waitlist (support@runloop.ai)', // was a $50 trial; Runloop closed sign-up, seen 2026-11-12
    card: null,
    minimum: 0,
    maxCpu: 16,
    maxRam: 64,
    session: 172800,
    concurrent: 3, // on the trial
    startsPerDay: null,
    badges: ['Invitation only', 'Up to 48 h'],
    source: 'https://www.runloop.ai/pricing',
    signup: 'mailto:support@runloop.ai?subject=Waitlist',
    keyPage: 'https://platform.runloop.ai/settings#api-keys',
  },

  async create(key, size, { fetchImpl = fetch, wait = sleep } = {}) {
    const s = runloopSize(size);
    if (!s) throw new Error('size not offered: Runloop devboxes are at most 16 vCPU and 64 GB');
    const box = await call(fetchImpl, `${API}/v1/devboxes`, {
      method: 'POST',
      headers: auth(key),
      body: { launch_parameters: { resource_size_request: 'CUSTOM_SIZE', custom_cpu_cores: s.cpu, custom_gb_memory: s.ram, keep_alive_time_seconds: size.ttl ?? 3600 } },
    });
    if (!box?.id) throw new Error('Runloop returned no devbox id');
    let status = box.status;
    for (let i = 0; status !== 'running' && i < 6; i++) {
      if (/fail|shutdown/.test(status || '')) throw new Error(`devbox ${status}${box.failure_reason ? `: ${box.failure_reason}` : ''}`);
      const r = await call(fetchImpl, `${API}/v1/devboxes/${encodeURIComponent(box.id)}/wait_for_status`, { method: 'POST', headers: auth(key), body: { statuses: ['running', 'failure', 'shutdown'], timeout_seconds: 25 } });
      status = r?.status;
      if (status !== 'running') await wait(1000);
    }
    if (status !== 'running') throw new Error(`devbox still ${status} after about 3 minutes`);
    return { id: box.id };
  },

  async run(key, id, command, { fetchImpl = fetch } = {}) {
    let r = await call(fetchImpl, `${API}/v1/devboxes/${encodeURIComponent(id)}/execute`, {
      method: 'POST',
      headers: auth(key),
      body: { command_id: uuidv7(), command, optimistic_timeout: 25 },
    });
    // Up to 10 minutes, like the other providers: 24 waits of about 25 s.
    for (let i = 0; r?.status !== 'completed' && i < 24; i++) {
      if (!r?.execution_id) throw new Error('Runloop returned no execution id');
      r = await call(fetchImpl, `${API}/v1/devboxes/${encodeURIComponent(id)}/executions/${encodeURIComponent(r.execution_id)}/wait_for_status`, { method: 'POST', headers: auth(key), body: { statuses: ['completed'], timeout_seconds: 25 } });
    }
    if (r?.status !== 'completed') throw new Error('command did not finish within 10 minutes');
    return out(r);
  },

  async stop(key, id, { fetchImpl = fetch } = {}) {
    await call(fetchImpl, `${API}/v1/devboxes/${encodeURIComponent(id)}/shutdown`, { method: 'POST', headers: auth(key), body: {} });
  },
};
