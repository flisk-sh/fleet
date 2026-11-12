// Pages. Warm paper and ink in the spirit of particle.ai, with Flisk touches (dark product bar, green >_ mark,
// status pill, copy box, green buttons) from flisk.sh and inference.flisk.si. Fonts are free Google Fonts.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,800&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">';

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.06'/%3E%3C/svg%3E\")";

export const CSS = `
:root{--paper:#f7f5e4;--card:#fffef6;--ink:#171715;--dim:#6b6a5f;--green:#16a34a;--glow:#22c55e;--night:#0a0a0e;--mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;--serif:Fraunces,'Times New Roman',serif;--sans:'Inter Tight',system-ui,-apple-system,'Segoe UI',sans-serif}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;overflow-x:clip}
body{margin:0;background:var(--paper) ${GRAIN};color:var(--ink);font:15px/1.55 var(--sans)}
a{color:inherit}
.m{font-family:var(--mono);text-transform:uppercase;letter-spacing:.06em;font-size:12px}
.mark{display:inline-grid;place-items:center;width:18px;height:18px;background:var(--glow);color:var(--night);font:500 9px/1 var(--mono)}
.frame{max-width:1240px;margin:0 auto;border-left:1px solid var(--ink);border-right:1px solid var(--ink);background:transparent;position:relative}
.top{display:flex;justify-content:space-between;align-items:stretch;border-bottom:1px solid var(--ink);height:46px;position:relative}
.top::before,.top::after{content:'';position:absolute;bottom:-4px;width:7px;height:7px;border-radius:50%;background:var(--ink)}
.top::before{left:-4px}.top::after{right:-4px}
.top nav{display:flex;gap:26px;align-items:center;padding:0 20px}
.top nav a{text-decoration:none}.top nav a:hover{text-decoration:underline}
.top .cta{display:flex;align-items:center;padding:0 22px;background:var(--ink);color:var(--paper);text-decoration:none}
.top .cta:hover{background:var(--green)}
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
.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);border-bottom:1px solid var(--ink);min-height:560px}
.hero .l{padding:36px 48px 44px;display:flex;flex-direction:column;justify-content:space-between;gap:36px}
h1{font:800 clamp(46px,7.2vw,96px)/.95 var(--serif);letter-spacing:-.045em;margin:20px 0 18px}
h1 em{font-style:normal;color:var(--green)}
.lede{font-size:17px;line-height:1.5;max-width:44ch;margin:0 0 6px}
.cmd{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid var(--ink);background:var(--card);padding:8px 8px 8px 14px;font:13px/1.3 var(--mono);max-width:440px;margin-bottom:14px}
.cmd code::before{content:'$ ';color:var(--dim)}
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
.foot-grid a:hover{text-decoration:underline}
.foot-grid a.logo{display:inline-flex;font:800 26px/1 var(--serif);text-transform:none;letter-spacing:-.03em;margin:0}
.foot-grid a.b{display:inline-block;margin:0}
.word{font:800 clamp(120px,34vw,470px)/.84 var(--serif);letter-spacing:-.06em;padding:18px 40px 10px;text-align:center;background:repeating-linear-gradient(180deg,var(--ink) 0 4px,transparent 4px 9px);-webkit-background-clip:text;background-clip:text;color:transparent;user-select:none}
.legal{background:var(--night);color:#c9c9d1;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:10px 48px;font:11px/1.4 var(--mono);text-transform:uppercase;letter-spacing:.06em}
.legal a{text-decoration:none;margin-right:18px}.legal a:hover{color:#fff}
.msg{padding:80px 48px;border-bottom:1px solid var(--ink)}
@media (prefers-reduced-motion:reduce){.route li,.route .foot{animation:none;opacity:1}}
@media (max-width:900px){.hero,.sec.two{grid-template-columns:minmax(0,1fr)}.hero{min-height:0}.art{border-left:0;border-top:1px solid var(--ink);min-height:300px;height:300px}.steps{grid-template-columns:1fr 1fr}.steps>div:nth-child(3){border-left:0}.steps>div:nth-child(n+3){border-top:1px solid var(--ink)}.feat{grid-template-columns:1fr}.feat>div+div{border-left:0;border-top:1px solid var(--ink)}.foot-grid{grid-template-columns:1fr 1fr}.foot-grid>div:first-child{grid-column:1/-1;padding-left:24px}.foot-grid>div:nth-child(2){border-left:0}.foot-grid>div{border-top:1px solid var(--ink);min-height:0}}
@media (max-width:600px){.hero .l,.sec,.msg{padding-left:16px;padding-right:16px}.top nav{gap:14px;padding:0 12px}.top .cta{padding:0 14px}.top nav a.hide{display:none}.steps{grid-template-columns:1fr}.steps>div{border-left:0!important;border-top:1px solid var(--ink)}.steps>div:first-child{border-top:0}.route li{grid-template-columns:18px minmax(0,1fr) 64px}.route li .st{grid-column:2/4;text-align:left}.word{padding:14px 12px 6px}.legal{padding:10px 16px}.foot-grid{grid-template-columns:1fr}.foot-grid>div{border-left:0!important}}
`;

