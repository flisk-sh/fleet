import { expect, test } from 'bun:test';
import { homePage, shell } from '../src/page.js';

test('home page and nav carry a visible sponsor button', () => {
  const html = homePage({ origin: 'https://fleet.flisk.si', prices: [], size: 'small' });
  expect(html).toContain('id="sponsor"');
  expect(html).toContain('Sponsor fleet on GitHub');
  expect(shell('t', '')).toContain('class="spons" href="https://github.com/sponsors/flisk-sh"');
});
