// Routing: which provider starts a pod. Cheapest first among the providers the caller sent a key for; the next one when a provider fails.
// Nothing is stored: the pod id carries the provider name and the provider's own id, so run and stop need no database.

export const DEFAULT_SIZE = { cpu: 2, ram: 4 };

export function parseSize(body = {}) {
  const cpu = body.cpu === undefined ? DEFAULT_SIZE.cpu : Number(body.cpu);
  const ram = body.ram === undefined ? DEFAULT_SIZE.ram : Number(body.ram);
  if (!Number.isInteger(cpu) || cpu < 1 || cpu > 16) return { error: 'cpu must be a whole number from 1 to 16' };
  if (!Number.isFinite(ram) || ram < 1 || ram > 64) return { error: 'ram must be a number of GB from 1 to 64' };
  // public: true asks for a pod that can later give a port a public URL and outlive the call (see publicUrl below).
  // Providers that cannot do that ignore it and start a normal pod.
  return body.public === true ? { cpu, ram, public: true } : { cpu, ram };
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
  const raw = typeof body?.command === 'string' ? body.command : '';
  if (!raw.trim()) return { status: 400, error: 'command is required' };
  const wrapped = wrapCommand(raw, body);
  if (wrapped.error) return { status: 400, error: wrapped.error };
  try {
    const out = await providers[ref.provider].run(keys[ref.provider], ref.providerId, wrapped.command, ctx);
    const exitCode = out.exitCode ?? null;
    const result = { stdout: out.stdout ?? '', stderr: out.stderr ?? '', exitCode };
    if (wrapped.timeout) result.timedOut = exitCode === 124;
    return { status: 200, result };
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

// A public URL for one port of a pod: the running app can be opened from anywhere. Only some providers can do it.
// startup (optional) is the command the pod runs each time it starts again, so the app comes back after the
// provider pauses an idle pod and a visit wakes it.
async function publicUrlInner(providers, keys, id, body, ctx = {}) {
  const ref = parsePodId(id, providers);
  if (!ref) return { status: 404, error: 'no such pod' };
  if (!keys[ref.provider]) return { status: 400, error: `this pod runs on ${ref.provider}. Send your key in the ${providers[ref.provider].keyHeader} header` };
  const port = Number(body?.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { status: 400, error: 'port must be a whole number from 1 to 65535' };
  const startup = body?.startup === undefined ? '' : String(body.startup);
  if (startup.length > 2000) return { status: 400, error: 'startup is at most 2000 characters' };
  const prov = providers[ref.provider];
  if (typeof prov.publicUrl !== 'function') return { status: 501, error: `${ref.provider} cannot give a pod a public URL through fleet yet` };
  try {
    const r = await prov.publicUrl(keys[ref.provider], ref.providerId, port, { ...ctx, startup });
    // wakesOnVisit: the pod sleeps when idle and a visit to the URL starts it again (the link keeps working).
    // Otherwise the link works until the pod's own lifetime ends: expiresAt when the provider says, else unknown (null).
    return { status: 200, result: { url: r.url, port, wakesOnVisit: r.wakesOnVisit === true, expiresAt: r.expiresAt ?? null } };
  } catch (e) {
    if (isGone(e)) return { status: 410, error: `this pod is gone: ${ref.provider} no longer has it (stopped, expired or deleted). Create a new pod` };
    return { status: 502, error: `${ref.provider}: ${short(e)}` };
  }
}

// ---- run options and files, built on run() alone, so every provider gets them with no adapter code.
// Quote one value for a POSIX shell.
export const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// env (object of strings), cwd (path) and timeout (seconds, 1-3600) turn into one `sh -c` line.
// A provider that runs the line in a shell and one that splits it into words both see the same command.
export function wrapCommand(command, { env, cwd, timeout } = {}) {
  const parts = [];
  if (cwd !== undefined) {
    if (typeof cwd !== 'string' || !cwd.trim()) return { error: 'cwd must be a path' };
    parts.push(`cd ${shq(cwd)}`);
  }
  if (env !== undefined) {
    if (!env || typeof env !== 'object' || Array.isArray(env)) return { error: 'env must be an object of names to values' };
    const pairs = Object.entries(env);
    if (pairs.length > 100) return { error: 'env takes at most 100 variables' };
    for (const [k, v] of pairs) {
      if (!ENV_NAME.test(k)) return { error: `env name "${k}" is not a valid variable name` };
      if (v === null || typeof v === 'object') return { error: `env ${k} must be a string, number or boolean` };
    }
    if (pairs.length) parts.push(`export ${pairs.map(([k, v]) => `${k}=${shq(v)}`).join(' ')}`);
  }
  let secs = null;
  if (timeout !== undefined) {
    secs = Number(timeout);
    if (!Number.isInteger(secs) || secs < 1 || secs > 3600) return { error: 'timeout must be a whole number of seconds from 1 to 3600' };
  }
  if (!parts.length && secs === null) return { command };
  const inner = parts.length ? `${parts.join(' && ')} && ${command}` : command;
  if (secs === null) return { command: `sh -c ${shq(inner)}`, timeout: null };
  // GNU timeout exits 124 when the command ran out of time; busybox timeout (Blaxel's image) dies from the signal, which a
  // provider reports as -1 (seen live 2026-11-12). So an outer shell turns "killed (exit above 123) after at least
  // `secs` seconds" into 124 for every image. -k 5 kills a command that ignores TERM 5 s later.
  const guarded = `t0=$(date +%s); timeout -k 5 ${secs} sh -c ${shq(inner)}; rc=$?; if [ "$rc" -gt 123 ] && [ $(( $(date +%s) - t0 )) -ge ${secs} ]; then exit 124; fi; exit $rc`;
  return { command: `sh -c ${shq(guarded)}`, timeout: secs };
}

export const MAX_FILE_BYTES = 256 * 1024;
const toB64 = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromB64 = (s) => Uint8Array.from(atob(String(s).replace(/\s+/g, '')), (c) => c.charCodeAt(0));
const checkPath = (path) => (typeof path === 'string' && path.trim() && !path.includes('\0') ? null : 'path is required');
// "~/app/x" is the home folder, as it is in a shell. Quoted whole, the tilde stayed a folder named "~" in the working
// folder, so a write to ~/app/... never reached the app the model built there.
export const shPath = (path) => (path === '~' ? '"$HOME"' : path.startsWith('~/') ? `"$HOME"/${shq(path.slice(2))}` : shq(path));

async function writeFileInner(providers, keys, id, body, ctx = {}) {
  const bad = checkPath(body?.path);
  if (bad) return { status: 400, error: bad };
  if (typeof body?.content !== 'string') return { status: 400, error: 'content must be a string (text, or base64 with "encoding": "base64")' };
  let bytes;
  if (body.encoding === 'base64') {
    try {
      bytes = fromB64(body.content);
    } catch {
      return { status: 400, error: 'content is not valid base64' };
    }
  } else if (body.encoding === undefined || body.encoding === 'utf8') bytes = new TextEncoder().encode(body.content);
  else return { status: 400, error: 'encoding must be "utf8" or "base64"' };
  if (bytes.length > MAX_FILE_BYTES) return { status: 413, error: `file is ${bytes.length} bytes; fleet moves at most ${MAX_FILE_BYTES} bytes a call` };
  const p = shPath(body.path);
  const command = `mkdir -p "$(dirname ${p})" && printf %s ${shq(toB64(bytes))} | base64 -d > ${p}`;
  const r = await runPodInner(providers, keys, id, { command }, ctx);
  if (r.status !== 200) return r;
  if (r.result.exitCode !== 0) return { status: 422, error: `could not write ${body.path}: ${(r.result.stderr || r.result.stdout).trim().slice(0, 300) || `exit code ${r.result.exitCode}`}` };
  return { status: 200, result: { path: body.path, bytes: bytes.length } };
}

async function readFileInner(providers, keys, id, body, ctx = {}) {
  const bad = checkPath(body?.path);
  if (bad) return { status: 400, error: bad };
  const p = shPath(body.path);
  const command = `[ -f ${p} ] || { echo "no such file" >&2; exit 2; }; s=$(wc -c < ${p}); [ "$s" -le ${MAX_FILE_BYTES} ] || { echo "file is $s bytes, fleet reads at most ${MAX_FILE_BYTES}" >&2; exit 3; }; base64 < ${p}`;
  const r = await runPodInner(providers, keys, id, { command }, ctx);
  if (r.status !== 200) return r;
  const why = (r.result.stderr || '').trim();
  if (r.result.exitCode === 2) return { status: 404, error: `no such file in the pod: ${body.path}` };
  if (r.result.exitCode === 3) return { status: 413, error: why || 'file too big' };
  if (r.result.exitCode !== 0) return { status: 422, error: `could not read ${body.path}: ${why.slice(0, 300) || `exit code ${r.result.exitCode}`}` };
  let bytes;
  try {
    bytes = fromB64(r.result.stdout);
  } catch {
    return { status: 502, error: 'the pod did not answer with base64; is base64 installed in its image?' };
  }
  try {
    return { status: 200, result: { path: body.path, bytes: bytes.length, encoding: 'utf8', content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) } };
  } catch {
    return { status: 200, result: { path: body.path, bytes: bytes.length, encoding: 'base64', content: toB64(bytes) } };
  }
}

// Every start, run and stop goes to the usage log (ctx.log). Logging must never break a call.
const timed = (kind, inner, refOf, detailOf = () => null) => async (...args) => {
  const ctx = args[args.length - 1] || {};
  const t0 = Date.now();
  const r = await inner(...args);
  try {
    const ref = refOf(r, args);
    // A failed start keeps each provider's answer, the same detail the Pods page shows.
    const why = r.failed?.length && r.status >= 400 ? `${r.error}: ${r.failed.map((f) => `${f.provider} ${f.error}`).join('; ')}` : r.error;
    await ctx.log?.({ kind, status: r.status, ms: Date.now() - t0, provider: ref.provider ?? null, id: ref.id ?? null, error: r.status >= 400 ? why : null, detail: detailOf(args), exitCode: kind === 'run' ? r.result?.exitCode : null });
  } catch {}
  return r;
};
const fromId = (providers, id) => {
  const p = parsePodId(id, providers);
  return { provider: p?.provider, id: p ? id : null };
};
export const createPod = timed('start', createPodInner, (r) => ({ provider: r.pod?.provider, id: r.pod?.id }));
// What the history shows: the first 200 characters of the command, or the file path.
const commandOf = ([, , , body]) => (typeof body?.command === 'string' ? body.command.slice(0, 200) : null);
const pathOf = ([, , , body]) => (typeof body?.path === 'string' ? body.path.slice(0, 200) : null);
export const runPod = timed('run', runPodInner, (r, [providers, , id]) => fromId(providers, id), commandOf);
export const stopPod = timed('stop', stopPodInner, (r, [providers, , id]) => fromId(providers, id));
export const publicUrl = timed('public', publicUrlInner, (r, [providers, , id]) => fromId(providers, id));
export const writeFile = timed('write', writeFileInner, (r, [providers, , id]) => fromId(providers, id), pathOf);
export const readFile = timed('read', readFileInner, (r, [providers, , id]) => fromId(providers, id), pathOf);

// A provider is in one of three states:
//   working   run end to end on a real account (`working: '<date>'` in its file)
//   blocked   built, but nobody can test it yet; `blocked: { kind, note }`, kind is down, card or invite
//   untested  built from the provider's docs and tested against fake replies: should work, waits for a real-account test
export const HELP_NEW = 'https://github.com/flisk-sh/fleet/issues/4';
export const BLOCKED_LABEL = { down: 'Provider down', card: 'Needs a card', invite: 'Invite only' };
export function providerState(p) {
  if (p.working) return { status: 'working', stateLabel: 'Working', tested: p.working };
  if (p.blocked) return { status: 'blocked', stateLabel: BLOCKED_LABEL[p.blocked.kind] || 'Blocked', blocker: p.blocked.note, help: p.help || HELP_NEW };
  return { status: 'untested', stateLabel: 'Untested', help: p.help || HELP_NEW };
}

export function priceTable(providers, size = DEFAULT_SIZE) {
  return Object.entries(providers)
    .filter(([, p]) => !p.demo)
    .map(([name, p]) => ({ provider: name, label: p.label, pricePerHour: p.price(size), note: p.note || '', untestedNote: p.untestedNote || '', source: p.priceSource, keyHeader: p.keyHeader, ...providerState(p) }))
    // Providers nobody can start today (card, down, invitation) go last, so the first entry is one you can use.
    .sort((a, b) => (a.status === 'blocked') - (b.status === 'blocked') || (a.pricePerHour ?? Infinity) - (b.pricePerHour ?? Infinity));
}