// The shared Flisk product bar (flisk.si/assets/bar.js), the same one every Flisk site loads. It lists the products
// marked bar: true in flisk-sh/flisk.si _data/catalog.yml and marks the current site.
export const FLISK_BAR = '<script src="https://flisk.si/assets/bar.js" defer></script>';

const COPY_JS = `<script>document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',()=>navigator.clipboard.writeText(b.dataset.copy).then(()=>{b.textContent='Copied';setTimeout(()=>{b.textContent='Copy'},1500)})))</script>`;

export const shell = (title, body, extraCss = '') => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="One API for every agent pod. Bring your own sandbox provider keys; fleet starts each pod on the cheapest one and moves on when a provider fails.">
<meta name="theme-color" content="#f7f5e4">
${FONTS}
<style>${CSS}${extraCss}</style>
</head>
<body>
${FLISK_BAR}
<div class="frame">
<div class="top m"><nav><a href="/pricing">Pricing</a><a href="/docs">Docs</a><a href="/docs#mcp">MCP</a><a class="hide" href="https://github.com/flisk-sh/fleet">Source</a></nav><a class="cta" href="/console">Console</a></div>
${body}
<div class="foot-grid">
<div><a class="logo" href="/"><span class="mark">&gt;_</span>fleet</a><div><a class="b inv" href="/console?section=try" style="display:inline-block;margin:0">Try a demo pod</a></div><span class="m" style="color:var(--dim)">Beta · part of Flisk</span></div>
<div><span class="m h">01 / Product</span><a href="/pricing">Pricing</a><a href="/docs">Docs</a><a href="/SKILL.md">SKILL.md</a><a href="/console">Console</a></div>
<div><span class="m h">02 / Flisk</span><a href="https://flisk.sh">Flisk CLI</a><a href="https://inference.flisk.si">Inference</a><a href="https://gardener.flisk.si">Gardener</a><a href="https://flisk.si">All products</a></div>
<div><span class="m h">03 / Source</span><a href="https://github.com/flisk-sh/fleet">GitHub</a><a href="https://github.com/flisk-sh/fleet/issues">Report a bug</a><a href="https://github.com/flisk-sh/fleet#what-fleet-stores">What fleet stores</a></div>
</div>
<div class="word" aria-hidden="true">fleet</div>
<div class="legal"><span><a href="https://github.com/flisk-sh/fleet/blob/main/LICENSE">MIT licence</a><a href="https://github.com/flisk-sh/fleet#what-fleet-stores">What fleet stores</a></span><span>fleet.flisk.si</span></div>
</div>
${COPY_JS}
</body></html>`;

const money = (n) => (n === null || n === undefined ? 'not offered' : `$${n.toFixed(3)}`);

// Hero art: one lane per provider. The cheapest is crossed out, the pod sits in the next lane (green, hatched like
// inference.flisk.si). Built from the real price order.
function laneArt(prices) {
  const lanes = prices.filter((p) => p.pricePerHour !== null).slice(0, 4);
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
  const pod = lanes.length > 1 ? `<g class="pod"><rect x="${(w + w / 2 - 28).toFixed(1)}" y="150" width="56" height="56" fill="#22c55e"/><rect x="${(w + w / 2 - 19).toFixed(1)}" y="159" width="38" height="38" fill="#0b0b0d"/><text x="${(w + w / 2 - 9).toFixed(1)}" y="183" font-family="JetBrains Mono, monospace" font-size="12" fill="#22c55e">&gt;_</text></g>` : '';
  return `<svg class="art" viewBox="0 0 300 400" preserveAspectRatio="none" role="img" aria-labelledby="art-t">
