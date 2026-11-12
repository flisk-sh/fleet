import { describe, expect, test } from 'bun:test';
import { LOGO_IMAGES } from '../src/logo-images.js';
import { initials, logoSvg } from '../src/logos.js';
import { PROVIDERS } from '../src/providers/index.js';

describe('provider logos', () => {
  test('initials from the label', () => {
    expect(initials('Fly Sprites')).toBe('FS');
    expect(initials('Upstash Box')).toBe('UB');
    expect(initials('e2b')).toBe('E2');
    expect(initials('Demo (simulated)')).toBe('DE');
  });

  test('every provider with an official mark embeds it as a PNG or JPEG data URI', () => {
    for (const id of Object.keys(LOGO_IMAGES)) {
      expect(PROVIDERS[id]).toBeDefined();
      expect(LOGO_IMAGES[id]).toMatch(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/);
      expect(logoSvg(id, PROVIDERS[id].label)).toContain(`src="${LOGO_IMAGES[id]}"`);
    }
  });

  test('providers without an official mark get a letter tile', () => {
    for (const id of ['isorun', 'demo']) {
      expect(LOGO_IMAGES[id]).toBeUndefined();
      expect(logoSvg(id, PROVIDERS[id].label)).toContain(`>${initials(PROVIDERS[id].label)}</span>`);
    }
  });

  test('labels are escaped', () => {
    expect(logoSvg('x', '<b>&"')).not.toContain('<b>');
  });
});
