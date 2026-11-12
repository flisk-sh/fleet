// Routing: which provider starts a pod. Cheapest first among the providers the caller sent a key for; the next one when a provider fails.
// Nothing is stored: the pod id carries the provider name and the provider's own id, so run and stop need no database.

export const DEFAULT_SIZE = { cpu: 2, ram: 4 };

export function parseSize(body = {}) {
  const cpu = body.cpu === undefined ? DEFAULT_SIZE.cpu : Number(body.cpu);
  const ram = body.ram === undefined ? DEFAULT_SIZE.ram : Number(body.ram);
  if (!Number.isInteger(cpu) || cpu < 1 || cpu > 16) return { error: 'cpu must be a whole number from 1 to 16' };
  if (!Number.isFinite(ram) || ram < 1 || ram > 64) return { error: 'ram must be a number of GB from 1 to 64' };
  return { cpu, ram };
}

// keys: { boat: '...', e2b: '...' } — only providers the caller holds an account at.
export function pickOrder(providers, keys, size, { provider, order } = {}) {
  const have = Object.keys(providers).filter((name) => keys[name]);
  if (provider) {
    if (!providers[provider]) return { error: `unknown provider "${provider}". Known: ${Object.keys(providers).join(', ')}` };
    if (!keys[provider]) return { error: `no key sent for ${provider}. Send it in the ${providers[provider].keyHeader} header` };
    return { order: [provider] };
  }
  if (!have.length) {
    const headers = Object.values(providers).map((p) => p.keyHeader).join(', ');
    return { error: `no provider key sent. Send at least one of: ${headers}` };
  }
  if (Array.isArray(order) && order.length) {
    const unknown = order.find((name) => !providers[name]);
    if (unknown) return { error: `unknown provider "${unknown}" in order` };
    const usable = order.filter((name) => keys[name]);
    if (!usable.length) return { error: 'none of the providers in order has a key in this request' };
    return { order: usable };
  }
  const priced = have
    .map((name) => ({ name, price: providers[name].price(size) }))
    .filter((p) => p.price !== null)
    .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  if (!priced.length) return { error: `none of your providers offers ${size.cpu} vCPU / ${size.ram} GB` };
  return { order: priced.map((p) => p.name) };
}

export const podId = (provider, providerId) => `pod_${provider}_${providerId}`;

export function parsePodId(id, providers) {
  const m = /^pod_([a-z0-9]+)_(.+)$/.exec(String(id || ''));
  if (!m || !providers[m[1]]) return null;
  return { provider: m[1], providerId: m[2] };
}

const short = (e) => String(e?.message || e).slice(0, 300);

export async function createPod(providers, keys, body, ctx = {}) {
  const size = parseSize(body);
  if (size.error) return { status: 400, error: size.error };
  const picked = pickOrder(providers, keys, size, body);
  if (picked.error) return { status: 400, error: picked.error };
  const failed = [];
  for (const name of picked.order) {
    try {
      const made = await providers[name].create(keys[name], size, ctx);
      return {
        status: 201,
        pod: { id: podId(name, made.id), provider: name, cpu: size.cpu, ram: size.ram, pricePerHour: providers[name].price(size), failed },
      };
    } catch (e) {
      failed.push({ provider: name, error: short(e) });
    }
  }
  return { status: 502, error: 'no provider could start a pod', failed };
}

export async function runPod(providers, keys, id, body, ctx = {}) {
  const ref = parsePodId(id, providers);
  if (!ref) return { status: 404, error: 'no such pod' };
  if (!keys[ref.provider]) return { status: 400, error: `this pod runs on ${ref.provider}. Send your key in the ${providers[ref.provider].keyHeader} header` };
  const command = typeof body?.command === 'string' ? body.command : '';
  if (!command.trim()) return { status: 400, error: 'command is required' };
  try {
    const out = await providers[ref.provider].run(keys[ref.provider], ref.providerId, command, ctx);
    return { status: 200, result: { stdout: out.stdout ?? '', stderr: out.stderr ?? '', exitCode: out.exitCode ?? null } };
  } catch (e) {
    return { status: 502, error: `${ref.provider}: ${short(e)}` };
  }
}

export async function stopPod(providers, keys, id, ctx = {}) {
  const ref = parsePodId(id, providers);
  if (!ref) return { status: 404, error: 'no such pod' };
  if (!keys[ref.provider]) return { status: 400, error: `this pod runs on ${ref.provider}. Send your key in the ${providers[ref.provider].keyHeader} header` };
  try {
    await providers[ref.provider].stop(keys[ref.provider], ref.providerId, ctx);
    return { status: 200, result: { stopped: true } };
  } catch (e) {
    return { status: 502, error: `${ref.provider}: ${short(e)}` };
  }
}

export function priceTable(providers, size = DEFAULT_SIZE) {
  return Object.entries(providers)
    .map(([name, p]) => ({ provider: name, label: p.label, pricePerHour: p.price(size), note: p.note || '', source: p.priceSource }))
    .sort((a, b) => (a.pricePerHour ?? Infinity) - (b.pricePerHour ?? Infinity));
}
