// Simulation, not a real provider: a fake provider with start delay and a time to live, driven through fleet's real routing code.
// Measures fleet's own overhead for 1..10 pods and what the caller sees when a pod dies. Run: bun scripts/simulate.mjs
import { createPod, runPod, stopPod } from '../src/route.js';

const pods = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gone = () => Object.assign(new Error('HTTP 404: sandbox not found'), { status: 404 });
const START_MS = 150; // typical provider start time, made up
const TTL_MS = 1500; // pod dies by itself after this (real providers: about an hour)

const sim = {
  label: 'sim',
  keyHeader: 'X-Sim-Key',
  priceSource: 'simulation',
  price: () => 0.01,
  async create() {
    await sleep(START_MS);
    const id = `p${pods.size + 1}`;
    pods.set(id, Date.now() + TTL_MS);
    return { id };
  },
  async run(key, id, command) {
    const dies = pods.get(id);
    if (!dies || Date.now() > dies) throw gone();
    await sleep(20);
    return { stdout: `${command}\n`, stderr: '', exitCode: 0 };
  },
  async stop(key, id) {
    if (!pods.has(id) || Date.now() > pods.get(id)) throw gone();
    pods.delete(id);
  },
};
const providers = { sim };
const keys = { sim: 'k' };
const ms = (t0) => Math.round(performance.now() - t0);

for (const n of [1, 3, 5, 10]) {
  pods.clear();
  let t = performance.now();
  const made = await Promise.all(Array.from({ length: n }, () => createPod(providers, keys, {})));
  const create = ms(t);
  t = performance.now();
  const ran = await Promise.all(made.map((m) => runPod(providers, keys, m.pod.id, { command: 'echo hi' })));
  const run = ms(t);
  t = performance.now();
  const stopped = await Promise.all(made.map((m) => stopPod(providers, keys, m.pod.id)));
  const stop = ms(t);
  console.log(`n=${n}: create ${create} ms, run ${run} ms, stop ${stop} ms, ok ${[...made, ...ran, ...stopped].every((r) => r.status < 400)}`);
}

// How a pod dies: it outlives its TTL, then the caller runs a command and tries to stop it.
pods.clear();
const one = (await createPod(providers, keys, {})).pod;
await sleep(TTL_MS + 100);
const afterRun = await runPod(providers, keys, one.id, { command: 'ls' });
const afterStop = await stopPod(providers, keys, one.id);
console.log('after the pod died, run  ->', afterRun.status, afterRun.error);
console.log('after the pod died, stop ->', afterStop.status, afterStop.error || JSON.stringify(afterStop.result));
