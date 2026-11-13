// A public link for one port of a pod, for every provider that can give one. Fake replies are shaped like each provider's
// API reference or SDK source (named in the adapter); they pin what fleet sends and what it says about how long the link
// lasts. wakesOnVisit is true only when a visit wakes a sleeping computer; expiresAt is set whenever the provider ends it
// at a known time anyway.
import { describe, expect, test } from 'bun:test';
import e2b from '../src/providers/e2b.js';
import daytona from '../src/providers/daytona.js';
import vercel from '../src/providers/vercel.js';
import blaxel, { blaxelEnd } from '../src/providers/blaxel.js';
import morph from '../src/providers/morph.js';
import tensorlake from '../src/providers/tensorlake.js';
import freestyle from '../src/providers/freestyle.js';
import { PROVIDERS as providers } from '../src/providers/index.js';

function fakeFetch(answers) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : undefined });
    const a = answers.shift();
    if (!a) throw new Error(`unexpected call to ${url}`);
    return new Response(JSON.stringify(a.body ?? null), { status: a.status ?? 200 });
  };
  return { calls, fetchImpl };
}
const size = { cpu: 2, ram: 4 };
const wait = async () => {};

test('every provider fleet can share a port through says how long the link lasts', () => {
  const sharing = Object.entries(providers).filter(([, p]) => typeof p.publicUrl === 'function').map(([name]) => name).sort();
  expect(sharing).toEqual(['blaxel', 'daytona', 'e2b', 'freestyle', 'morph', 'tensorlake', 'upstash', 'vercel']);
});

describe('e2b', () => {
  test('a public pod pauses instead of dying, wakes on a visit and answers without a token', async () => {
    const f = fakeFetch([{ status: 201, body: { sandboxID: 'sb1', envdAccessToken: 'tok', domain: null } }]);
    const made = await e2b.create('k', { ...size, public: true }, f);
    expect(made.id).toBe('sb1~tok~~w');
    expect(f.calls[0].body).toMatchObject({ templateID: 'base', timeout: 3600, autoPause: true, autoResume: { enabled: true }, network: { allowPublicTraffic: true } });
    // No API call: every port is at <port>-<id>.<domain>.
    expect(await e2b.publicUrl('k', made.id, 3000, { fetchImpl: () => { throw new Error('no call expected'); } })).toEqual({ url: 'https://3000-sb1.e2b.app', wakesOnVisit: true, expiresAt: null });
  });

  test('a team that cannot pause still gets a public pod; its link ends at the sandbox end time', async () => {
    const f = fakeFetch([{ status: 400, body: { message: 'autoResume is not available' } }, { status: 201, body: { sandboxID: 'sb2', envdAccessToken: 'tok', domain: 'e2b.dev' } }]);
    const made = await e2b.create('k', { ...size, public: true }, f);
    expect(made.id).toBe('sb2~tok~e2b.dev');
    expect(f.calls[1].body).toEqual({ templateID: 'base', timeout: 3600, network: { allowPublicTraffic: true } });
    const g = fakeFetch([{ body: { sandboxID: 'sb2', endAt: '2026-11-14T10:00:00Z' } }]);
    expect(await e2b.publicUrl('k', made.id, 5173, g)).toEqual({ url: 'https://5173-sb2.e2b.dev', wakesOnVisit: false, expiresAt: '2026-11-14T10:00:00.000Z' });
    expect(g.calls[0].url).toBe('https://api.e2b.app/sandboxes/sb2');
  });

  test('a bad key is not retried, and a normal pod stays as it was', async () => {
    await expect(e2b.create('k', { ...size, public: true }, fakeFetch([{ status: 401, body: { message: 'bad key' } }]))).rejects.toThrow('401');
    const f = fakeFetch([{ status: 201, body: { sandboxID: 'sb3', envdAccessToken: 'tok' } }]);
    expect((await e2b.create('k', size, f)).id).toBe('sb3~tok~');
    expect(f.calls[0].body).toEqual({ templateID: 'base', timeout: 3600 });
  });
});

