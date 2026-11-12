// Renders the public pages to static HTML files, for checking layout in a browser without a server.
//   bun scripts/render-pages.mjs <output folder>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { handle } from '../src/index.js';
import { PROVIDERS } from '../src/providers/index.js';

const out = process.argv[2];
if (!out) throw new Error('usage: bun scripts/render-pages.mjs <output folder>');
mkdirSync(out, { recursive: true });
for (const [name, path] of [['home', '/'], ['pricing', '/pricing'], ['podlytics', '/podlytics'], ['docs', '/docs']]) {
  const html = await (await handle(new Request(`https://fleet.flisk.si${path}`), {}, { providers: PROVIDERS })).text();
  writeFileSync(join(out, `${name}.html`), html);
}
console.log('rendered to', out);
