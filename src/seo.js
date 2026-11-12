// What search engines and link previews read: icons, canonical URL, Open Graph and Twitter tags, JSON-LD, sitemap,
// robots.txt and llms.txt. One list of public pages (PAGES) feeds all of them, so a page is added in one place.
import { ASSETS } from './assets.js';

export const SITE = 'https://fleet.flisk.si';

// "Skip to content": the first thing a keyboard or screen-reader user reaches. Hidden until it has focus. Every page's
// main area carries id="main" for it to jump to.
// tabindex="1" makes it the first Tab stop even though the shared Flisk bar (injected by flisk.si/assets/bar.js, about 15
// links) puts itself above it in the page; no other element on these pages has a positive tabindex.
export const SKIP_LINK = '<a class="skip" href="#main" tabindex="1">Skip to content</a>';
export const SKIP_CSS = '.skip{position:absolute;left:12px;top:-64px;z-index:1000;background:#171715;color:#f7f5e4;padding:11px 16px;font:12px/1 ui-monospace,Menlo,monospace;text-transform:uppercase;letter-spacing:.06em;text-decoration:none;border:2px solid #22c55e}.skip:focus{top:46px}';

// Public, indexable pages. Everything else (the cabinet, the API) stays out of search.
export const PAGES = {
  '/': {
    title: 'fleet: one API for every agent pod',
    description: 'One API for every agent pod, over HTTP or MCP. Fleet starts each sandbox on the cheapest provider you have an account at and moves on when one fails.',
  },
  '/docs': {
    title: 'fleet API docs: start, run, files and stop agent pods',
    description: 'The fleet HTTP and MCP API: start a pod, run commands with env, cwd and timeout, write and read files, list pods and stop them. Curl, TypeScript and Python examples.',
  },
  '/pricing': {
    title: 'fleet pricing: what an agent pod costs on each sandbox provider',
    description: 'Compare a month of agent sandboxes across providers, by pods a month, length, size and how many run at once. Fleet itself adds nothing.',
  },
  '/demo': {
    title: 'Four agents, four pods, all at once: a recorded fleet run',
    description: 'Watch four coding agents each get their own sandbox pod on a different provider, write code and tests, fail one, fix it and stop the pods. A real run, played back at its real speed.',
  },
  '/podlytics': {
    title: 'podlytics: sandbox providers compared',
    description: 'Price, start time and success rate of agent sandbox providers, from list prices and fleet\'s own measured calls.',
  },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const ICON_TAGS = `<link rel="icon" href="/favicon.ico" sizes="32x32 48x48">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">`;

// meta: { path, title, description }. A page with no entry in PAGES gets the icons only.
export function headTags({ path, title, description }) {
  const page = PAGES[path];
  if (!page) return ICON_TAGS;
  const url = SITE + (path === '/' ? '/' : path);
  const t = esc(title || page.title);
  const d = esc(description || page.description);
  return `${ICON_TAGS}
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="fleet">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="fleet: one key, every agent pod">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${SITE}/og.png">`;
}

// Structured data for the home page: what fleet is, so a search result can say "software application, free, open source".
export const jsonLd = () =>
  `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'fleet',
    url: SITE + '/',
    description: PAGES['/'].description,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web',
    image: SITE + '/og.png',
    license: 'https://opensource.org/licenses/MIT',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    codeRepository: 'https://github.com/flisk-sh/fleet',
    publisher: { '@type': 'Organization', name: 'Flisk', url: 'https://flisk.si' },
  }).replace(/</g, '\\u003c')}</script>`;

export const sitemapXml = () =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${Object.keys(PAGES)
    .map((p) => `<url><loc>${SITE}${p}</loc></url>`)
    .join('\n')}\n</urlset>\n`;

export const robotsTxt = () =>
  [
    'User-agent: *',
    ...Object.keys(PAGES).map((p) => (p === '/' ? 'Allow: /$' : `Allow: ${p}`)),
    'Allow: /SKILL.md',
    'Allow: /llms.txt',
    'Allow: /sitemap.xml',
    'Allow: /og.png',
    'Allow: /icon.svg',
    'Allow: /favicon.ico',
    'Allow: /apple-touch-icon.png',
    'Disallow: /',
    '',
    `Sitemap: ${SITE}/sitemap.xml`,
    '',
  ].join('\n');

// For AI search and agents: a short plain-text map of the site (https://llmstxt.org).
export const llmsTxt = () => `# fleet

> One API and MCP server for agent sandboxes. Fleet starts each pod (a Linux machine an agent can run commands in) on the cheapest sandbox provider you have an account at, and moves to the next one when a provider fails. You bring your own provider accounts; fleet adds nothing to the price.

- [Docs](${SITE}/docs): the HTTP and MCP API with curl, TypeScript and Python examples
- [SKILL.md](${SITE}/SKILL.md): the same as one file an agent can read to set itself up
- [Pricing](${SITE}/pricing): compare a month of pods across providers
- [Podlytics](${SITE}/podlytics): price, start time and success rate of providers
- [Demo](${SITE}/demo): a recorded run of four agents in four pods at once
- [Source](https://github.com/flisk-sh/fleet): MIT licensed

## Providers

The live list, with each provider's state (working, untested or blocked), is at ${SITE}/v1/prices.
`;

// The embedded images, served by the Worker.
const TYPES = { 'icon.svg': 'image/svg+xml', 'favicon.ico': 'image/x-icon', 'apple-touch-icon.png': 'image/png', 'icon-512.png': 'image/png', 'og.png': 'image/png' };
export function assetResponse(name) {
  const b64 = ASSETS[name];
  if (!b64) return null;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Response(bytes, { headers: { 'content-type': TYPES[name], 'cache-control': 'public, max-age=86400' } });
}
