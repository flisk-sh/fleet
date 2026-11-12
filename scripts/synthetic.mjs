// Synthetic users on a live fleet, with demo pods: N agents at once start a pod, run 3 commands,
// half stop it, half let it die (ttl), then everyone runs again to see how a dead pod answers.
// Usage: FLEET_KEY=fleet_... bun scripts/synthetic.mjs [origin]
const B = process.argv[2] || 'https://fleet.flisk.si';
const KEY = process.env.FLEET_KEY;
if (!KEY) throw new Error('set FLEET_KEY');
const TTL = 20;
const H = { authorization: `Bearer ${KEY}`, 'x-demo-key': `ttl=${TTL}`, 'content-type': 'application/json' };
const call = async (method, path, body) => {
  const t = performance.now();
  const r = await fetch(B + path, { method, headers: H, body: body && JSON.stringify(body) });
  return { status: r.status, ms: performance.now() - t, body: await r.json().catch(() => ({})) };
};
const p50 = (xs) => Math.round([...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]);
const max = (xs) => Math.round(Math.max(...xs));

async function agent(i) {
  const start = await call('POST', '/v1/pods', { provider: 'demo' });
  if (start.status !== 201) return { i, error: `${start.status} ${JSON.stringify(start.body)}` };
  const id = start.body.id;
  const runs = [];
  for (const c of ['echo hello', 'echo step 2', 'echo step 3']) runs.push(await call('POST', `/v1/pods/${id}/run`, { command: c }));
  const stop = i % 2 === 0 ? await call('DELETE', `/v1/pods/${id}`) : null;
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
console.log('n  | wall ms | start p50 ms | run p50 ms | ok');
for (const r of rows) console.log(`${String(r.n).padEnd(2)} | ${r.wall} | ${r.startP50} | ${r.runP50} | ${r.ok}/${r.n}${r.errors.length ? ' ' + r.errors[0] : ''}`);

console.log(`\nwaiting ${TTL + 3} s for the 10 pods' time to live to run out...`);
await new Promise((r) => setTimeout(r, (TTL + 3) * 1000));
const after = await Promise.all(globalThis.last.map(async (a) => ({ stopped: !!a.stop, run: await call('POST', `/v1/pods/${a.id}/run`, { command: 'ls' }), stop: await call('DELETE', `/v1/pods/${a.id}`) })));
const tally = (xs) => Object.entries(xs.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {})).map(([k, v]) => `${v}× ${k}`).join(', ');
console.log('after death, run :', tally(after.map((a) => a.run.status)), '|', after[0].run.body.error);
console.log('after death, stop:', tally(after.map((a) => `${a.stop.status}${a.stop.body.alreadyGone ? ' alreadyGone' : ''}`)));
console.log('dead-pod answers took p50', p50(after.map((a) => a.run.ms)), 'ms, max', max(after.map((a) => a.run.ms)), 'ms');