<title id="art-t">One lane per provider: ${esc(lanes[0]?.label || '')} is crossed out, the pod starts on ${esc(lanes[1]?.label || '')}</title>
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
function routeExample(prices) {
  const offered = prices.filter((p) => p.pricePerHour !== null).slice(0, 4);
  const lines = offered
    .map((p, i) => {
      const cls = i === 0 ? 'fail' : i === 1 ? 'win' : 'idle';
      const st = i === 0 ? '401, next' : i === 1 ? 'started' : 'not needed';
      const mark = i === 0 ? '×' : i === 1 ? '●' : '·';
      return `<li class="${cls}" style="animation-delay:${0.35 + i * 0.45}s"><span>${mark}</span><span>${esc(p.label)}</span><span>${money(p.pricePerHour)}</span><span class="st">${st}</span></li>`;
    })
    .join('');
  return `<div class="route" role="img" aria-label="Example route: the cheapest provider answers 401, so fleet starts the pod on the next one">
<div class="head"><span>POST /v1/pods · 2 vCPU · 4 GB</span><span>Example</span></div>
<ol>${lines}</ol>
<div class="foot" style="animation-delay:${0.35 + offered.length * 0.45}s"><span>pod ready · moved 1 provider</span><span>201</span></div>
</div>`;
}

