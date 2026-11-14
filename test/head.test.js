import { expect, test } from 'bun:test';
import { handle } from '../src/index.js';

test('HEAD works like GET without a body', async () => {
  for (const path of ['/', '/docs']) {
    const g = await handle(new Request(`https://fleet.test${path}`), {});
    const h = await handle(new Request(`https://fleet.test${path}`, { method: 'HEAD' }), {});
    expect(h.status).toBe(g.status);
    expect(await h.text()).toBe('');
  }
});

test('every shell loads Flisk Analytics in <head>, and the CSP allows its script and beacon', async () => {
  for (const path of ['/', '/docs', '/podlytics']) {
    const res = await handle(new Request(`https://fleet.test${path}`), {});
    const html = await res.text();
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    expect(head).toContain('<script defer data-domain="fleet.flisk.si" src="https://flisk.sh/a.js"></script>');
    const csp = res.headers.get('content-security-policy');
    expect(csp).toMatch(/script-src [^;]*https:\/\/flisk\.sh/);
    expect(csp).toMatch(/connect-src [^;]*https:\/\/analytics\.flisk\.si/);
    expect(csp).toMatch(/connect-src [^;]*https:\/\/flisk\.sh/);
  }
});
