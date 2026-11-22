// Pages. Warm paper and ink in the spirit of particle.ai, with Flisk touches (dark product bar, green >_ mark,
// status pill, copy box, green buttons) from flisk.sh and inference.flisk.si. Fonts are free Google Fonts.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

import { logoSvg } from './logos.js';
import { STR } from './strings.js';
import { headTags, ICON_TAGS, jsonLd, PAGES, SKIP_CSS, SKIP_LINK } from './seo.js';

export const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,800&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">';

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.06'/%3E%3C/svg%3E\")";
// A black noise layer vanishes on a dark page, so dark mode gets the same texture in white at a lower opacity.
const GRAIN_DARK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' fill='%23ffffff' opacity='.05'/%3E%3C/svg%3E\")";

export const CSS = `
.ptag{display:inline-flex;align-items:center;gap:7px;vertical-align:middle;white-space:nowrap}.ptag .plogo{flex-shrink:0}
:root{--paper:#f7f5e4;--card:#fffef6;--ink:#171715;--dim:#6b6a5f;--green:#16a34a;--glow:#22c55e;--night:#0a0a0e;--grain:${GRAIN};--mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;--serif:Fraunces,'Times New Roman',serif;--sans:'Inter Tight',system-ui,-apple-system,'Segoe UI',sans-serif}
@media (prefers-color-scheme:dark){
:root{color-scheme:dark;--paper:#161614;--card:#1f1f1c;--ink:#f1efe8;--dim:#a8a598;--green:#3e9a5e;--glow:#4bb06e;--night:#0a0a0e;--grain:${GRAIN_DARK}}
.st.blocked{background:repeating-linear-gradient(135deg,transparent 0 5px,rgba(241,239,232,.12) 5px 8px)}
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;overflow-x:clip}
body{margin:0;background:var(--paper) var(--grain);color:var(--ink);font:15px/1.55 var(--sans)}
a{color:inherit}
.m{font-family:var(--mono);text-transform:uppercase;letter-spacing:.06em;font-size:12px}
.mark{display:inline-grid;flex-shrink:0;place-items:center;width:18px;height:18px;background:var(--glow);color:var(--night);font:500 9px/1 var(--mono)}
.frame{max-width:1240px;margin:0 auto;border-left:1px solid var(--ink);border-right:1px solid var(--ink);background:transparent;position:relative}
.top{display:flex;align-items:stretch;border-bottom:1px solid var(--ink);height:56px;position:relative}
.top::before,.top::after{content:'';position:absolute;bottom:-4px;width:7px;height:7px;border-radius:50%;background:var(--ink)}
.top::before{left:-4px}.top::after{right:-4px}
@media (max-width:1250px){.top::before,.top::after{display:none}}
.top .brand{display:flex;align-items:center;gap:11px;padding:0 20px;text-decoration:none;border-right:1px solid var(--ink);font:800 23px/1 var(--serif);letter-spacing:-.015em;text-transform:none}
.top .tile{display:grid;place-items:center;width:34px;height:34px;flex-shrink:0}.top .tile .mark{width:34px;height:34px;background:none}
.top .swp{display:flex;align-items:center;padding:0 14px;border-right:1px solid var(--ink)}
.swp span{display:inline-flex;border:1px solid var(--ink);padding:3px;gap:3px;background:var(--card)}
.swp a{display:inline-flex;align-items:center;gap:7px;padding:6px 11px;text-decoration:none;color:var(--dim);transition:background .15s,color .15s}
.swp a i{width:7px;height:7px;border:1px solid currentColor;flex-shrink:0}
.swp a:hover{color:var(--ink);background:var(--paper)}
.swp a.on{background:var(--ink);color:var(--paper)}
.swp a.on i{background:var(--glow);border-color:var(--glow);box-shadow:0 0 0 0 rgba(34,197,94,.7);animation:swpulse 1.8s infinite}
@keyframes swpulse{70%{box-shadow:0 0 0 6px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
@media (prefers-reduced-motion:reduce){.swp a.on i{animation:none}}
.top nav{display:flex;gap:26px;align-items:center;padding:0 20px;margin-left:auto}
.top nav a{position:relative;text-decoration:none;padding:19px 0}
.top nav a::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:3px;background:var(--green);transform:scaleX(0);transform-origin:left;transition:transform .18s}
.top nav a:hover::after,.top nav a[aria-current]::after{transform:scaleX(1)}
.top .cta{display:flex;align-items:center;gap:9px;padding:0 24px;background:var(--green);background-image:repeating-linear-gradient(135deg,transparent 0 7px,rgba(0,0,0,.07) 7px 10px);color:#04130a;font-weight:600;text-decoration:none;border-left:1px solid var(--ink)}
.top .cta i{font-style:normal;display:inline-block;transition:transform .18s}.top .cta:hover i{transform:translateX(4px)}.top .cta:hover{background-color:var(--glow)}
.top nav a.spons{border:1px solid var(--green);color:var(--green);padding:6px 12px;font-weight:600}.top nav a.spons::after{display:none}.top nav a.spons:hover{background:var(--green);color:#fff}
.sponsor{display:flex;justify-content:space-between;align-items:center;gap:20px;flex-wrap:wrap}.sponsor p{margin:0;max-width:760px}.sponsor .b{white-space:nowrap}
.logo{display:inline-flex;align-items:center;gap:9px;font:800 26px/1 var(--serif);letter-spacing:-.03em;text-decoration:none}
.logo .mark{width:26px;height:26px;font-size:12px}
.b{display:inline-block;border:1px solid var(--ink);padding:11px 18px;text-decoration:none;background:transparent;color:var(--ink);font:12px/1 var(--mono);text-transform:uppercase;letter-spacing:.06em;cursor:pointer}
.b:hover{background:var(--ink);color:var(--paper)}
.b.inv{background:var(--green);border-color:var(--green);color:#fff}
.b.inv::after{content:' >>>'}
.b.inv:hover{background:var(--ink);border-color:var(--ink)}
.b:disabled{opacity:.5;cursor:wait}
.pill{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--ink);padding:5px 10px;font:11px/1 var(--mono);text-transform:uppercase;letter-spacing:.06em}
.pill i{width:7px;height:7px;border-radius:50%;background:var(--green)}
.st{display:inline-flex;align-items:center;gap:6px;font:10.5px/1 var(--mono);text-transform:uppercase;letter-spacing:.05em;padding:4px 7px;border:1px solid var(--ink);white-space:nowrap;vertical-align:middle}
.st.ok{background:var(--ink);color:var(--paper)}.st.ok i{width:6px;height:6px;border-radius:50%;background:var(--glow)}
.st.untested{color:var(--dim);border-color:var(--dim);border-style:dashed}
.st.blocked{color:var(--ink);border-style:dashed;background:repeating-linear-gradient(135deg,transparent 0 5px,rgba(23,23,21,.09) 5px 8px)}
.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);border-bottom:1px solid var(--ink);min-height:560px}
.hero .l{padding:36px 48px 44px;display:flex;flex-direction:column;justify-content:space-between;gap:36px}
h1{font:800 clamp(46px,7.2vw,96px)/.95 var(--serif);letter-spacing:-.045em;margin:20px 0 18px}
h1 em{font-style:normal;color:var(--green)}
.lede{font-size:17px;line-height:1.5;max-width:44ch;margin:0 0 6px}
.cmd{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--ink);background:var(--card);padding:8px 8px 8px 14px;font:13px/1.3 var(--mono);max-width:440px;margin-bottom:14px}
.cmd code::before{content:'$ ';color:var(--dim)}
.cmd code{min-width:0;overflow-wrap:anywhere}.cmd button{flex-shrink:0}
.cmd button{font:11px/1 var(--mono);text-transform:uppercase;letter-spacing:.06em;border:1px solid var(--ink);background:transparent;padding:6px 9px;cursor:pointer}
.cta-row{display:flex;gap:10px;flex-wrap:wrap}
.art{border-left:1px solid var(--ink);display:block;width:100%;height:100%;min-height:420px}
.steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid var(--ink)}
.steps>div{padding:22px 24px 26px}
.steps>div+div{border-left:1px solid var(--ink)}
.steps .m{display:block;color:var(--dim);margin-bottom:10px}
.steps b{display:block;font:600 17px/1.3 var(--sans);margin-bottom:4px}
.steps span{color:var(--dim)}
.sec{padding:52px 48px;border-bottom:1px solid var(--ink)}
.sec.two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:40px;align-items:start}
.sec.two>*,.hero>*{min-width:0}
.label{color:var(--dim);margin:0 0 10px}
h2{font:800 clamp(30px,4vw,46px)/1 var(--serif);letter-spacing:-.035em;margin:0 0 18px}
pre{margin:0;border:1px solid var(--ink);background:var(--card);padding:14px 16px;overflow-x:auto;white-space:pre;font:13px/1.55 var(--mono)}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:560px;background:var(--card);border:1px solid var(--ink)}
th,td{text-align:left;padding:11px 14px;border-bottom:1px solid var(--ink);vertical-align:top}
th{font:11px/1.3 var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--dim);font-weight:400}
td.n{font-family:var(--mono);font-variant-numeric:tabular-nums}
.first{background:var(--green);color:#fff;padding:2px 8px;font:11px/1 var(--mono);text-transform:uppercase;letter-spacing:.06em}
p.note{color:var(--dim);margin:14px 0 0;max-width:72ch}
.route{border:1px solid var(--ink);background:var(--card);font:13px/1.4 var(--mono)}
.route .head{display:flex;justify-content:space-between;gap:10px;padding:11px 14px;border-bottom:1px solid var(--ink)}
.route .head span:last-child{color:var(--dim)}
.route ol{list-style:none;margin:0;padding:6px 0}
.route li{display:grid;grid-template-columns:22px minmax(0,1fr) 78px 112px;gap:8px;padding:8px 14px;align-items:center;opacity:0;animation:show .01s forwards}
.route li .st{text-align:right}
.route li.fail{color:var(--dim)}.route li.fail span:nth-child(2){text-decoration:line-through}
.route li.idle{color:var(--dim)}
.route li.win{background:var(--night);color:var(--glow)}
.route .foot{border-top:1px solid var(--ink);padding:11px 14px;display:flex;justify-content:space-between;gap:10px;opacity:0;animation:show .01s forwards}
@keyframes show{to{opacity:1}}
.feat{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-bottom:1px solid var(--ink)}
.feat>div{padding:26px 24px}
.feat>div+div{border-left:1px solid var(--ink)}
.feat b{display:block;font:800 24px/1.1 var(--serif);letter-spacing:-.02em;margin-bottom:8px}
.feat span{color:var(--dim)}
.foot-grid{display:grid;grid-template-columns:minmax(0,1.6fr) repeat(3,minmax(0,1fr));border-bottom:1px solid var(--ink)}
.foot-grid>div{padding:30px 24px 40px;min-height:220px}
.foot-grid>div+div{border-left:1px solid var(--ink)}
.foot-grid>div:first-child{display:flex;flex-direction:column;justify-content:space-between;gap:24px;padding-left:48px}
.foot-grid .m.h{color:var(--dim);display:block;margin-bottom:14px}
.foot-grid a{display:block;text-decoration:none;margin-bottom:9px;font:12px/1.3 var(--mono);text-transform:uppercase;letter-spacing:.05em}
.foot-grid a:not(.b):not(.logo){padding:6px 0;margin-bottom:0}
.foot-grid a:hover{text-decoration:underline}
.foot-grid a.logo{display:inline-flex;font:800 26px/1 var(--serif);text-transform:none;letter-spacing:-.03em;margin:0}
.foot-grid a.b{display:inline-block;margin:0}
.word{font:800 clamp(120px,34vw,470px)/.84 var(--serif);letter-spacing:-.06em;padding:18px 40px 10px;text-align:center;background:repeating-linear-gradient(180deg,var(--ink) 0 4px,transparent 4px 9px);-webkit-background-clip:text;background-clip:text;color:transparent;user-select:none}
.legal{background:var(--night);color:#c9c9d1;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:10px 48px;font:11px/1.4 var(--mono);text-transform:uppercase;letter-spacing:.06em}
.legal a{display:inline-block;padding:7px 0;text-decoration:none;margin-right:18px}.legal a:hover{color:#fff}
.msg{padding:80px 48px;border-bottom:1px solid var(--ink)}
${SKIP_CSS}
@media (prefers-reduced-motion:reduce){.route li,.route .foot{animation:none;opacity:1}}
@media (max-width:900px){.hero,.sec.two{grid-template-columns:minmax(0,1fr)}.hero{min-height:0}.art{border-left:0;border-top:1px solid var(--ink);min-height:300px;height:300px}.steps{grid-template-columns:1fr 1fr}.steps>div:nth-child(3){border-left:0}.steps>div:nth-child(n+3){border-top:1px solid var(--ink)}.feat{grid-template-columns:1fr}.feat>div+div{border-left:0;border-top:1px solid var(--ink)}.foot-grid{grid-template-columns:1fr 1fr}.foot-grid>div:first-child{grid-column:1/-1;padding-left:24px}.foot-grid>div:nth-child(2){border-left:0}.foot-grid>div{border-top:1px solid var(--ink);min-height:0}}
@media (max-width:600px){.top .brand{padding:0 12px;font-size:19px}.top{height:auto;flex-wrap:wrap}.top .brand{height:54px}.top nav{display:none}.top .cta{margin-left:auto;height:54px}.top .swp{order:3;width:100%;border-right:0;border-top:1px solid var(--ink);padding:8px 12px}.swp span{display:flex;width:100%}.swp a{flex:1;justify-content:center;padding:7px 4px}.top .cta{padding:0 14px}.hero .l,.sec,.msg{padding-left:16px;padding-right:16px}.top nav{gap:14px;padding:0 12px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}.top nav a{white-space:nowrap}.top nav a.spons{display:none}.top .cta{padding:0 14px;flex-shrink:0}.top nav a.hide{display:none}.steps{grid-template-columns:1fr}.steps>div{border-left:0!important;border-top:1px solid var(--ink)}.steps>div:first-child{border-top:0}.route li{grid-template-columns:18px minmax(0,1fr) 64px}.route li .st{grid-column:2/4;text-align:left}.word{padding:14px 12px 6px}.legal{padding:10px 16px}.foot-grid{grid-template-columns:1fr}.foot-grid>div{border-left:0!important}}
`;