export function homePage({ origin, prices, size }) {
  const offered = prices.filter((p) => p.pricePerHour !== null).length;
  const rows = prices
    .map(
      (p, i) => `<tr><td>${esc(p.label)}</td><td class="n">${money(p.pricePerHour)}</td><td>${p.pricePerHour !== null && i === 0 ? '<span class="first">first</span>' : p.pricePerHour === null ? '' : i + 1}</td><td>${esc(p.note)}</td></tr>`,
    )
    .join('');
  return shell(
    'fleet: one API for every agent pod',
    `<section class="hero">
<div class="l">
<div>
<a class="logo" href="/"><span class="mark">&gt;_</span>fleet</a>
<div style="margin-top:28px"><span class="pill"><i></i>Beta · ${offered} providers</span></div>
<h1>One key.<br>Every <em>agent<br>pod.</em></h1>
<p class="lede">Your agent asks for a Linux machine. Fleet starts it on the cheapest sandbox provider you have an account at, and moves to the next one when a provider fails. Over HTTP or MCP.</p>
</div>
<div>
<div class="cmd"><code>set up ${esc(origin.replace(/^https?:\/\//, ''))}/SKILL.md</code><button type="button" data-copy="set up ${esc(origin)}/SKILL.md">Copy</button></div>
<div class="cta-row"><a class="b inv" href="/console?section=try">Try a demo pod</a><a class="b" href="/docs">Read the docs</a></div>
<p class="note" style="margin-top:12px">Give that line to your agent and it sets itself up. The demo pod needs no provider account.</p>
</div>
</div>
${laneArt(prices)}
</section>

<div class="steps">
<div><span class="m">01 / Sign in</span><b>Get a fleet key</b><span>With GitHub, in the cabinet.</span></div>
<div><span class="m">02 / Connect</span><b>Your own provider</b><span>Paste a boat, Isorun, E2B or Daytona key once.</span></div>
<div><span class="m">03 / Start a pod</span><b>One call</b><span>POST /v1/pods, or pod_create over MCP.</span></div>
<div><span class="m">04 / Run, then stop</span><b>Stdout and exit code</b><span>A pod that's gone answers 410.</span></div>
</div>

<section class="sec two">
<div>
<p class="m label">How a pod is routed</p>
<h2>Cheapest first. Next one when it fails.</h2>
<p class="lede" style="font-size:16px">Fleet sorts the providers you sent a key for by list price for the size you ask for, tries them in that order, and tells you which ones it skipped and why.</p>
<pre style="margin-top:22px">curl -X POST ${esc(origin)}/v1/pods \\
  -H "Authorization: Bearer fleet_..." \\
  -H "X-E2B-Key: ..." -H "X-Daytona-Key: ..." \\
  -d '{"cpu":2,"ram":4}'</pre>
</div>
${routeExample(prices)}
</section>

<div class="feat">
<div><b>Cheapest first</b><span>Sorted by each provider's list price for your size.</span></div>
<div><b>Next one on failure</b><span>An error or no capacity moves the pod to the next provider.</span></div>
<div><b>Connect once</b><span>Paste each provider key one time; fleet keeps it encrypted. Your agent sends only its fleet key.</span></div>
</div>

<section class="sec" id="prices">
<p class="m label">Prices · ${size.cpu} vCPU · ${size.ram} GB · per hour</p>
<h2>Today's route order</h2>
<div class="scroll"><table>
<tr><th>Provider</th><th>List price</th><th>Route</th><th>Note</th></tr>
${rows}
</table></div>
<p class="note">List prices from each provider's own page. You pay the provider directly on your own account; fleet adds nothing.</p>
</section>

<section class="sec" id="api">
<p class="m label">API</p>
<h2>Three calls and a price list</h2>
<div class="scroll"><table>
<tr><th>Call</th><th>Body</th><th>Returns</th></tr>
<tr><td class="n">POST /v1/pods</td><td>cpu, ram, provider?, order?</td><td>id, provider, pricePerHour, failed</td></tr>
<tr><td class="n">POST /v1/pods/:id/run</td><td>command</td><td>stdout, stderr, exitCode</td></tr>
<tr><td class="n">DELETE /v1/pods/:id</td><td></td><td>stopped</td></tr>
<tr><td class="n">GET /v1/prices</td><td></td><td>price table, no key needed</td></tr>
</table></div>
<p class="note">Send your fleet key as a Bearer token, and one header per provider you hold an account at: X-Boat-Key, X-Isorun-Key, X-E2B-Key, X-Daytona-Key.</p>
</section>

<section class="sec two" id="mcp">
<div>
<p class="m label">MCP</p>
<h2>Give it to your agent</h2>
<p class="lede" style="font-size:16px">Add fleet to Claude Code or Cursor. Your agent gets three tools: pod_create, pod_run, pod_stop.</p>
</div>
<pre>{ "mcpServers": { "fleet": {
    "type": "http",
    "url": "${esc(origin)}/mcp",
    "headers": { "Authorization": "Bearer fleet_...", "X-E2B-Key": "..." }
} } }</pre>
</section>`,
  );
}

export function messagePage(title, text) {
  return shell(title, `<section class="msg"><p class="m label">fleet</p><h1 style="font-size:clamp(40px,6vw,72px)">${esc(title)}</h1><p class="lede">${esc(text)}</p><div class="cta-row" style="margin-top:24px"><a class="b" href="/">Back home</a></div></section>`);
}
