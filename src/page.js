// Pages. Black and white only: monospace text, square 1.5px rules, one inverted block for the main action.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const CSS = `
:root{--ink:#000;--paper:#fff;--dim:#555}
@media (prefers-color-scheme:dark){:root{--ink:#fff;--paper:#000;--dim:#aaa}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
a{color:inherit}
.wrap{max-width:920px;margin:0 auto;padding:0 16px 64px}
.bar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 0;border-bottom:1.5px solid var(--ink)}
.bar nav{display:flex;gap:18px;align-items:center;flex-wrap:wrap}
.bar nav a{text-decoration:none}
.bar nav a:hover{text-decoration:underline}
.logo{font-weight:700;text-decoration:none;letter-spacing:.02em}
.b{display:inline-block;border:1.5px solid var(--ink);padding:7px 14px;text-decoration:none;background:var(--paper);color:var(--ink);font:inherit;cursor:pointer}
.b:hover{background:var(--ink);color:var(--paper)}
.inv{background:var(--ink);color:var(--paper)}
.inv:hover{background:var(--paper);color:var(--ink)}
.hero{padding:56px 0 40px;border-bottom:1.5px solid var(--ink)}
.kicker{color:var(--dim);margin:0 0 14px}
h1{font:700 clamp(34px,6.4vw,64px)/1.02 ui-sans-serif,system-ui,-apple-system,Helvetica,Arial,sans-serif;letter-spacing:-.03em;margin:0 0 18px;max-width:14ch}
.lede{font:17px/1.5 ui-sans-serif,system-ui,-apple-system,Helvetica,Arial,sans-serif;max-width:54ch;margin:0 0 24px}
pre{margin:0;border:1.5px dashed var(--ink);padding:12px 14px;overflow-x:auto;white-space:pre}
.cta{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}
h2{font:700 13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;margin:44px 0 0;padding-bottom:10px;border-bottom:1.5px solid var(--ink)}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:560px}
th,td{text-align:left;padding:9px 12px 9px 0;border-bottom:1px solid var(--ink);vertical-align:top}
th{color:var(--dim);font-weight:400}
td.n{font-variant-numeric:tabular-nums}
.first{background:var(--ink);color:var(--paper);padding:1px 8px}
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-bottom:1.5px solid var(--ink)}
.grid3>div{padding:18px 14px 18px 0}
.grid3>div+div{border-left:1.5px solid var(--ink);padding-left:14px}
.grid3 b{display:block;margin-bottom:6px}
.grid3 span{color:var(--dim)}
@media (max-width:640px){.grid3{grid-template-columns:1fr}.grid3>div+div{border-left:0;border-top:1.5px solid var(--ink);padding-left:0}}
p.note{color:var(--dim);margin:12px 0 0;max-width:70ch}
.key{border:1.5px solid var(--ink);padding:14px;margin:18px 0;word-break:break-all;font-size:15px}
footer{margin-top:56px;padding-top:14px;border-top:1.5px solid var(--ink);color:var(--dim);display:flex;gap:18px;flex-wrap:wrap}
`;

const shell = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="One API for every agent pod. Bring your own sandbox provider keys; fleet starts each pod on the cheapest one and moves on when a provider fails.">
<style>${CSS}</style>
</head>
<body><div class="wrap">
<div class="bar"><a class="logo" href="/">fleet.flisk.si</a><nav><a href="/#prices">Prices</a><a href="/#api">API</a><a href="/#mcp">MCP</a><a class="b" href="/console">Console</a></nav></div>
${body}
<footer><span>fleet · part of <a href="https://flisk.sh">Flisk</a></span><span>Beta</span><span>No provider key is stored</span><a href="https://github.com/flisk-sh/fleet">Source</a></footer>
</div></body></html>`;

const money = (n) => (n === null || n === undefined ? 'not offered' : `$${n.toFixed(3)}`);

export function homePage({ origin, prices, size }) {
  const rows = prices
    .map(
      (p, i) => `<tr><td>${esc(p.label)}</td><td class="n">${money(p.pricePerHour)}</td><td>${p.pricePerHour !== null && i === 0 ? '<span class="first">first</span>' : p.pricePerHour === null ? '' : i + 1}</td><td>${esc(p.note)}</td></tr>`,
    )
    .join('');
  return shell(
    'fleet: one API for every agent pod',
    `<section class="hero">
<p class="kicker">Beta · ${prices.length} providers · bring your own keys</p>
<h1>One API for every agent pod</h1>
<p class="lede">A pod is a Linux machine your agent can run commands in. Fleet starts each pod on the cheapest sandbox provider you have a key for, and moves to the next one when a provider fails.</p>
<pre>curl -X POST ${esc(origin)}/v1/pods \\
  -H "Authorization: Bearer fleet_..." \\
  -H "X-E2B-Key: ..." -H "X-Daytona-Key: ..." \\
  -d '{"cpu":2,"ram":4}'</pre>
<div class="cta"><a class="b inv" href="/console?section=keys">Get a key</a><a class="b" href="#api">Read the API</a></div>
</section>

<div class="grid3">
<div><b>Cheapest first</b><span>Fleet sorts your providers by list price for the size you ask for.</span></div>
<div><b>Next one on failure</b><span>If a provider errors or is out of capacity, the next one starts the pod.</span></div>
<div><b>Nothing stored</b><span>Your provider keys travel with each call. Fleet keeps none of them.</span></div>
</div>

<h2 id="prices">Prices · ${size.cpu} vCPU · ${size.ram} GB · per hour</h2>
<div class="scroll"><table>
<tr><th>Provider</th><th>List price</th><th>Route</th><th>Note</th></tr>
${rows}
</table></div>
<p class="note">List prices from each provider's own page. You pay the provider directly on your own account; fleet adds nothing.</p>

<h2 id="api">API</h2>
<div class="scroll"><table>
<tr><th>Call</th><th>Body</th><th>Returns</th></tr>
<tr><td>POST /v1/pods</td><td>cpu, ram, provider?, order?</td><td>id, provider, pricePerHour, failed</td></tr>
<tr><td>POST /v1/pods/:id/run</td><td>command</td><td>stdout, stderr, exitCode</td></tr>
<tr><td>DELETE /v1/pods/:id</td><td></td><td>stopped</td></tr>
<tr><td>GET /v1/prices</td><td></td><td>price table, no key needed</td></tr>
</table></div>
<p class="note">Send your fleet key as a Bearer token, and one header per provider you hold an account at: X-Boat-Key, X-Isorun-Key, X-E2B-Key, X-Daytona-Key.</p>

<h2 id="mcp">MCP</h2>
<p class="note">Add fleet to Claude Code or Cursor. Your agent gets three tools: pod_create, pod_run, pod_stop.</p>
<pre style="margin-top:14px">{ "mcpServers": { "fleet": {
    "type": "http",
    "url": "${esc(origin)}/mcp",
    "headers": { "Authorization": "Bearer fleet_...", "X-E2B-Key": "..." }
} } }</pre>`,
  );
}

export function messagePage(title, text) {
  return shell(title, `<section class="hero"><h1>${esc(title)}</h1><p class="lede">${esc(text)}</p><div class="cta"><a class="b" href="/">Back home</a></div></section>`);
}
