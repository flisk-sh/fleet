// 1 to 10 agents at once on a live fleet: each starts a pod, runs 3 commands, and half of them stop it.
// Demo pods (default): the other half die by themselves after a short time to live.
// Real provider: every pod is stopped (nothing is left running or billed), then all are called again to see how a gone pod answers.
// Usage:
//   FLEET_KEY=fleet_... bun scripts/synthetic.mjs
//   FLEET_KEY=fleet_... PROVIDER=daytona PROVIDER_KEY=... bun scripts/synthetic.mjs
// Keys can also come from a .env file next to package.json (bun reads it): FLEET_KEY, PROVIDER, PROVIDER_KEY.
const B = process.argv[2] || 'https://fleet.flisk.si';
const KEY = process.env.FLEET_KEY;
if (!KEY) throw new Error('set FLEET_KEY');
const PROVIDER = process.env.PROVIDER || 'demo';
const REAL = PROVIDER !== 'demo';
const HEADER = { demo: 'x-demo-key', boat: 'x-boat-key', isorun: 'x-isorun-key', e2b: 'x-e2b-key', daytona: 'x-daytona-key' }[PROVIDER];
if (!HEADER) throw new Error(`unknown PROVIDER ${PROVIDER}`);
if (REAL && !process.env.PROVIDER_KEY) throw new Error('set PROVIDER_KEY for a real provider');
const TTL = 20;
// Real pods are small (1 vCPU, 1 GB) so ten of them fit a new account's limits (Daytona's first tier: 10 vCPU in all).
const SIZE = REAL ? { cpu: 1, ram: 1 } : {};
const H = { authorization: `Bearer ${KEY}`, [HEADER]: REAL ? process.env.PROVIDER_KEY : `ttl=${TTL}`, 'content-type': 'application/json' };
const call = async (method, path, body) => {
  const t = performance.now();
  const r = await fetch(B + path, { method, headers: H, body: body && JSON.stringify(body) });
  return { status: r.status, ms: performance.now() - t, body: await r.json().catch(() => ({})) };
};
const p50 = (xs) => Math.round([...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]);
const max = (xs) => Math.round(Math.max(...xs));

async function agent(i) {
  const start = await call('POST', '/v1/pods', { provider: PROVIDER, ...SIZE });
  if (start.status !== 201) return { i, error: `${start.status} ${JSON.stringify(start.body)}` };
  const id = start.body.id;
  const runs = [];
  for (const c of ['echo hello', 'echo step 2', 'echo step 3']) runs.push(await call('POST', `/v1/pods/${id}/run`, { command: c }));
  const stop = REAL || i % 2 === 0 ? await call('DELETE', `/v1/pods/${id}`) : null;
  return { i, id, start, runs, stop };
}

const rows = [];
for (const n of [1, 3, 5, 10]) {
  const t = performance.now();
  const res = await Promise.all(Array.from({ length: n }, (_, i) => agent(i)));
  const wall = performance.now() - t;
  const bad = res.filter((r) => r.error || r.runs.some((x) => x.status !== 200) || (r.stop && r.stop.status !== 200));
  rows.push({ n, wall: Math.round(wall), startP50: p50(res.map((r) => r.start?.ms ?? 0)), runP50: p50(res.flatMap((r) => r.runs?.map((x) => x.ms) ?? [])), ok: n - bad.length, errors: bad.map((b) => b.error || 'run/stop failed') });
  if (n === 10) globalThis.last = res;
}
console.log(`provider: ${PROVIDER}${REAL ? ' (real pods, all stopped after use)' : ' (demo, simulated)'}`);
console.log('n  | wall ms | start p50 ms | run p50 ms | ok');
for (const r of rows) console.log(`${String(r.n).padEnd(2)} | ${r.wall} | ${r.startP50} | ${r.runP50} | ${r.ok}/${r.n}${r.errors.length ? ' ' + r.errors[0] : ''}`);

if (!REAL) {
  console.log(`\nwaiting ${TTL + 3} s for the 10 pods' time to live to run out...`);
  await new Promise((r) => setTimeout(r, (TTL + 3) * 1000));
} else {
  console.log('\nall real pods were stopped; calling them again to see how a gone pod answers...');
  await new Promise((r) => setTimeout(r, 5000));
}
const after = await Promise.all(globalThis.last.map(async (a) => ({ stopped: !!a.stop, run: await call('POST', `/v1/pods/${a.id}/run`, { command: 'ls' }), stop: await call('DELETE', `/v1/pods/${a.id}`) })));
const tally = (xs) => Object.entries(xs.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {})).map(([k, v]) => `${v}× ${k}`).join(', ');
console.log('after death, run :', tally(after.map((a) => a.run.status)), '|', after[0].run.body.error);
console.log('after death, stop:', tally(after.map((a) => `${a.stop.status}${a.stop.body.alreadyGone ? ' alreadyGone' : ''}`)));
console.log('dead-pod answers took p50', p50(after.map((a) => a.run.ms)), 'ms, max', max(after.map((a) => a.run.ms)), 'ms');
