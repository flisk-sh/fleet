// fleetd: the pod host behind fleet's "fleetpod" provider. One small HTTP server, no dependencies (Node 20+ or Bun).
// A pod is a private working folder; a command runs as a child process in it. This is NOT a sandbox: pods share the host
// kernel, so use it for your own and trusted agents only (see fleetd/README.md).
//   FLEETD_TOKEN=secret PORT=7860 node fleetd/fleetd.mjs        (listens on 127.0.0.1; set HOST=0.0.0.0 to be reachable)
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT_CAP = 1_000_000;

export function createFleetd({ token, maxPods = 10, maxTtl = 3600, root = tmpdir() } = {}) {
  if (!token || token.length < 16) throw new Error('FLEETD_TOKEN must be set (at least 16 characters)');
  const pods = new Map(); // id -> { dir, timer }
  const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

  const kill = async (id) => {
    const p = pods.get(id);
    if (!p) return false;
    pods.delete(id);
    clearTimeout(p.timer);
    for (const c of p.children) c.kill('SIGKILL');
    await rm(p.dir, { recursive: true, force: true });
    return true;
  };

  function exec(p, command, timeout) {
    return new Promise((resolve) => {
      // Only a short allow-list of variables reaches the child: never FLEETD_TOKEN.
      const env = { PATH: process.env.PATH, HOME: p.dir, TMPDIR: p.dir, LANG: 'C.UTF-8' };
      const c = spawn('sh', ['-c', command], { cwd: p.dir, env, detached: true });
      p.children.add(c);
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      c.stdout.on('data', (d) => stdout.length < OUT_CAP && (stdout += d));
      c.stderr.on('data', (d) => stderr.length < OUT_CAP && (stderr += d));
      const t = setTimeout(() => {
        timedOut = true;
        try { process.kill(-c.pid, 'SIGKILL'); } catch { c.kill('SIGKILL'); }
      }, timeout * 1000);
      c.on('close', (code) => {
        clearTimeout(t);
        p.children.delete(c);
        resolve({ stdout, stderr, exitCode: timedOut ? 124 : code ?? -1 });
      });
      c.on('error', (e) => {
        clearTimeout(t);
        resolve({ stdout, stderr: String(e.message), exitCode: 127 });
      });
    });
  }

  const handler = async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/health') return send(200, { ok: true, pods: pods.size });
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ') || !same(auth.slice(7), token)) return send(401, { error: 'bad token' });
    let body = {};
    if (req.method === 'POST') {
      let raw = '';
      for await (const ch of req) {
        raw += ch;
        if (raw.length > 2_000_000) return send(413, { error: 'body too large' });
      }
      try { body = raw ? JSON.parse(raw) : {}; } catch { return send(400, { error: 'bad JSON' }); }
    }
    const [, kind, id, action] = url.pathname.split('/');
    if (kind !== 'pods') return send(404, { error: 'not found' });
    try {
      if (req.method === 'POST' && !id) {
        if (pods.size >= maxPods) return send(429, { error: `at most ${maxPods} pods at once` });
        const newId = `p${randomBytes(8).toString('hex')}`;
        const dir = await mkdtemp(join(root, 'fleetd-'));
        const ttl = Math.min(Math.max(Number(body.ttl) || 3600, 10), maxTtl);
        const timer = setTimeout(() => kill(newId), ttl * 1000);
        timer.unref?.();
        pods.set(newId, { dir, timer, children: new Set() });
        return send(201, { id: newId, ttl });
      }
      if (req.method === 'POST' && action === 'exec') {
        const p = pods.get(id);
        if (!p) return send(404, { error: 'pod gone' });
        if (typeof body.command !== 'string' || !body.command) return send(400, { error: 'command required' });
        return send(200, await exec(p, body.command, Math.min(Number(body.timeout) || 600, 3600)));
      }
      if (req.method === 'DELETE' && id && !action) return send(200, { ok: true, alreadyGone: !(await kill(id)) });
    } catch (e) {
      return send(500, { error: String(e?.message || e) });
    }
    return send(404, { error: 'not found' });
  };

  const server = createServer(handler);
  server.closeAll = async () => { for (const id of [...pods.keys()]) await kill(id); };
  return server;
}

if (import.meta.main ?? process.argv[1]?.endsWith('fleetd.mjs')) {
  const server = createFleetd({ token: process.env.FLEETD_TOKEN, maxPods: Number(process.env.FLEETD_MAX_PODS) || 10 });
  server.listen(Number(process.env.PORT) || 7860, process.env.HOST || '127.0.0.1', () => console.log(`fleetd listening on ${server.address().port}`));
}