// The shared Flisk product bar (flisk.si/assets/bar.js), the same one every Flisk site loads. It lists the products
// marked bar: true in flisk-sh/flisk.si _data/catalog.yml and marks the current site.
const FLEET_MARK_INNER = "<rect width=\"64\" height=\"64\" rx=\"14\" fill=\"#0b0b0d\"/><rect x=\"10\" y=\"16\" width=\"30\" height=\"6\" rx=\"3\" fill=\"#fbfaf7\" opacity=\".25\"/><rect x=\"10\" y=\"29\" width=\"44\" height=\"6\" rx=\"3\" fill=\"#fbfaf7\" opacity=\".25\"/><rect x=\"10\" y=\"42\" width=\"20\" height=\"6\" rx=\"3\" fill=\"#fbfaf7\" opacity=\".25\"/><rect x=\"42\" y=\"13\" width=\"12\" height=\"12\" rx=\"3\" fill=\"#16a34a\"/><rect x=\"34\" y=\"26\" width=\"12\" height=\"12\" rx=\"3\" fill=\"#16a34a\" opacity=\".6\"/><rect x=\"26\" y=\"39\" width=\"12\" height=\"12\" rx=\"3\" fill=\"#16a34a\" opacity=\".35\"/>";
export const FLEET_MARK = `<svg class="mark" width="26" height="26" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${FLEET_MARK_INNER}</svg>`;
export const FLISK_BAR = '<script src="https://flisk.si/assets/bar.js" data-product="Fleet" data-icon="fleet" data-accent="#16a34a" data-text="One key and one balance for agent sandboxes." defer></script>';

