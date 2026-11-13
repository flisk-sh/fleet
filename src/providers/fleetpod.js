// fleetpod: pods on a host you run yourself with fleetd (fleetd/fleetd.mjs): a free Hugging Face Space, a spare machine, a VPS.
// The credential is "<token>@<address of fleetd>", for example  s3cretvalue1234@https://me-fleetd.hf.space
// Free to use, so it always sorts first by price. It is not a sandbox: see fleetd/README.md.
import { call } from './http.js';

export function parseKey(key) {
  const i = String(key).indexOf('@');
  if (i < 1) throw new Error('fleetpod credential must look like <token>@<https address of your fleetd>');
  const token = key.slice(0, i);
  let base;
  try {
    base = new URL(key.slice(i + 1));
  } catch {
    throw new Error('fleetpod address is not a URL');
  }
  if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') throw new Error('fleetpod address must be https');
  return { token, base: base.origin };
}
const hdr = (token) => ({ authorization: `Bearer ${token}` });

export default {
  label: 'Fleet pod',
  keyHeader: 'X-Fleetpod-Key',
  help: 'https://github.com/flisk-sh/fleet/issues/4',
  untestedNote: 'Runs on a host you set up yourself with fleetd. It passes tests against a real local fleetd and waits for its first run on a free Hugging Face Space.',
  priceSource: 'https://github.com/flisk-sh/fleet/tree/main/fleetd',
  note: 'Runs on your own fleetd host (a free Hugging Face Space works). Not a sandbox: trusted code only.',
  price: (size) => (size.cpu <= 2 && size.ram <= 16 ? 0 : null),
  facts: {
    blurb: 'Pods on a host you run yourself with fleetd, for example a free Hugging Face Space. No cost, trusted code only.',
    regions: [],
    billing: 'free',
    credit: 'Free: you bring the host',
    card: false,
    minimum: 0,
    maxCpu: 2,
    maxRam: 16,
    session: 3600,
    concurrent: 10,
    startsPerDay: null,
    badges: ['Free', 'Your own host', 'Trusted code only'],
    source: 'https://github.com/flisk-sh/fleet/tree/main/fleetd',
    signup: 'https://huggingface.co/new-space',
    keyPage: 'https://github.com/flisk-sh/fleet/tree/main/fleetd',
    fields: [{ id: 'key', label: 'token@https://your-fleetd-address', secret: true }],
  },

  async create(key, size, { fetchImpl = fetch } = {}) {
    const { token, base } = parseKey(key);
    const r = await call(fetchImpl, `${base}/pods`, { method: 'POST', headers: hdr(token), body: { ttl: size.ttl ?? 3600 } });
    if (!r?.id) throw new Error('fleetd returned no pod id');
    return { id: r.id };
  },

  async run(key, id, command, { fetchImpl = fetch } = {}) {
    const { token, base } = parseKey(key);
    const r = await call(fetchImpl, `${base}/pods/${encodeURIComponent(id)}/exec`, { method: 'POST', headers: hdr(token), body: { command, timeout: 600 } });
    return { stdout: r?.stdout ?? '', stderr: r?.stderr ?? '', exitCode: r?.exitCode ?? null };
  },

  async stop(key, id, { fetchImpl = fetch } = {}) {
    const { token, base } = parseKey(key);
    await call(fetchImpl, `${base}/pods/${encodeURIComponent(id)}`, { method: 'DELETE', headers: hdr(token) });
  },
};