describe('daytona', () => {
  test('makes the sandbox public, reads the preview URL, and the link lasts the idle stop time', async () => {
    const f = fakeFetch([{ body: {} }, { body: { sandboxId: 'd1', url: 'https://3000-d1.proxy.daytona.work', token: 'secret' } }, { body: { id: 'd1', autoStopInterval: 45 } }]);
    const t0 = Date.now();
    const r = await daytona.publicUrl('dk', 'd1', 3000, f);
    expect(f.calls.map((c) => `${c.method} ${c.url}`)).toEqual(['POST https://app.daytona.io/api/sandbox/d1/public/true', 'GET https://app.daytona.io/api/sandbox/d1/ports/3000/preview-url', 'GET https://app.daytona.io/api/sandbox/d1']);
    expect(r.url).toBe('https://3000-d1.proxy.daytona.work');
    expect(r.wakesOnVisit).toBe(false);
    expect(Date.parse(r.expiresAt) - t0).toBeGreaterThanOrEqual(45 * 60_000 - 1000);
    expect(Date.parse(r.expiresAt) - t0).toBeLessThan(46 * 60_000);
    expect(JSON.stringify(r)).not.toContain('secret');
  });
});

describe('vercel', () => {
  test('exposes the port on the named sandbox and the link ends with the session', async () => {
    const f = fakeFetch([{ body: { sandbox: { name: 'fleet-x' }, routes: [{ port: 3000, subdomain: 'sb-abc', url: 'https://sb-abc.vercel.run' }] } }, { body: { session: { startedAt: 1_763_100_000_000, timeout: 2_700_000 }, routes: [] } }]);
    const r = await vercel.publicUrl('tok:prj:team', 'fleet-x.sess1', 3000, f);
    expect(f.calls[0]).toMatchObject({ method: 'PATCH', url: 'https://api.vercel.com/v2/sandboxes/fleet-x?teamId=team&projectId=prj', body: { ports: [3000] } });
    expect(f.calls[1].url).toBe('https://api.vercel.com/v2/sandboxes/sessions/sess1?teamId=team');
    expect(r).toEqual({ url: 'https://sb-abc.vercel.run', wakesOnVisit: false, expiresAt: new Date(1_763_100_000_000 + 2_700_000).toISOString() });
  });
  test('no route for the port is an error, not a made-up link', async () => {
    await expect(vercel.publicUrl('tok:prj', 'fleet-x.s', 3000, fakeFetch([{ body: { routes: [] } }, { body: { routes: [{ port: 8080, url: 'https://other' }] } }]))).rejects.toThrow('no public URL for port 3000');
  });
});

describe('blaxel', () => {
  test('a public preview, and the link ends when runtime.ttl deletes the sandbox', async () => {
    const f = fakeFetch([{ body: { spec: { url: 'https://abc.us-pdx-1.preview.bl.run', public: true } } }, { body: { metadata: { createdAt: '2026-11-14T08:00:00Z' }, spec: { runtime: { ttl: '60m' } } } }]);
    const r = await blaxel.publicUrl('ws:bl_k', 'fleet-abc-1234~https://sbx.bl.run', 3000, f);
    expect(f.calls[0]).toMatchObject({ method: 'POST', url: 'https://api.blaxel.ai/v0/sandboxes/fleet-abc-1234/previews', body: { metadata: { name: 'preview-3000' }, spec: { port: 3000, public: true } } });
    expect(r).toEqual({ url: 'https://abc.us-pdx-1.preview.bl.run', wakesOnVisit: true, expiresAt: '2026-11-14T09:00:00.000Z' });
  });
  test('a preview that already exists is read back; a private one is refused', async () => {
    const f = fakeFetch([{ status: 409, body: { message: 'exists' } }, { body: { spec: { url: 'https://p.bl.run', public: true } } }, { body: { spec: { runtime: { expires: '2026-11-14T09:30:00Z' } } } }]);
    expect((await blaxel.publicUrl('k', 'fleet-a-b~u', 3000, f)).expiresAt).toBe('2026-11-14T09:30:00.000Z');
    expect(f.calls[1].url).toBe('https://api.blaxel.ai/v0/sandboxes/fleet-a-b/previews/preview-3000');
    await expect(blaxel.publicUrl('k', 'fleet-a-b~u', 3000, fakeFetch([{ body: { spec: { url: 'https://p', public: false } } }]))).rejects.toThrow('private');
  });
  test('the end time falls back to the creation time in fleet\'s own name', () => {
    const made = Date.parse('2026-11-14T08:00:00Z');
    expect(blaxelEnd(`fleet-${made.toString(36)}-ab12cd34`, { spec: { runtime: { ttl: '90m' } } })).toBe('2026-11-14T09:30:00.000Z');
    expect(blaxelEnd('other', {})).toBeNull();
  });
});

