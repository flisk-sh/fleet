// Three issues found by dogfooding the live site (2026-11-12): pricing rows had no working/untested state,
// the podlytics tab strip hid its last tab at 1280 px, and every page scrolled 3 px sideways on a phone.
import { describe, expect, test } from 'bun:test';
import { handle } from '../src/index.js';
import { PROVIDERS } from '../src/providers/index.js';
import { pricingData } from '../src/pricing.js';

const get = async (path) => (await handle(new Request(`https://fleet.test${path}`), {}, { providers: PROVIDERS })).text();

describe('pricing calculator says what has run for real', () => {
  test('each provider carries its real-run date, or null when untested or blocked', () => {
    const data = pricingData(PROVIDERS);
    for (const row of data) {
      const p = PROVIDERS[row.id];
      expect(row.working).toBe(p.working || null);
    }
    expect(data.filter((r) => r.working).length).toBeGreaterThan(0);
    expect(data.filter((r) => !r.working).length).toBeGreaterThan(0);
  });
  test('the page has a Working only box, ticked by default, and marks untested rows', async () => {
    const html = await get('/pricing');
    expect(html).toContain('<input type="checkbox" id="wk" checked>');
    expect(html).toContain('Working only');
    expect(html).toContain("['untested']"); // untested rows say so when the box is unticked
    expect(html).toContain("(best.p.working?'':' (untested)')"); // the headline never hides an untested winner
  });
});

describe('phone width', () => {
  test('the decorative dots on the top bar are hidden where the frame is full width, so nothing sticks out', async () => {
    for (const path of ['/', '/docs', '/pricing']) {
      const html = await get(path);
      expect(html, path).toContain('@media (max-width:1250px){.top::before,.top::after{display:none}}');
    }
  });
});

describe('podlytics tab strip', () => {
  test('a fade shows when tabs are off to the side, and the strip fits more tabs', async () => {
    const html = await get('/podlytics');
    expect(html).toContain('.tabs.more{');
    expect(html).toMatch(/strip\.classList\.toggle\(["']more["']/);
    expect(html).toContain('@media (max-width:1500px){.tabs{gap:13px');
    expect(html).toContain('id="tabnext"'); // an arrow for mouse users, who cannot scroll the strip sideways
    // on a phone the tabs get their own full-width row, so they are readable and the arrow cannot push the header wider than the screen
    expect(html).toContain('.hd{gap:4px 12px;padding:8px 16px 0;flex-wrap:wrap;height:auto}.tabs{order:3;flex:0 0 100%');
  });
});