const COPY_JS = `<script>document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',()=>navigator.clipboard.writeText(b.dataset.copy).then(()=>{b.textContent='Copied';setTimeout(()=>{b.textContent='Copy'},1500)})))</script>`;


// The standard second-level header shared by the Flisk product sites (fleet, host): brand tile + name on the left,
// mono nav on the right, green call-to-action. nav items: [href, label, extra class]. Keep in step with flisk-sh/host src/page.js.
export const topbar = ({ name, mark, nav, cta, sw = [], current = '', lang = 'en' }) =>
  `<div class="top m"><a class="brand" href="${lang === 'nl' ? '/nl' : '/'}" aria-label="${esc(name)} ${STR[lang].homeAria}"><span class="tile">${mark}</span><b>${esc(name)}</b></a>` +
  (sw.length ? `<div class="swp"><span aria-label="${esc(STR[lang].switchAria)}">${sw.map(([href, label, on]) => `<a${on ? ' class="on" aria-current="true"' : ''} href="${esc(href)}"><i></i>${esc(label)}</a>`).join('')}</span></div>` : '') +
  `<nav aria-label="${esc(name)}">${nav.map(([href, label, cls = '']) => `<a${cls ? ` class="${cls}"` : ''} href="${esc(href)}"${href === current ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('')}</nav>` +
  `<a class="cta" href="${esc(cta[0])}">${esc(cta[1])} <i aria-hidden="true">→</i></a></div>`;
// The product switch: fleet, its podlytics page and host (free places to run a fleet pod). Same on all three pages.
export const fleetSwitch = (lang = 'en') => [
  [lang === 'nl' ? '/nl' : '/', 'fleet', true],
  ['/podlytics', 'podlytics'],
  ['https://host.flisk.si', 'host'],
];
export const FLEET_SWITCH = fleetSwitch('en');
export const fleetNav = (lang = 'en') => {
  const s = STR[lang];
  return [
    ['/demo', s.navDemo],
    ['/pricing', s.navPricing],
    ['/docs', s.navDocs],
    ['/docs#mcp', 'MCP'],
    ['https://github.com/flisk-sh/fleet', s.navSource, 'hide'],
    ['https://github.com/sponsors/flisk-sh', s.navSponsor, 'spons'],
  ];
};
export const FLEET_NAV = fleetNav('en');

export const shell = (title, body, extraCss = '', meta = null) => {
const lang = meta?.lang === 'nl' ? 'nl' : 'en';
const s = STR[lang];
const home = lang === 'nl' ? '/nl' : '/';
return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script defer data-domain="fleet.flisk.si" src="https://flisk.sh/a.js"></script>
<title>${esc(title)}</title>
<meta name="description" content="${esc(meta?.description || (meta?.path && PAGES[meta.path]?.description) || PAGES['/'].description)}">
${meta ? headTags(meta) : `${ICON_TAGS}\n<meta name="robots" content="noindex">`}
${meta?.jsonLd || ''}
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f7f5e4" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#161614" media="(prefers-color-scheme: dark)">
${FONTS}
<style>${CSS}${extraCss}</style>
</head>
<body>
${SKIP_LINK.replace('Skip to content', s.skip)}
${FLISK_BAR}
<div class="frame">
${topbar({ name: 'Fleet', mark: FLEET_MARK, current: meta?.path, nav: fleetNav(lang), sw: fleetSwitch(lang), cta: ['/console', 'Console'], lang })}
<main id="main">${body}</main>
<footer>
<div class="foot-grid">
<div><a class="logo" href="${home}">${FLEET_MARK}fleet</a><div><a class="b inv" href="/console?section=try" style="display:inline-block;margin:0">${s.footTry}</a></div><span class="m" style="color:var(--dim)">${s.footBeta}</span><span class="m" style="color:var(--dim);display:block;margin-top:10px">${s.langLabel}: ${lang === 'en' ? '<b>English</b>' : '<a href="/?lang=en" hreflang="en" lang="en" style="display:inline;padding:0">English</a>'} · ${lang === 'nl' ? '<b>Nederlands</b>' : '<a href="/nl" hreflang="nl" lang="nl" style="display:inline;padding:0">Nederlands</a>'}</span></div>
<div><span class="m h">${s.footProduct}</span><a href="/pricing">${s.footPricing}</a><a href="/podlytics">Podlytics</a><a href="/docs">Docs</a><a href="/SKILL.md">SKILL.md</a><a href="/console">Console</a></div>
<div><span class="m h">${s.footFlisk}</span><a href="https://flisk.sh">${s.footCli}</a><a href="https://inference.flisk.si">Inference</a><a href="https://gardener.flisk.si">Gardener</a><a href="https://flisk.si">${s.footAll}</a></div>
<div><span class="m h">${s.footSource}</span><a href="https://github.com/sponsors/flisk-sh">${s.footSponsor}</a><a href="https://github.com/flisk-sh/fleet">${s.footGithub}</a><a href="https://github.com/flisk-sh/fleet/issues">${s.footBug}</a><a href="https://github.com/flisk-sh/fleet#what-fleet-stores">${s.footStores}</a></div>
</div>
<div class="word" aria-hidden="true">fleet</div>
<div class="legal"><span><a href="https://github.com/flisk-sh/fleet/blob/main/LICENSE">${s.legalLicence}</a><a href="https://github.com/sponsors/flisk-sh">${s.legalSponsor}</a><a href="https://github.com/flisk-sh/fleet#what-fleet-stores">${s.footStores}</a></span><span>fleet.flisk.si</span></div>
</div>
</footer>
${COPY_JS.replace("'Copy'", `'${s.copy}'`).replace("'Copied'", `'${s.copied}'`)}
</body></html>`;
};

