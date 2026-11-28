// The standard Flisk primary button: "Get a free API key", one proof line, utm params, plain-word first screen.
import { describe, expect, test } from 'bun:test';
import { homePage } from '../src/page.js';
import { handle } from '../src/index.js';

const words = (s) => s.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

describe('free-key button on the home hero', () => {
  const html = homePage({ origin: 'https://fleet.flisk.si', prices: [], size: 'small' });
  test('primary button says Get a free API key and carries the utm params', () => {
    const m = /<a class="b inv[^"]*"[^>]* href="([^"]+)">Get a free API key<\/a>/.exec(html);
    expect(m).not.toBeNull();
    expect(m[1]).toContain('/auth/start?next=');
    expect(m[1]).toContain('utm_source=fleet&utm_medium=cta&utm_campaign=free-key');
    expect(html).toContain('No card. Sign in with GitHub.');
  });
  test('h1 and lead stay short and jargon-free', () => {
    const h1 = /<h1>([\s\S]*?)<\/h1>/.exec(html)[1];
    const lead = /<p class="lede">([\s\S]*?)<\/p>/.exec(html)[1];
    expect(words(h1)).toBeLessThanOrEqual(12);
    expect(words(lead)).toBeLessThanOrEqual(32);
    expect(`${h1} ${lead}`).not.toMatch(/\b(pod|endpoint|MCP|inference|orchestration)\b/i);
  });
  test('/auth/start ignores the utm params and keeps next', async () => {
    const env = { DB: {}, SESSION_SECRET: 'x'.repeat(40), GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 's' };
    const href = /<a class="b inv[^"]*"[^>]* href="([^"]+)"/.exec(html)[1];
    const res = await handle(new Request(`https://fleet.test${href}`), env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('github.com/login/oauth/authorize');
    expect(res.headers.getSetCookie().join(';')).toContain('fleet_next=%2Fconsole%3Fsection%3Dkeys');
  });
});

describe('shared bar key button', () => {
  test('fleet opts in to the free-key pill with data-free-key', () => {
    const html = homePage({ origin: 'https://fleet.flisk.si', prices: [], size: 'small' });
    expect(/<script src="https:\/\/flisk\.si\/assets\/bar\.js"[^>]* data-free-key[ >]/.test(html)).toBe(true);
    // Fleet hands out its own keys: the pill must stay on fleet, not go to inference.flisk.si.
    expect(html).toContain('data-key-url="/console?section=keys"');
  });
});
