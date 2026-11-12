// Hopx (hopx.ai). API: https://docs.hopx.ai/api-reference/openapi.json · prices: https://hopx.ai/pricing
// Control plane on api.hopx.dev; commands go to the sandbox's own host with the sandbox's own token.
// Coming soon: written from the docs on 2026-11-12, never run on a real account.
// Guesses: the docs page says resources come from the template while the OpenAPI schema requires vcpu and memory_mb;
// fleet sends both a template name and the size.
import { call, sleep } from './http.js';

const API = 'https://api.hopx.dev';
const CPU_HOUR = 0.000014 * 3600;
const GIB_HOUR = 0.0000045 * 3600;
const TEMPLATE = 'code-interpreter';
const auth = (key) => ({ authorization: `Bearer ${key}` });

// The pod id carries what run() needs, because fleet stores nothing after "~": sandbox id, its host and its token.
const pack = (id, host, token) => [id, host || '', token || ''].join('~');
const unpack = (s) => {
  const [id, host, token] = String(s).split('~');
  return { id, host, token };
};

export default {
  label: 'Hopx',
  keyHeader: 'X-Hopx-Key',
  help: 'https://github.com/flisk-sh/fleet/issues/4',
  priceSource: 'https://hopx.ai/pricing',
  note: 'Firecracker microVMs, billed per second.',
  price: (size) => (size.cpu > 64 ? null : Math.round((size.cpu * CPU_HOUR + size.ram * GIB_HOUR) * 1000) / 1000),
  facts: {
    blurb: 'Firecracker microVMs for code that AI agents write, with no time limit on a sandbox.',
    regions: ['US', 'EU'],
    billing: 'per second',
    credit: '$200 free credit, no card',
    card: false,
    minimum: 0,
    maxCpu: 64,
    maxRam: null, // not published
    session: null,
    concurrent: null,
    startsPerDay: null,
    badges: ['$200 credit', 'No card', 'No time limit'],
    source: 'https://hopx.ai/pricing',
  },

  async create(key, size, { fetchImpl = fetch, wait = sleep } = {}) {
    let box = await call(fetchImpl, `${API}/v1/sandboxes`, {
      method: 'POST',
      headers: auth(key),
      body: { template_name: TEMPLATE, vcpu: size.cpu, memory_mb: Math.round(size.ram * 1024), timeout_seconds: size.ttl ?? 3600, internet_access: true },
    });
    if (!box?.id) throw new Error('Hopx returned no sandbox id');
    const first = box;
    for (let i = 0; box.status !== 'running' && i < 30; i++) {
      if (/fail|error|deleted|stopped/i.test(box.status || '')) throw new Error(`sandbox ${box.status}`);
      await wait(2000);
      box = await call(fetchImpl, `${API}/v1/sandboxes/${encodeURIComponent(first.id)}`, { headers: auth(key) });
    }
    if (box.status !== 'running') throw new Error(`sandbox still ${box.status} after 60 s`);
    const host = box.public_host || first.public_host;
    const token = box.auth_token || first.auth_token;
    if (!host) throw new Error('Hopx returned no public_host for the sandbox');
    return { id: pack(first.id, host, token) };
  },

  async run(key, id, command, { fetchImpl = fetch } = {}) {
    const { host, token } = unpack(id);
    const base = /^https?:\/\//.test(host) ? host : `https://${host}`;
    const r = await call(fetchImpl, `${base.replace(/\/$/, '')}/commands/run`, {
      method: 'POST',
      headers: auth(token || key),
      body: { command, timeout: 600 },
    });
    return { stdout: r?.stdout ?? '', stderr: r?.stderr ?? '', exitCode: r?.exit_code ?? null };
  },

  async stop(key, id, { fetchImpl = fetch } = {}) {
    await call(fetchImpl, `${API}/v1/sandboxes/${encodeURIComponent(unpack(id).id)}`, { method: 'DELETE', headers: auth(key) });
  },
};