const money = (n, lang = 'en') => (n === null || n === undefined ? STR[lang].notOffered : `$${n.toFixed(3)}`);

// The four lanes the pictures show: the cheapest provider that is not working fails, a working one starts the pod,
// so the example never claims a start on a provider fleet has not run for real.
export function exampleLanes(prices) {
  const offered = prices.filter((p) => p.pricePerHour !== null);
  const win = offered.find((p) => p.status === 'working');
  if (!win) return offered.slice(0, 4);
  const fail = offered.find((p) => p !== win);
  return [fail, win, ...offered.filter((p) => p !== win && p !== fail)].filter(Boolean).slice(0, 4);
}

// Hero art: one lane per provider. The cheapest is crossed out, the pod sits in the next lane (green, hatched like
// inference.flisk.si). Built from the real price order.
function laneArt(prices, lang = 'en') {
  const lanes = exampleLanes(prices);
  const fills = ['#e2552b', '#0b0b0d', '#efc415', '#2f6be9'];
  const w = 300 / Math.max(1, lanes.length);
  const cols = lanes
    .map((p, i) => {
      const x = (i * w).toFixed(1);
      const hatch = i === 1 ? 'url(#lg)' : 'url(#lx)';
      const op = i === 0 ? 1 : i === 1 ? 1 : 0.3;
      return `<rect x="${x}" y="0" width="${w.toFixed(1)}" height="400" fill="${fills[i]}"/><rect x="${x}" y="0" width="${w.toFixed(1)}" height="400" fill="${hatch}" opacity="${op}"/>`;
    })
    .join('');
  const labels = lanes
    .map((p, i) => `<text x="${(i * w + 9).toFixed(1)}" y="386" font-family="JetBrains Mono, monospace" font-size="10.5" fill="${i === 1 ? '#16a34a' : '#171715'}">${esc(p.label.toUpperCase())}${i === 0 ? ' ×' : i === 1 ? ' ●' : ''}</text>`)
    .join('');
  const pod = lanes.length > 1 ? `<g class="pod"><svg x="${(w + w / 2 - 34).toFixed(1)}" y="144" width="68" height="68" viewBox="0 0 64 64">${FLEET_MARK_INNER}</svg></g>` : '';
  return `<svg class="art" viewBox="0 0 300 400" preserveAspectRatio="none" role="img" aria-labelledby="art-t">
<title id="art-t">${esc(STR[lang].artTitle(lanes[0]?.label || '', lanes[1]?.label || ''))}</title>
<defs>
<pattern id="lx" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="3.5" height="8" fill="#171715" opacity=".55"/></pattern>
<pattern id="lg" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="9" fill="#22c55e"/></pattern>
</defs>
${cols}
<line x1="8" y1="54" x2="${(w - 8).toFixed(1)}" y2="${(54 + w - 16).toFixed(1)}" stroke="#171715" stroke-width="7"/><line x1="${(w - 8).toFixed(1)}" y1="54" x2="8" y2="${(54 + w - 16).toFixed(1)}" stroke="#171715" stroke-width="7"/>
${pod}
<rect x="0" y="362" width="300" height="38" fill="#f7f5e4"/><line x1="0" y1="362" x2="300" y2="362" stroke="#171715" stroke-width="1" vector-effect="non-scaling-stroke"/>
${labels}
</svg>`;
}

