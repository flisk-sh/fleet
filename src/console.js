// The cabinet: same layout as inference.flisk.si's console (sidebar, title with a beta tag, ruled tables), in black and white.
import { CSS, esc } from './page.js';
import { MAX_KEYS, summarize } from './store.js';

const SECTIONS = [
  ['overview', 'Overview'],
  ['pods', 'Pods'],
  ['keys', 'API keys'],
  ['providers', 'Providers'],
  ['docs', 'Docs'],
];

const SIGNUP = {
  boat: 'https://boat.dev',
  isorun: 'https://isorun.ai',
  e2b: 'https://e2b.dev',
  daytona: 'https://app.daytona.io',
};

const CABINET_CSS = `
.cab{display:grid;grid-template-columns:210px minmax(0,1fr);min-height:100vh}
.side{border-right:1.5px solid var(--ink);padding:16px;display:flex;flex-direction:column;gap:4px}
.side .logo{display:block;margin-bottom:18px}
.side a.nav{display:block;padding:8px 10px;text-decoration:none;border:1.5px solid transparent}
.side a.nav:hover{border-color:var(--ink)}
.side a.on{background:var(--ink);color:var(--paper)}
.side .me{margin-top:auto;padding-top:16px;border-top:1.5px solid var(--ink);display:flex;flex-direction:column;gap:8px}
.side form{margin:0}
.main{padding:0 24px 64px;min-width:0}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:16px 0;border-bottom:1.5px solid var(--ink)}
.top h1{font-size:28px;margin:0;max-width:none;display:flex;align-items:center;gap:12px}
.tag{font:12px/1 ui-monospace,Menlo,monospace;border:1.5px solid var(--ink);padding:4px 7px;letter-spacing:.06em}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1.5px solid var(--ink);margin-top:22px}
.metrics>div{padding:16px}
.metrics>div+div{border-left:1.5px solid var(--ink)}
.metrics b{display:block;font-size:30px;font-weight:700;font-family:ui-sans-serif,system-ui,Helvetica,Arial,sans-serif}
.metrics span{color:var(--dim)}
.bar{display:inline-block;height:10px;background:var(--ink);vertical-align:middle}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:22px}
input[type=text]{font:inherit;border:1.5px solid var(--ink);background:var(--paper);color:var(--ink);padding:7px 10px;min-width:240px}
.box{border:1.5px solid var(--ink);padding:14px;margin-top:22px}
.box.inv{background:var(--ink);color:var(--paper)}
.box.inv code{word-break:break-all;font-size:15px}
.err{border:1.5px dashed var(--ink);padding:10px 14px;margin-top:22px}
@media (max-width:760px){.cab{grid-template-columns:1fr}.side{border-right:0;border-bottom:1.5px solid var(--ink);flex-direction:row;flex-wrap:wrap}.side .logo{width:100%;margin-bottom:6px}.side .me{margin-top:0;border-top:0;padding-top:0;flex-direction:row;width:100%}.main{padding:0 16px 48px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metrics>div:nth-child(3){border-left:0}.metrics>div:nth-child(n+3){border-top:1.5px solid var(--ink)}}
`;

const when = (iso) => (iso ? iso.replace('T', ' ').slice(0, 16) + ' UTC' : 'never');
const money = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toFixed(3)}`);

function shell({ login, section, title, body }) {
  const nav = SECTIONS.map(([id, label]) => `<a class="nav${id === section ? ' on' : ''}" href="/console?section=${id}">${esc(label)}</a>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · fleet</title>
<style>${CSS}${CABINET_CSS}</style>
</head>
<body><div class="cab">
<aside class="side">
<a class="logo" href="/">fleet.flisk.si</a>
${nav}
<div class="me"><span>@${esc(login)}</span><form method="post" action="/auth/signout"><button class="b" type="submit">Sign out</button></form></div>
</aside>
<main class="main">
<div class="top"><h1>${esc(title)} <span class="tag">BETA</span></h1><a class="b" href="/">Home</a></div>
${body}
</main>
</div></body></html>`;
}

function overview(pods) {
  const s = summarize(pods);
  const max = Math.max(1, ...s.days.map((d) => d.started));
  const rows = s.days.map((d) => `<tr><td>${d.day}</td><td class="n">${d.started}</td><td><span class="bar" style="width:${Math.round((d.started / max) * 220)}px"></span></td></tr>`).join('');
  return `<div class="metrics">
<div><b>${s.notStopped}</b><span>Not stopped yet</span></div>
<div><b>${s.startedToday}</b><span>Started today</span></div>
<div><b>${s.movedToday}</b><span>Moved to next provider today</span></div>
<div><b>${s.gone}</b><span>Found gone</span></div>
</div>
<p class="note">"Not stopped yet" counts pods you did not stop through fleet. A provider may have stopped some of them already: pods stop by themselves after about an hour.</p>
<h2>Pods started, last 7 days</h2>
<div class="scroll"><table><tr><th>Day</th><th>Pods</th><th></th></tr>${rows}</table></div>
${pods.length ? '' : '<div class="row"><a class="b inv" href="/console?section=keys">Create a key</a><a class="b" href="/console?section=docs">Start your first pod</a></div>'}`;
}

function podsSection(pods) {
  if (!pods.length) {
    return `<div class="box"><b>Start your first pod</b><p class="note">Pods you start with your fleet keys show up here: provider, size, price and when they stopped.</p><div class="row"><a class="b inv" href="/console?section=docs">See how</a></div></div>`;
  }
  const status = (p) => (p.stopped ? `stopped ${when(p.stopped)}` : p.gone ? `gone, seen ${when(p.gone)}` : 'not stopped yet');
  const rows = pods
    .map(
      (p) => `<tr><td>${esc(p.ref)}</td><td>${esc(p.provider)}</td><td>${p.cpu} vCPU · ${p.ram} GB</td><td class="n">${money(p.price)}</td><td>${when(p.started)}</td><td>${status(p)}</td><td>${esc((p.movedFrom || []).join(', ') || '—')}</td></tr>`,
    )
    .join('');
  return `<div class="scroll" style="margin-top:22px"><table><tr><th>Pod</th><th>Provider</th><th>Size</th><th>Per hour</th><th>Started</th><th>Status</th><th>Moved from</th></tr>${rows}</table></div>
