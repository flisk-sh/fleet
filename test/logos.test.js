import { describe, expect, test } from 'bun:test';
import { initials, logoSvg } from '../src/logos.js';
import { PROVIDERS } from '../src/providers/index.js';

describe('provider logos', () => {
  test('initials from the label', () => {
    expect(initials('Fly Sprites')).toBe('FS');
    expect(initials('Upstash Box')).toBe('UB');
    expect(initials('e2b')).toBe('E2');
    expect(initials('Demo (simulated)')).toBe('DE');
  });

  test('every provider gets an svg logo with its initials and a unique gradient id', () => {
    const ids = Object.keys(PROVIDERS);
    const gradients = ids.map((id) => logoSvg(id, PROVIDERS[id].label).match(/id="(lg-[a-z0-9]+)"/)[1]);
    expect(new Set(gradients).size).toBe(ids.length);
    for (const id of ids) {
      const svg = logoSvg(id, PROVIDERS[id].label, 34);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain(`>${initials(PROVIDERS[id].label)}</text>`);
    }
  });

  test('labels are escaped', () => {
    expect(logoSvg('x', '<b>&"')).not.toContain('<b>');
  });
});