// A worked example of one start: the real price order, the cheapest failing so the fallback shows. Labelled as an example.
function routeExample(prices, lang = 'en') {
  const s = STR[lang];
  const offered = exampleLanes(prices);
  const lines = offered
    .map((p, i) => {
      const cls = i === 0 ? 'fail' : i === 1 ? 'win' : 'idle';
      const st = i === 0 ? s.st401 : i === 1 ? s.stStarted : s.stNotNeeded;
      const mark = i === 0 ? '×' : i === 1 ? '●' : '·';
      return `<li class="${cls}" style="animation-delay:${0.35 + i * 0.45}s"><span>${mark}</span><span style="display:inline-flex;align-items:center;gap:8px">${logoSvg(p.provider, p.label, 18)}${esc(p.label)}</span><span>${money(p.pricePerHour, lang)}</span><span class="st">${st}</span></li>`;
    })
    .join('');
  return `<div class="route" role="img" aria-label="${esc(s.exampleAria)}">
<div class="head"><span>POST /v1/pods · 2 vCPU · 4 GB</span><span>${s.exampleTag}</span></div>
<ol>${lines}</ol>
<div class="foot" style="animation-delay:${0.35 + offered.length * 0.45}s"><span>${s.exampleFoot}</span><span>201</span></div>
</div>`;
}