<p class="note">Fleet keeps no provider keys, so it can't stop pods for you. Stop one with DELETE /v1/pods/:id and your provider key. Pod ids here are cut short on purpose.</p>`;
}

function keysSection({ keys, newKey, error }) {
  const made = newKey
    ? `<div class="box inv"><p style="margin:0 0 8px">New key. Copy it now: fleet keeps only a hash, so it can't be shown again.</p><code id="k">${esc(newKey)}</code><div class="row" style="margin-top:12px"><button class="b" onclick="navigator.clipboard.writeText(document.getElementById('k').textContent).then(()=>{this.textContent='Copied'})">Copy key</button></div></div>`
    : '';
  const rows = keys
    .map(
      (k) => `<tr><td>${esc(k.name)}</td><td>${esc(k.hint || k.id + '…')}</td><td>${when(k.created)}</td><td>${when(k.lastUsed)}</td><td><form method="post" action="/console/keys/${esc(k.id)}/revoke" onsubmit="return confirm('Revoke ${esc(k.name)}? Calls with this key stop working.')"><button class="b" type="submit">Revoke</button></form></td></tr>`,
    )
    .join('');
  return `${error ? `<div class="err">${esc(error)}</div>` : ''}${made}
<form class="row" method="post" action="/console/keys"><input type="text" name="name" maxlength="40" placeholder="Key name, for example ci" aria-label="Key name"><button class="b inv" type="submit">Create key</button><span class="note" style="margin:0">Up to ${MAX_KEYS} active keys.</span></form>
${keys.length ? `<div class="scroll" style="margin-top:22px"><table><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th></th></tr>${rows}</table></div>` : '<div class="box"><b>Create your first key</b><p class="note">A fleet key goes in the Authorization header of every API and MCP call.</p></div>'}
<p class="note">"Last used" updates at most once an hour.</p>`;
}

function providersSection(prices, providers) {
  const rows = prices
    .map((p) => {
      const meta = providers[p.provider];
      return `<tr><td>${esc(p.label)}</td><td>${esc(meta.keyHeader)}</td><td class="n">${money(p.pricePerHour)}</td><td><a href="${SIGNUP[p.provider] || p.source}">Sign up</a></td><td>${esc(p.note)}</td></tr>`;
    })
    .join('');
  return `<p class="note">Bring your own account at each provider. Send its key in the header below with every call; fleet never stores it. List prices are for 2 vCPU and 4 GB, per hour.</p>
<div class="scroll" style="margin-top:22px"><table><tr><th>Provider</th><th>Header</th><th>Per hour</th><th>Account</th><th>Note</th></tr>${rows}</table></div>`;
}

function docsSection(origin) {
  return `<h2>Start a pod</h2>
<pre style="margin-top:14px">curl -X POST ${esc(origin)}/v1/pods \\
  -H "Authorization: Bearer fleet_..." \\
  -H "X-E2B-Key: ..." -H "X-Daytona-Key: ..." \\
  -d '{"cpu":2,"ram":4}'</pre>
<h2>Run a command, then stop</h2>
<pre style="margin-top:14px">curl -X POST ${esc(origin)}/v1/pods/POD_ID/run \\
  -H "Authorization: Bearer fleet_..." -H "X-E2B-Key: ..." \\
  -d '{"command":"echo hi"}'

curl -X DELETE ${esc(origin)}/v1/pods/POD_ID \\
  -H "Authorization: Bearer fleet_..." -H "X-E2B-Key: ..."</pre>
<h2>MCP for Claude Code or Cursor</h2>
<pre style="margin-top:14px">{ "mcpServers": { "fleet": {
    "type": "http",
    "url": "${esc(origin)}/mcp",
    "headers": { "Authorization": "Bearer fleet_...", "X-E2B-Key": "..." }
} } }</pre>
<p class="note">Tools: pod_create, pod_run, pod_stop. A pod that a provider already stopped answers 410 "this pod is gone".</p>`;
}

export function cabinetPage({ origin, login, section, keys, pods, prices, providers, newKey, error }) {
  const id = SECTIONS.some(([s]) => s === section) ? section : 'overview';
  const title = SECTIONS.find(([s]) => s === id)[1];
  const body =
    id === 'overview'
      ? overview(pods)
      : id === 'pods'
        ? podsSection(pods)
        : id === 'keys'
          ? keysSection({ keys, newKey, error })
          : id === 'providers'
            ? providersSection(prices, providers)
            : docsSection(origin);
  return shell({ login, section: id, title, body });
}
