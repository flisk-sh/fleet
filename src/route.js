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
    return { error: `no provider key: connect a provider in the cabinet, or send one of: ${headers}` };
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
// The cabinet keeps pod facts. ctx.record(type, data) is optional and must never break a call.
const record = async (ctx, type, data) => {
  try {
    await ctx.record?.(type, data);
  } catch {}
};

// A provider answering 404 or 410 for a pod id means the pod is gone: stopped, expired or deleted. Say so plainly.
const isGone = (e) => e?.status === 404 || e?.status === 410;

async function createPodInner(providers, keys, body, ctx = {}) {
  const size = parseSize(body);
  if (size.error) return { status: 400, error: size.error };
  const picked = pickOrder(providers, keys, size, body);
  if (picked.error) return { status: 400, error: picked.error };
  const lim = ctx.getLimits ? await ctx.getLimits() : ctx.limits;
  if (lim && (size.cpu > lim.maxCpu || size.ram > lim.maxRam)) return { status: 400, error: `over your own limit: at most ${lim.maxCpu} vCPU and ${lim.maxRam} GB a pod. Change it in the cabinet under Limits` };
  if (lim) size.ttl = lim.lifetimeMin * 60;
  if (ctx.allowCreate && !(await ctx.allowCreate())) return { status: 429, error: 'daily pod limit reached for this account. It resets at midnight UTC; you can change it in the cabinet under Limits' };
  const failed = [];
  for (const name of picked.order) {
    try {
      const made = await providers[name].create(keys[name], size, ctx);
      const pod = { id: podId(name, made.id), provider: name, cpu: size.cpu, ram: size.ram, pricePerHour: providers[name].price(size), failed };
      await record(ctx, 'created', pod);
      return { status: 201, pod };
    } catch (e) {
      failed.push({ provider: name, error: short(e) });
    }
  }
  await record(ctx, 'failed', { cpu: size.cpu, ram: size.ram, failed });
  return { status: 502, error: 'no provider could start a pod', failed };
}

async function runPodInner(providers, keys, id, body, ctx = {}) {
  const ref = parsePodId(id, providers);
  if (!ref) return { status: 404, error: 'no such pod' };
  if (!keys[ref.provider]) return { status: 400, error: `this pod runs on ${ref.provider}. Send your key in the ${providers[ref.provider].keyHeader} header` };
  const command = typeof body?.command === 'string' ? body.command : '';
  if (!command.trim()) return { status: 400, error: 'command is required' };
  try {
    const out = await providers[ref.provider].run(keys[ref.provider], ref.providerId, command, ctx);
    return { status: 200, result: { stdout: out.stdout ?? '', stderr: out.stderr ?? '', exitCode: out.exitCode ?? null } };
  } catch (e) {
    if (isGone(e)) await record(ctx, 'gone', { id });
    if (isGone(e)) return { status: 410, error: `this pod is gone: ${ref.provider} no longer has it (stopped, expired or deleted). Create a new pod` };
    return { status: 502, error: `${ref.provider}: ${short(e)}` };
  }
}

async function stopPodInner(providers, keys, id, ctx = {}) {
  const ref = parsePodId(id, providers);
  if (!ref) return { status: 404, error: 'no such pod' };
  if (!keys[ref.provider]) return { status: 400, error: `this pod runs on ${ref.provider}. Send your key in the ${providers[ref.provider].keyHeader} header` };
  try {
    await providers[ref.provider].stop(keys[ref.provider], ref.providerId, ctx);
    await record(ctx, 'stopped', { id });
    return { status: 200, result: { stopped: true } };
  } catch (e) {
    if (isGone(e)) await record(ctx, 'gone', { id });
    if (isGone(e)) return { status: 200, result: { stopped: true, alreadyGone: true } }; // stopping a dead pod is a success, so retries are safe
    return { status: 502, error: `${ref.provider}: ${short(e)}` };
  }
}

// Every start, run and stop goes to the usage log (ctx.log). Logging must never break a call.
const timed = (kind, inner, refOf) => async (...args) => {
  const ctx = args[args.length - 1] || {};
  const t0 = Date.now();
  const r = await inner(...args);
  try {
    const ref = refOf(r, args);
    // A failed start keeps each provider's answer, the same detail the Pods page shows.
    const why = r.failed?.length && r.status >= 400 ? `${r.error}: ${r.failed.map((f) => `${f.provider} ${f.error}`).join('; ')}` : r.error;
    await ctx.log?.({ kind, status: r.status, ms: Date.now() - t0, provider: ref.provider ?? null, id: ref.id ?? null, error: r.status >= 400 ? why : null });
  } catch {}
  return r;
};
const fromId = (providers, id) => {
  const p = parsePodId(id, providers);
  return { provider: p?.provider, id: p ? id : null };
};
export const createPod = timed('start', createPodInner, (r) => ({ provider: r.pod?.provider, id: r.pod?.id }));
export const runPod = timed('run', runPodInner, (r, [providers, , id]) => fromId(providers, id));
export const stopPod = timed('stop', stopPodInner, (r, [providers, , id]) => fromId(providers, id));

export function priceTable(providers, size = DEFAULT_SIZE) {
  return Object.entries(providers)
    .filter(([, p]) => !p.demo)
    .map(([name, p]) => ({ provider: name, label: p.label, pricePerHour: p.price(size), note: p.note || '', source: p.priceSource }))
    .sort((a, b) => (a.pricePerHour ?? Infinity) - (b.pricePerHour ?? Infinity));
}
