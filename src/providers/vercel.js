// Vercel Sandbox. API: https://openapi.vercel.sh (POST /v4/sandboxes, /v2/sandboxes/sessions/...) · prices: https://vercel.com/docs/sandbox/pricing
// Firecracker microVMs. Sizes are 1 or an even number of vCPU, with 2 GB per vCPU.
// The key is "<access token>:<project id>" or "<access token>:<project id>:<team id>": Vercel's API needs the project, and the team for team accounts.
// Not tested yet: written from the OpenAPI spec on 2026-11-12, never run on a real account.
import { call, sleep, UA } from './http.js';

const API = 'https://api.vercel.com';
const CPU_HOUR = 0.128; // Active CPU: billed only while the CPU works, so this is the most a pod can cost
const GB_HOUR = 0.0212;
// Hobby sandboxes last at most 45 minutes (Vercel answers 400 "timeout restricted to <= 45m on Hobby plans", seen live
// 2026-11-12). Pro allows 24 hours; fleet uses the Hobby limit because it cannot tell the plan from the key.
const HOBBY_MAX_SECONDS = 2700;

export function parseVercelKey(key) {
  const [token, projectId, teamId] = String(key).split(':');
  if (!token || !projectId) throw new Error('Vercel key must be "<access token>:<project id>" (add ":<team id>" for a team)');
  return { token, projectId, teamId: teamId || '' };
}
const q = (k, extra = {}) => {
  const p = new URLSearchParams({ ...(k.teamId ? { teamId: k.teamId } : {}), ...extra });
  const s = p.toString();
  return s ? `?${s}` : '';
};
const auth = (k) => ({ authorization: `Bearer ${k.token}` });
export const vercelVcpus = (size) => {
  const v = Math.max(size.cpu, Math.ceil(size.ram / 2));
  const even = v === 1 ? 1 : v + (v % 2);
  return even > 32 ? null : even;
};

// Output of a waited command: NDJSON lines, {stream, data} for output and {command: {exitCode}} for status.
export function readNdjson(text) {
  let stdout = '';
  let stderr = '';
  let exitCode = null;
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    let m;
    try {
      m = JSON.parse(line);
    } catch {
      continue;
    }
    if (m.stream === 'stdout') stdout += m.data ?? '';
    else if (m.stream === 'stderr') stderr += m.data ?? '';
    else if (m.stream === 'error') throw new Error(`Vercel: ${m.data}`);
    if (m.command && m.command.exitCode !== undefined && m.command.exitCode !== null) exitCode = m.command.exitCode;
  }
  return { stdout, stderr, exitCode };
}

// The pod id carries the sandbox name (to delete it) and the session id (to run in it).
const pack = (name, session) => `${name}.${session}`;
const unpack = (id) => {
  const i = String(id).lastIndexOf('.');
  return { name: String(id).slice(0, i), session: String(id).slice(i + 1) };
};

export default {
  label: 'Vercel',
  keyHeader: 'X-Vercel-Key',
  help: 'https://github.com/flisk-sh/fleet/issues/4',
  priceSource: 'https://vercel.com/docs/sandbox/pricing',
  note: 'Key is "<token>:<project id>[:<team id>]". 2 GB per vCPU. CPU is billed only while busy, so the price shown is the most.',
  price: (size) => {
    const v = vercelVcpus(size);
    return v ? Math.round((v * CPU_HOUR + v * 2 * GB_HOUR) * 1000) / 1000 : null;
  },
  facts: {
    blurb: 'Firecracker microVMs on Vercel, in 19 regions. The free Hobby plan includes 5 CPU hours a month.',
    regions: ['US', 'EU', 'Asia'],
    billing: 'active CPU per ms, memory per minute',
    credit: 'Free Hobby plan: 5 CPU hours and 420 GB-hours a month',
    card: null,
    minimum: 0,
    maxCpu: 4, // Hobby; Pro 8, Enterprise 32
    maxRam: 8,
    session: 2700, // Hobby 45 minutes; Pro 24 hours
    concurrent: 10, // Hobby
    startsPerDay: null,
    badges: ['Free monthly hours', '19 regions'],
    source: 'https://vercel.com/docs/sandbox/pricing',
    signup: 'https://vercel.com/signup',
    keyPage: 'https://vercel.com/account/settings/tokens',
    // Joined as "token:projectId[:teamId]".
    fields: [
      { id: 'token', label: 'Access token', placeholder: 'Vercel access token', secret: true },
      { id: 'projectId', label: 'Project ID', placeholder: 'prj_...' },
      { id: 'teamId', label: 'Team ID', placeholder: 'team_... (teams only)', optional: true },
    ],
  },

  async create(key, size, { fetchImpl = fetch, wait = sleep } = {}) {
    const k = parseVercelKey(key);
    const vcpus = vercelVcpus(size);
    if (!vcpus) throw new Error('size not offered: Vercel sandboxes are at most 32 vCPU');
    const name = `fleet-${Date.now().toString(36)}${[...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    const made = await call(fetchImpl, `${API}/v4/sandboxes${q(k)}`, {
      method: 'POST',
      headers: auth(k),
      body: { name, projectId: k.projectId, resources: { vcpus, memory: vcpus * 2048 }, timeout: Math.min(size.ttl ?? 3600, HOBBY_MAX_SECONDS) * 1000, persistent: false },
    });
    const session = made?.session?.id || made?.sandbox?.currentSessionId;
    if (!session) throw new Error('Vercel returned no session id');
    let status = made?.session?.status;
    for (let i = 0; status !== 'running' && i < 30; i++) {
      if (/failed|aborted|stopped/.test(status || '')) throw new Error(`sandbox ${status}`);
      await wait(2000);
      status = (await call(fetchImpl, `${API}/v2/sandboxes/sessions/${encodeURIComponent(session)}${q(k)}`, { headers: auth(k) }))?.session?.status;
    }
    if (status !== 'running') throw new Error(`sandbox still ${status} after 60 s`);
    return { id: pack(made?.sandbox?.name || name, session) };
  },

  async run(key, id, command, { fetchImpl = fetch } = {}) {
    const k = parseVercelKey(key);
    const { session } = unpack(id);
    const res = await fetchImpl(`${API}/v2/sandboxes/sessions/${encodeURIComponent(session)}/cmd${q(k)}`, {
      method: 'POST',
      headers: { 'user-agent': UA, ...auth(k), 'content-type': 'application/json', accept: 'application/x-ndjson' },
      body: JSON.stringify({ command: 'bash', args: ['-lc', command], wait: true, logs: true, timeout: 600000 }),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return readNdjson(text);
  },

  async stop(key, id, { fetchImpl = fetch } = {}) {
    const k = parseVercelKey(key);
    await call(fetchImpl, `${API}/v2/sandboxes/${encodeURIComponent(unpack(id).name)}${q(k, { projectId: k.projectId, deleteOrphanSnapshots: 'true' })}`, { method: 'DELETE', headers: auth(k) });
  },
};
