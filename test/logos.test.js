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
    for (const id of ['demo']) {
      expect(LOGO_IMAGES[id]).toBeUndefined();
      expect(logoSvg(id, PROVIDERS[id].label)).toContain(`>${initials(PROVIDERS[id].label)}</span>`);
    }
  });

  test('labels are escaped', () => {
    expect(logoSvg('x', '<b>&"')).not.toContain('<b>');
  });
});

describe('provider logos everywhere a provider is named', () => {
  test('providerTag puts the logo before the name', async () => {
    const { providerTag } = await import('../src/logos.js');
    const t = providerTag('daytona', 'Daytona');
    expect(t).toStartWith('<span class="ptag">');
    expect(t).toContain('alt="Daytona logo"');
    expect(t).toEndWith('Daytona</span>');
    expect(providerTag('')).toBe('—');
  });
  test('the race, the home route, the docs headers and Try a pod carry logos', async () => {
    const { demoPage } = await import('../src/demo.js');
    const { handle } = await import('../src/index.js');
    const race = demoPage({ replay: true });
    expect(race).toContain('window.__PTAGS__=');
    expect(race).toContain('Daytona logo');
    const home = await (await handle(new Request('https://fleet.flisk.si/'), {})).text();
    expect(home).toMatch(/<li class="win"[^>]*>[^]*?(alt|aria-label)="[^"]+ logo"/);
    const docs = await (await handle(new Request('https://fleet.flisk.si/docs'), {})).text();
    expect(docs).toMatch(/<span class="ptag">[^]*?logo"[^]*?X-Daytona-Key<\/span>/);
  });
});
