import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { withSecurityHeaders } from '../src/security-headers.js';
import { fakeD1 } from './d1.js';

const SCHEMA = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const env = () => ({ DB: fakeD1(SCHEMA), PUBLIC_ORIGIN: 'https://fleet.flisk.si', SESSION_SECRET: 's3cret' });
const get = (p) => worker.fetch(new Request(`https://fleet.flisk.si${p}`), env());

// Fleet's own pages already send stricter values (DENY, same-origin, frame-ancestors 'none'); those stay.
const baseline = (res) => {
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  expect(res.headers.get('x-frame-options')).toMatch(/^(DENY|SAMEORIGIN)$/);
  expect(res.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
  expect(res.headers.get('referrer-policy')).toMatch(/^(same-origin|strict-origin-when-cross-origin)$/);
  expect(res.headers.get('permissions-policy')).toBe('camera=(), microphone=(), geolocation=()');
  expect(res.headers.get('content-security-policy')).toMatch(/frame-ancestors ('self'|'none'|https:\/\/analytics\.flisk\.si)/);
};

describe('security headers', () => {
  test('the home page carries them', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    baseline(res);
  });
  test('an HTML 404 carries them', async () => {
    const res = await get('/nope');
    expect(res.status).toBe(404);
    baseline(res);
  });
  test('a JSON API error carries them', async () => {
    const res = await get('/v1/nope');
    expect(res.status).toBe(401);
    baseline(res);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
  test('the static assets file sets them too', () => {
    const headers = readFileSync(new URL('../web/_headers', import.meta.url), 'utf8');
    const block = headers.split(/\n(?=\S)/).find((b) => b.startsWith('/*')) || '';
    for (const name of ['X-Content-Type-Options: nosniff', 'X-Frame-Options: SAMEORIGIN', 'Strict-Transport-Security: max-age=31536000; includeSubDomains', 'Referrer-Policy: strict-origin-when-cross-origin', 'Permissions-Policy: camera=(), microphone=(), geolocation=()', "Content-Security-Policy: frame-ancestors 'self' https://analytics.flisk.si"]) {
      expect(block).toContain(name);
    }
  });
  test('existing values are kept, gaps are filled, none is duplicated', () => {
    const res = withSecurityHeaders(new Response('x', { headers: { 'x-frame-options': 'DENY', 'strict-transport-security': 'max-age=31536000', 'content-security-policy': "default-src 'none'" } }));
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'self' https://analytics.flisk.si");
  });
  test('a CSP that already has frame-ancestors is left alone', () => {
    const csp = "default-src 'none'; frame-ancestors 'none'";
    expect(withSecurityHeaders(new Response('x', { headers: { 'content-security-policy': csp } })).headers.get('content-security-policy')).toBe(csp);
  });
  test('redirects with immutable headers still work', () => {
    const res = withSecurityHeaders(Response.redirect('https://fleet.flisk.si/', 302));
    expect(res.status).toBe(302);
    baseline(res);
  });
});