// Three states, see providerState() in route.js. The tooltip says what is missing.
export const statusTag = (p, lang = 'en') => {
  const tip =
    p.status === 'working'
      ? `Run end to end on a real ${p.label} account on ${p.tested || ''}`
      : p.status === 'blocked'
        ? p.blocker || ''
        : 'Built from the provider\'s docs and tested against fake replies. Should work; waiting for a test on a real account.';
  return `<span class="st ${p.status === 'working' ? 'ok' : p.status}" title="${esc(tip)}">${p.status === 'working' ? '<i></i>' : ''}${esc(lang === 'nl' ? { working: 'Werkt', untested: 'Niet getest', blocked: 'Geblokkeerd' }[p.status] || p.stateLabel : p.stateLabel || (p.status === 'working' ? 'Working' : 'Untested'))}</span>`;
};

// "2 working · 5 untested · 4 blocked", leaving out a state nobody is in.
export const stateCounts = (prices, lang = 'en') =>
  ['working', 'untested', 'blocked']
    .map((k) => [k, prices.filter((p) => p.status === k).length])
    .filter(([, n]) => n)
    .map(([k, n]) => `${n} ${STR[lang].states[k]}`)
    .join(' · ');

export function homePage({ origin, prices, size, lang = 'en' }) {
  const s = STR[lang];
  const a = (href) => (text) => `<a href="${href}">${text}</a>`;
  const working = prices.filter((p) => p.status === 'working').length;
  const more = prices.length - working;
  // Providers nobody can start today (down, card, invitation) go last and get no route slot.
  const usable = prices.filter((p) => p.status !== 'blocked');
  const ordered = [...usable, ...prices.filter((p) => p.status === 'blocked')];
  const rows = ordered
    .map((p, i) => {
      const slot = p.status === 'blocked' || p.pricePerHour === null ? '' : i === 0 ? `<span class="first">${s.first}</span>` : i + 1;
      return `<tr><td><span style="display:inline-flex;align-items:center;gap:10px">${logoSvg(p.provider, p.label, 22)}${esc(p.label)}</span></td><td>${statusTag(p, lang)}</td><td class="n">${money(p.pricePerHour, lang)}</td><td>${slot}</td><td>${esc(p.note)}</td></tr>`;
    })
    .join('');
  return shell(
    s.title,
    `<section class="hero">
<div class="l">
<div>
<a class="logo" href="${lang === 'nl' ? '/nl' : '/'}">${FLEET_MARK}fleet</a>
<div style="margin-top:28px"><span class="pill"><i></i>${s.pill(stateCounts(prices, lang))}</span></div>
<h1>${s.h1}</h1>
<p class="lede">${s.lede}</p>
</div>
<div>
<div class="cmd"><code>set up ${esc(origin.replace(/^https?:\/\//, ''))}/SKILL.md</code><button type="button" data-copy="set up ${esc(origin)}/SKILL.md">${s.copy}</button></div>
<div class="cta-row"><a class="b inv" href="/demo">${s.ctaRace}</a><a class="b" href="/console?section=try">${s.ctaTry}</a><a class="b" href="/docs">${s.ctaDocs}</a></div>
<p class="note" style="margin-top:12px">${s.heroNote}</p>
</div>
</div>
${laneArt(prices, lang)}
</section>

<div class="steps">
<div><span class="m">${s.s1k}</span><b>${s.s1b}</b><span>${s.s1t((t) => `<a href="/console?section=keys">${t.replace(/>/g, '&gt;')}</a>`)}</span></div>
<div><span class="m">${s.s2k}</span><b>${s.s2b}</b><span>${s.s2t(a('/console?section=providers'), esc(prices.filter((p) => p.status === 'working').map((p) => p.label).join(lang === 'nl' ? ' of ' : ' or ')), more)}</span></div>
<div><span class="m">${s.s3k}</span><b>${s.s3b}</b><span>${s.s3t}</span></div>
<div><span class="m">${s.s4k}</span><b>${s.s4b}</b><span>${s.s4t}</span></div>
</div>

<section class="sec two">
<div>
<p class="m label">${s.routeLabel}</p>
<h2>${s.routeH2}</h2>
<p class="lede" style="font-size:16px">${s.routeLede}</p>
<pre style="margin-top:22px">curl -X POST ${esc(origin)}/v1/pods \\
  -H "Authorization: Bearer fleet_..." \\
  -H "X-E2B-Key: ..." -H "X-Daytona-Key: ..." \\
  -d '{"cpu":2,"ram":4}'</pre>
</div>
${routeExample(prices, lang)}
</section>

<div class="feat">
<div><b>${s.f1b}</b><span>${s.f1t}</span></div>
<div><b>${s.f2b}</b><span>${s.f2t}</span></div>
<div><b>${s.f3b}</b><span>${s.f3t}</span></div>
</div>

<section class="sec sponsor" id="sponsor">
<p>${s.sponsor}</p>
<a class="b inv" href="https://github.com/sponsors/flisk-sh">${s.sponsorCta}</a>
</section>

<section class="sec" id="prices">
<p class="m label">${s.pricesLabel(size.cpu, size.ram)}</p>
<h2>${s.pricesH2}</h2>
<div class="scroll"><table>
<tr><th>${s.thProvider}</th><th>${s.thStatus}</th><th>${s.thPrice}</th><th>${s.thRoute}</th><th>${s.thNote}</th></tr>
${rows}
</table></div>
<p class="note">${s.pricesNote(a('https://github.com/flisk-sh/fleet/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22'))}</p>
</section>

<section class="sec" id="api">
<p class="m label">${s.apiLabel}</p>
<h2>${s.apiH2}</h2>
<div class="scroll"><table>
<tr><th>${s.thCall}</th><th>${s.thBody}</th><th>${s.thReturns}</th></tr>
<tr><td class="n">POST /v1/pods</td><td>cpu, ram, provider?, order?</td><td>id, provider, pricePerHour, failed</td></tr>
<tr><td class="n">POST /v1/pods/:id/run</td><td>command, cwd?, env?, timeout?</td><td>stdout, stderr, exitCode, timedOut</td></tr>
<tr><td class="n">PUT /v1/pods/:id/files</td><td>path, content, encoding?</td><td>path, bytes</td></tr>
<tr><td class="n">GET /v1/pods/:id/files?path=</td><td></td><td>content, encoding, bytes</td></tr>
<tr><td class="n">GET /v1/pods</td><td></td><td>${s.apiReturnsList}</td></tr>
<tr><td class="n">DELETE /v1/pods/:id</td><td></td><td>${s.apiReturnsStop}</td></tr>
<tr><td class="n">GET /v1/prices</td><td></td><td>${s.apiReturnsPrices}</td></tr>
</table></div>
<p class="note">${s.apiNote(esc(prices.map((p) => p.keyHeader).filter(Boolean).join(', ')))}</p>
</section>

<section class="sec two" id="mcp">
<div>
<p class="m label">${s.mcpLabel}</p>
<h2>${s.mcpH2}</h2>
<p class="lede" style="font-size:16px">${s.mcpLede}</p>
</div>
<pre>{ "mcpServers": { "fleet": {
    "type": "http",
    "url": "${esc(origin)}/mcp",
    "headers": { "Authorization": "Bearer fleet_...", "X-E2B-Key": "..." }
} } }</pre>
</section>`,
    '',
    { path: lang === 'nl' ? '/nl' : '/', lang, title: s.title, description: s.description, jsonLd: jsonLd(lang) },
  );
}

export function messagePage(title, text) {
  return shell(`${title} · fleet`,`<section class="msg"><p class="m label">fleet</p><h1 style="font-size:clamp(40px,6vw,72px)">${esc(title)}</h1><p class="lede">${esc(text)}</p><div class="cta-row" style="margin-top:24px"><a class="b" href="/">Back home</a></div></section>`);
}
