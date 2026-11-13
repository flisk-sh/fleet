// E2B (e2b.dev). Control API: https://api.e2b.app (OpenAPI in e2b-dev/E2B spec/openapi.yml) · prices: https://e2b.dev/pricing
// Commands run through the in-sandbox daemon (envd) over Connect RPC with JSON frames; no SDK needed.
// E2B has no memory field on create: memory comes from the template. Fleet uses the stock "base" template.
import { call, UA } from './http.js';

const API = 'https://api.e2b.app';
const CPU_HOUR = 0.000014 * 3600;
const GIB_HOUR = 0.0000045 * 3600;
const ENVD_PORT = '49983';

// The pod id must carry what run() needs later, because fleet stores nothing: sandbox id, envd token, domain.
const pack = (sandboxID, token, domain) => [sandboxID, token || '', domain || ''].join('~');
const unpack = (id) => {
  const [sandboxID, token, domain] = String(id).split('~');
  return { sandboxID, token: token || '', domain: domain || 'e2b.app' };
};

export function frame(obj) {
  const body = new TextEncoder().encode(JSON.stringify(obj));
  const out = new Uint8Array(5 + body.length);
  new DataView(out.buffer).setUint32(1, body.length);
  out.set(body, 5);
  return out;
}

// Connect streaming reply: [1 flag byte][4-byte big-endian length][JSON]. Flag 0x02 is the end-of-stream frame.
export function readFrames(bytes) {
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const dOut = new TextDecoder();
  const dErr = new TextDecoder();
  let stdout = '';
  let stderr = '';
  let exitCode = null;
  let at = 0;
  while (bytes.length - at >= 5) {
    const len = new DataView(bytes.buffer, bytes.byteOffset + at).getUint32(1);
    if (bytes.length - at < 5 + len) break;
    const flags = bytes[at];
    const msg = JSON.parse(new TextDecoder().decode(bytes.subarray(at + 5, at + 5 + len)) || '{}');
    at += 5 + len;
    if (flags & 0x02) {
      if (msg.error) throw new Error(`${msg.error.code}: ${msg.error.message}`);
      continue;
    }
    const ev = msg.event || {};
    if (ev.data?.stdout) stdout += dOut.decode(b64(ev.data.stdout), { stream: true });
    if (ev.data?.stderr) stderr += dErr.decode(b64(ev.data.stderr), { stream: true });
    if (ev.end) exitCode = ev.end.exitCode ?? 0;
  }
  return { stdout, stderr, exitCode };
}

export default {
  label: 'E2B',
  keyHeader: 'X-E2B-Key',
  help: 'https://github.com/flisk-sh/fleet/issues/3', // untested: never run against a real account
  priceSource: 'https://e2b.dev/pricing',
  note: 'Memory is set by the E2B template, not by fleet. Up to 8 vCPU on the free tier.',
  price: (size) => (size.cpu > 8 ? null : Math.round((size.cpu * CPU_HOUR + size.ram * GIB_HOUR) * 1000) / 1000),
  facts: {
    blurb: 'Firecracker sandboxes made for AI agents. Pause and resume with memory.',
    regions: ['US'],
    billing: 'per second',
    credit: '$100 one-time credit, no card',
    card: false,
    minimum: 0,
    maxCpu: 8,
    maxRam: 8,
    session: 3600, // seconds on the free tier; the $150-a-month Pro plan allows 24 hours
    concurrent: 10, // free tier; Pro allows 100
    pro: { monthly: 150, session: 86400, concurrent: 100 },
    startsPerDay: null,
    badges: ['$100 credit', 'No card', '1 h sessions free'],
    source: 'https://e2b.dev/pricing',
  },

  async create(key, size, { fetchImpl = fetch } = {}) {
    const body = { templateID: 'base', timeout: size.ttl ?? 3600 };
    // No cpuCount: a free-tier team gets 400 "Resizable templates are not enabled for your team" (seen 2026-11-13). The base template is 2 vCPU.
    const made = await call(fetchImpl, `${API}/v2/sandboxes`, { method: 'POST', headers: { 'x-api-key': key }, body });
    if (!made?.sandboxID) throw new Error('E2B returned no sandbox id');
    return { id: pack(made.sandboxID, made.envdAccessToken, made.domain) };
  },

  async run(key, id, command, { fetchImpl = fetch } = {}) {
    const { sandboxID, token, domain } = unpack(id);
    const res = await fetchImpl(`https://${ENVD_PORT}-${sandboxID}.${domain}/process.Process/Start`, {
      method: 'POST',
      headers: {
        'user-agent': UA,
        'content-type': 'application/connect+json',
        'connect-protocol-version': '1',
        'e2b-sandbox-id': sandboxID,
        'e2b-sandbox-port': ENVD_PORT,
        ...(token ? { 'x-access-token': token } : {}),
      },
      body: frame({ process: { cmd: '/bin/bash', args: ['-l', '-c', command], envs: {} }, stdin: false }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return readFrames(new Uint8Array(await res.arrayBuffer()));
  },

  async stop(key, id, { fetchImpl = fetch } = {}) {
    const { sandboxID } = unpack(id);
    try {
      await call(fetchImpl, `${API}/sandboxes/${encodeURIComponent(sandboxID)}`, { method: 'DELETE', headers: { 'x-api-key': key } });
    } catch (e) {
      if (e.status !== 404) throw e; // already gone
    }
  },
};
