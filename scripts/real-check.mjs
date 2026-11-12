// Real-account check for one provider: the steps a provider must pass before it is marked "working".
// Start a small pod, run with env/cwd/timeout, write and read a file, time out a command, stop it, stop it again.
// The pod is always stopped, even when a step fails. Prints a table to paste into the provider's help issue.
// Usage:
//   FLEET_KEY=fleet_... PROVIDER=hopx bun scripts/real-check.mjs                  (key connected in the cabinet)
//   FLEET_KEY=fleet_... PROVIDER=hopx PROVIDER_KEY=... bun scripts/real-check.mjs (key sent in the header, never stored)
//   add a base URL as the first argument for a local fleet: bun scripts/real-check.mjs http://localhost:8799
import { PROVIDERS } from '../src/providers/index.js';

const B = process.argv[2] || 'https://fleet.flisk.si';
const { FLEET_KEY, PROVIDER, PROVIDER_KEY } = process.env;
if (!FLEET_KEY || !PROVIDER) throw new Error('set FLEET_KEY and PROVIDER');
const p = PROVIDERS[PROVIDER];
if (!p) throw new Error(`unknown PROVIDER ${PROVIDER}. Known: ${Object.keys(PROVIDERS).join(', ')}`);
const H = { authorization: `Bearer ${FLEET_KEY}`, 'content-type': 'application/json', ...(PROVIDER_KEY ? { [p.keyHeader]: PROVIDER_KEY } : {}) };

const rows = [];
const call = async (step, method, path, body, check) => {
  const t = performance.now();
  let status = 0;
  let data = {};
  try {
    const r = await fetch(B + path, { method, headers: H, body: body && JSON.stringify(body) });
    status = r.status;
    data = await r.json().catch(() => ({}));
  } catch (e) {
    data = { error: String(e?.message || e) };
  }
  const ok = check(status, data);
  rows.push({ step, ok, status, ms: Math.round(performance.now() - t), body: JSON.stringify(data).slice(0, 160) });
  return { ok, status, data };
};

const start = await call('start 1 vCPU / 1 GB', 'POST', '/v1/pods', { provider: PROVIDER, cpu: 1, ram: 1 }, (s, d) => s === 201 && !!d.id);
const id = start.data.id;
if (id) {
  const pod = `/v1/pods/${encodeURIComponent(id)}`;
  try {
    await call('run with env, cwd, timeout', 'POST', `${pod}/run`, { command: 'echo "$A"; pwd', env: { A: "it's ok" }, cwd: '/tmp', timeout: 20 }, (s, d) => s === 200 && d.stdout === "it's ok\n/tmp\n" && d.exitCode === 0);
    await call('write a file', 'PUT', `${pod}/files`, { path: 'fleet-test/a b.txt', content: 'héllo' }, (s, d) => s === 200 && d.bytes === 6);
    await call('read it back', 'GET', `${pod}/files?path=${encodeURIComponent('fleet-test/a b.txt')}`, null, (s, d) => s === 200 && d.content === 'héllo');
    await call('time out a command', 'POST', `${pod}/run`, { command: 'sleep 30', timeout: 2 }, (s, d) => s === 200 && d.timedOut === true);
  } finally {
    await call('stop', 'DELETE', pod, null, (s, d) => s === 200 && d.stopped === true);
    await call('stop again', 'DELETE', pod, null, (s, d) => s === 200 && d.stopped === true);
  }
}

const passed = rows.length === 7 && rows.every((r) => r.ok);
console.log(`\n${p.label} through ${B}, ${new Date().toISOString().slice(0, 16)} UTC: ${passed ? 'PASS' : 'FAIL'}\n`);
console.log('| Step | OK | HTTP | ms | Answer |\n|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.step} | ${r.ok ? 'yes' : '**no**'} | ${r.status} | ${r.ms} | \`${r.body.replace(/\|/g, '\\|')}\` |`);
if (passed) console.log(`\nAll steps passed: set \`working: '${new Date().toISOString().slice(0, 10)}'\` in src/providers/${PROVIDER}.js and remove its \`help\` line.`);
process.exit(passed ? 0 : 1);