describe('morph', () => {
  test('a public pod pauses at the end of its ttl, and wake-on-http makes a visit resume it', async () => {
    const f = fakeFetch([{ body: { id: 'snap1' } }, { body: { id: 'm1', status: 'ready' } }]);
    await morph.create('mk', { ...size, public: true }, { ...f, wait });
    expect(f.calls[1].body).toMatchObject({ ttl_action: 'pause' });
    const g = fakeFetch([{ body: { networking: { http_services: [{ name: 'p3000', port: 3000, url: 'https://p3000-m1.http.cloud.morph.so' }] }, ttl: { ttl_action: 'pause', ttl_expire_at: 1_763_103_600 } } }, { body: {} }]);
    expect(await morph.publicUrl('mk', 'm1', 3000, g)).toEqual({ url: 'https://p3000-m1.http.cloud.morph.so', wakesOnVisit: true, expiresAt: null });
    expect(g.calls[0]).toMatchObject({ method: 'POST', url: 'https://cloud.morph.so/api/instance/m1/http', body: { name: 'p3000', port: 3000, auth_mode: 'none' } });
    expect(g.calls[1]).toMatchObject({ url: 'https://cloud.morph.so/api/instance/m1/wake-on', body: { wake_on_http: true, wake_on_ssh: false } });
  });
  test('an instance that stops at the end of its ttl: the link ends then', async () => {
    const f = fakeFetch([{ body: { id: 'snap1' } }, { body: { id: 'm2', status: 'ready' } }]);
    await morph.create('mk', size, { ...f, wait });
    expect(f.calls[1].body).toMatchObject({ ttl_action: 'stop' });
    const g = fakeFetch([{ body: { networking: { http_services: [{ name: 'p3000', url: 'https://u' }] }, ttl: { ttl_action: 'stop', ttl_expire_at: 1_763_103_600 } } }]);
    expect(await morph.publicUrl('mk', 'm2', 3000, g)).toEqual({ url: 'https://u', wakesOnVisit: false, expiresAt: new Date(1_763_103_600_000).toISOString() });
  });
});

describe('tensorlake', () => {
  test('a public pod is named, so it suspends and wakes on a visit instead of ending', async () => {
    const f = fakeFetch([{ body: { sandbox_id: 't1', status: 'running' } }]);
    await tensorlake.create('tk', { ...size, public: true }, { ...f, wait });
    expect(f.calls[0].body.name).toMatch(/^fleet-[0-9a-z]+$/);
    const g = fakeFetch([{ body: { sandbox_id: 't1', name: 'fleet-x', exposed_ports: [8080], ingress_endpoint: 'https://sandbox.tensorlake.ai' } }, { body: {} }]);
    expect(await tensorlake.publicUrl('tk', 't1', 3000, g)).toEqual({ url: 'https://3000-t1.sandbox.tensorlake.ai', wakesOnVisit: true, expiresAt: null });
    expect(g.calls[1]).toMatchObject({ method: 'PATCH', url: 'https://api.tensorlake.ai/sandboxes/t1', body: { exposed_ports: [3000, 8080], allow_unauthenticated_access: true } });
  });
  test('a name refused: an unnamed public pod, whose link lasts until it has been idle for its timeout', async () => {
    const f = fakeFetch([{ status: 422, body: { message: 'name not allowed' } }, { body: { sandbox_id: 't2', status: 'running' } }]);
    await tensorlake.create('tk', { ...size, public: true }, { ...f, wait });
    expect(f.calls[1].body.name).toBeUndefined();
    const t0 = Date.now();
    const r = await tensorlake.publicUrl('tk', 't2', 3000, fakeFetch([{ body: { sandbox_id: 't2', timeout_secs: 1800 } }, { body: {} }]));
    expect(r.wakesOnVisit).toBe(false);
    expect(Date.parse(r.expiresAt) - t0).toBeGreaterThanOrEqual(1800_000 - 1000);
  });
});

describe('freestyle', () => {
  test('a free style.dev name forwards to the port, and the link ends when the VM ttl deletes it', async () => {
    const f = fakeFetch([{ body: {} }, { body: { id: 'vm1', createdAt: '2026-11-14T08:00:00Z', ttlSeconds: 3600 } }]);
    const r = await freestyle.publicUrl('fk', 'vm1', 3000, f);
    const sent = f.calls[0].body;
    expect(f.calls[0]).toMatchObject({ method: 'POST', url: 'https://api.freestyle.sh/v5/tls' });
    expect(sent).toMatchObject({ action: 'allow', protocol: 'http', source: { public: true }, destination: { vmId: 'vm1', port: 3000 } });
    expect(sent.domain).toMatch(/^fleet-[0-9a-f]{12}\.style\.dev$/);
    expect(r).toEqual({ url: `https://${sent.domain}`, wakesOnVisit: false, expiresAt: '2026-11-14T09:00:00.000Z' });
  });
});
