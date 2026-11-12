// One agent job on a real sandbox, end to end: start a pod, write a Python program into it, run it with a time limit,
// read the result back, stop the pod. It is the smallest real thing an agent does with fleet.
// Usage (a provider key connected in the cabinet, or sent in its header):
//   FLEET_KEY=fleet_... bun scripts/demo.mjs                     (provider picked by fleet: cheapest working one)
//   FLEET_KEY=fleet_... PROVIDER=daytona bun scripts/demo.mjs    (pick one)
//   add a base URL first for a local fleet: bun scripts/demo.mjs http://localhost:8799
const B = process.argv[2] || 'https://fleet.flisk.si';
const { FLEET_KEY, PROVIDER } = process.env;
if (!FLEET_KEY) throw new Error('set FLEET_KEY');
const H = { authorization: `Bearer ${FLEET_KEY}`, 'content-type': 'application/json' };
const say = (s) => console.log(s);
const call = async (method, path, body) => {
  const r = await fetch(B + path, { method, headers: H, body: body && JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (r.status >= 400) throw new Error(`${method} ${path} -> ${r.status} ${data.error || JSON.stringify(data)}`);
  return data;
};

// The job: a program an agent wrote. It reads a list of numbers and reports simple stats.
const JOB = `import json, statistics
numbers = [12.5, 7, 31, 9.25, 18, 22, 4]
result = {
    "count": len(numbers),
    "mean": round(statistics.mean(numbers), 2),
    "median": statistics.median(numbers),
    "largest": max(numbers),
}
with open("result.json", "w") as f:
    json.dump(result, f, indent=2)
print("done:", result["count"], "numbers")
`;

const started = Date.now();
say(`1. Starting a pod${PROVIDER ? ` on ${PROVIDER}` : ' on the cheapest provider you have'} ...`);
const pod = await call('POST', '/v1/pods', { cpu: 1, ram: 1, ...(PROVIDER ? { provider: PROVIDER } : {}) });
say(`   ${pod.provider}, ${pod.cpu} vCPU / ${pod.ram} GB, $${pod.pricePerHour}/h`);
const p = `/v1/pods/${encodeURIComponent(pod.id)}`;
try {
  say('2. Writing the program the agent produced into the pod ...');
  await call('PUT', `${p}/files`, { path: 'work/job.py', content: JOB });
  say('3. Running it with a 60-second limit ...');
  const run = await call('POST', `${p}/run`, { command: 'python3 job.py', cwd: 'work', timeout: 60 });
  if (run.exitCode !== 0) throw new Error(`the program failed (exit ${run.exitCode}): ${run.stderr || run.stdout}`);
  say(`   ${run.stdout.trim()}`);
  say('4. Reading the result back ...');
  const out = await call('GET', `${p}/files?path=${encodeURIComponent('work/result.json')}`);
  say(out.content.split('\n').map((l) => `   ${l}`).join('\n'));
} finally {
  await call('DELETE', p);
  say(`5. Pod stopped. Whole job: ${((Date.now() - started) / 1000).toFixed(1)} s.`);
}
