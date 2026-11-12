// Three low issues from the dogfood pass of 2026-11-12: no skip link, link targets under 24 px, a 404 title without the site name.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { handle } from '../src/index.js';
import { PROVIDERS } from '../src/providers/index.js';
import { makeSession } from '../src/session.js';
import { fakeD1 } from './d1.js';

const ORIGIN = 'https://fleet.test';
const get = async (path, env = {}, headers = {}) => (await handle(new Request(`${ORIGIN}${path}`, { headers }), env, { providers: PROVIDERS })).text();
const body = (html) => html.slice(html.indexOf('<body>'));

describe('skip to content', () => {
  const PAGES = ['/', '/docs', '/pricing', '/podlytics', '/nothing-here'];
  for (const path of PAGES) {
    test(`${path}: the first thing in the body is a skip link, and its target exists`, async () => {
      const html = await get(path);
      expect(body(html).replace(/^<body>\s*/, '')).toMatch(/^<a class="skip" href="#main" tabindex="1">Skip to content<\/a>/);
      expect(html.match(/ id="main"/g), 'exactly one #main').toHaveLength(1);
      expect(html.match(/tabindex="[1-9]/g), 'the skip link is the only positive tabindex').toHaveLength(1);
      expect(html).toContain('.skip:focus{top:46px}'); // below the 36 px Flisk bar, which would cover it
    });
  }
  test('the signed-in cabinet has it too', async () => {
    const env = { DB: fakeD1(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')), PUBLIC_ORIGIN: ORIGIN, SESSION_SECRET: 's3cret' };
    const cookie = (await makeSession(env, 'octo')).split(';')[0];
    const html = await get('/console', env, { cookie });
    expect(body(html).replace(/^<body>\s*/, '')).toMatch(/^<a class="skip" href="#main" tabindex="1">/);
    expect(html).toContain('<main class="main" id="main">');
  });
});

describe('touch targets', () => {
  test('footer and bottom-bar links are padded to at least 24 px tall', async () => {
    const html = await get('/');
    expect(html).toContain('.foot-grid a:not(.b):not(.logo){padding:6px 0;margin-bottom:0}');
    expect(html).toContain('.legal a{display:inline-block;padding:7px 0;');
    expect(html).toContain('.top nav>a:not(.spons){padding:9px 0}');
  });
});

describe('error page title', () => {
  test('a 404 says which site it is from', async () => {
    const r = await handle(new Request(`${ORIGIN}/nothing-here`), {}, { providers: PROVIDERS });
    expect(r.status).toBe(404);
    expect(await r.text()).toContain('<title>Page not found · fleet</title>');
  });
});
