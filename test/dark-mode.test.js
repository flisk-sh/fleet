// fleet used to be cream-only: on a dark system the page stayed bright and the browser was told it was light-only.
import { describe, expect, test } from 'bun:test';
import { handle } from '../src/index.js';
import { CSS } from '../src/page.js';

const get = async (path) => (await handle(new Request(`https://fleet.test${path}`), {})).text();

const declarations = (block) =>
  Object.fromEntries([...block.matchAll(/([\w-]+):\s*([^;}]+)/g)].map(([, name, value]) => [name, value.trim()]));

const luminance = (hex) => {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
};

const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

describe('fleet dark mode', () => {
  const dark = /@media \(prefers-color-scheme:dark\)\s*\{\s*:root\{([^}]*)\}/.exec(CSS);

  test('the CSS has a prefers-color-scheme dark block redefining paper and ink', () => {
    expect(dark).not.toBeNull();
    const vars = declarations(dark[1]);
    expect(vars['color-scheme']).toBe('dark');
    expect(vars['--paper']).toBe('#161614');
    expect(vars['--card']).toBe('#1f1f1c');
    expect(vars['--ink']).toBe('#f1efe8');
    expect(vars['--dim']).toBe('#a8a598');
    expect(vars['--green']).toBe('#3e9a5e');
  });

  test('dark text is at least 4.5:1 on both the page and a card', () => {
    const vars = declarations(dark[1]);
    for (const bg of [vars['--paper'], vars['--card']]) {
      for (const fg of [vars['--ink'], vars['--dim'], vars['--green']]) {
        expect(contrast(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test('the light theme is unchanged', () => {
    const vars = declarations(/:root\{([^}]*)\}/.exec(CSS)[1]);
    expect(vars['--paper']).toBe('#f7f5e4');
    expect(vars['--card']).toBe('#fffef6');
    expect(vars['--ink']).toBe('#171715');
    expect(vars['--dim']).toBe('#6b6a5f');
    expect(vars['--green']).toBe('#16a34a');
    expect(vars['--glow']).toBe('#22c55e');
    expect(vars['--night']).toBe('#0a0a0e');
  });

  test('the grain texture is white on dark so it stays visible', () => {
    expect(dark[1]).toContain("fill='%23ffffff'");
    expect(CSS).toContain('background:var(--paper) var(--grain)');
  });

  test('paper pages declare both colour schemes and a theme colour for each', async () => {
    for (const path of ['/', '/docs', '/pricing', '/demo']) {
      const html = await get(path);
      expect(html, path).toContain('<meta name="color-scheme" content="light dark">');
      expect(html, path).toContain('<meta name="theme-color" content="#f7f5e4" media="(prefers-color-scheme: light)">');
      expect(html, path).toContain('<meta name="theme-color" content="#161614" media="(prefers-color-scheme: dark)">');
    }
  });
});
