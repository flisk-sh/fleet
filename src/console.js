// The cabinet: same layout as inference.flisk.si's console (sidebar, title with a beta tag, ruled tables), in black and white.
import { CSS, esc, FONTS, FLISK_BAR } from './page.js';
import { LIMIT_RANGES, MAX_KEYS, podStatus, summarize } from './store.js';

const SECTIONS = [
  ['start', 'Get started'],
  ['overview', 'Overview'],
  ['pods', 'Pods'],
  ['usage', 'Usage'],
  ['keys', 'API keys'],
  ['try', 'Try a pod'],
  ['providers', 'Providers'],
  ['limits', 'Limits'],
  ['docs', 'Docs'],
];

const SIGNUP = {
  boat: 'https://boat.dev',
  isorun: 'https://isorun.ai',
  e2b: 'https://e2b.dev',
  daytona: 'https://app.daytona.io',
};
// Where to make an API key. Dashboard pages where the provider's docs name one, else the provider's own API-key docs.
export const KEY_PAGE = {
  boat: { url: 'https://docs.boat.dev/api-keys', kind: 'docs' },
  isorun: { url: 'https://app.isorun.ai', kind: 'dashboard' },
  e2b: { url: 'https://e2b.dev/docs/api-key', kind: 'docs' },
  daytona: { url: 'https://app.daytona.io/dashboard/keys', kind: 'dashboard' },
};

const CABINET_CSS = `
.cab{display:grid;grid-template-columns:240px minmax(0,1fr);min-height:calc(100vh - 34px);max-width:1440px;margin:0 auto;border-left:1px solid var(--ink);border-right:1px solid var(--ink)}
.side{border-right:1px solid var(--ink);padding:22px 18px;display:flex;flex-direction:column;gap:3px}
.side .logo{margin:0 0 26px}
.side a.nav{display:block;padding:9px 10px;text-decoration:none;font:12px/1 var(--mono);text-transform:uppercase;letter-spacing:.06em;border:1px solid transparent}
.side a.nav:hover{border-color:var(--ink)}
.side a.on{background:var(--ink);color:var(--paper)}
.side .me{margin-top:auto;padding-top:16px;border-top:1px solid var(--ink);display:flex;flex-direction:column;gap:10px;font:12px/1.2 var(--mono)}
.side form{margin:0}
.main{padding:0 40px 72px;min-width:0}
.ctop{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:26px 0 20px;border-bottom:1px solid var(--ink)}
.ctop h1{font:800 clamp(32px,4vw,46px)/1 var(--serif);letter-spacing:-.035em;margin:0;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.main h2{font:12px/1.4 var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--dim);margin:36px 0 12px}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--ink);background:var(--card);margin-top:22px}
.metrics>div{padding:18px}
.metrics>div+div{border-left:1px solid var(--ink)}
.metrics b{display:block;font:800 40px/1 var(--serif);letter-spacing:-.03em;margin-bottom:8px}
.metrics span{color:var(--dim);font-size:13px}
.bar{display:inline-block;height:10px;background:var(--green);vertical-align:middle}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:22px}
input[type=text],input[type=password],input[type=number],select{font:14px/1.2 var(--mono);border:1px solid var(--ink);background:var(--card);color:var(--ink);padding:10px 12px;min-width:240px}
input:disabled{opacity:.55}
.box{border:1px solid var(--ink);background:var(--card);padding:16px;margin-top:22px}
.box.inv{background:var(--night);color:var(--glow);border-color:var(--night)}
.box.inv code{word-break:break-all;font:15px/1.4 var(--mono)}
.box.inv .b{color:var(--glow);border-color:var(--glow)}
.err{border:1px dashed var(--ink);background:var(--card);padding:12px 14px;margin-top:22px}
#err{border:1px dashed var(--ink);padding:10px 12px;background:var(--paper)}
.start{border:1px solid var(--ink);background:var(--card);margin-top:22px}
.start>div{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:14px;align-items:center;padding:16px}
.start>div+div{border-top:1px solid var(--ink)}
.start i{font:500 12px/26px var(--mono);font-style:normal;border:1px solid var(--ink);width:28px;height:28px;text-align:center}
.start .done i{background:var(--green);border-color:var(--green);color:#fff}
.start b{display:block;font-weight:600}
.start span{color:var(--dim)}
.sk{display:block;height:14px;background:var(--ink);opacity:.16;animation:pulse 1.2s ease-in-out infinite}
.sk.big{height:34px;width:60%;margin-bottom:8px}
@keyframes pulse{50%{opacity:.05}}
@media (prefers-reduced-motion:reduce){.sk{animation:none}}
.card{border:1px solid var(--ink);background:var(--card);margin-top:22px}
.chead{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--ink);font-size:17px}
.chead i{font:500 12px/26px var(--mono);font-style:normal;border:1px solid var(--ink);width:28px;height:28px;text-align:center;flex:none}
.card.done .chead i{background:var(--green);border-color:var(--green);color:#fff}
.chead select{font:600 15px/1.2 var(--sans);min-width:0;padding:6px 10px}
.cbody{padding:16px 18px}.cbody p{margin:0 0 10px}
.codebox{display:flex;gap:10px;align-items:flex-start}.codebox pre{flex:1;min-width:0;background:var(--paper)}
.keyline{display:flex;gap:12px;align-items:center;flex-wrap:wrap;border:1px solid var(--ink);background:var(--paper);padding:8px 10px}.keyline code{font:14px var(--mono);flex:1}
.ex{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.exb{text-align:left;font:14px/1.45 var(--sans);border:1px solid var(--ink);background:var(--paper);padding:12px;cursor:pointer;display:flex;flex-direction:column;gap:8px}
.exb:hover{background:var(--card);box-shadow:inset 0 -3px 0 var(--green)}.exb .m{color:var(--dim)}
.search input{width:100%;margin-top:22px;padding:13px 14px;font:15px var(--sans)}
.catalog{display:grid;grid-template-columns:220px minmax(0,1fr);gap:22px;margin-top:18px;align-items:start}
.filters{display:flex;flex-direction:column;border:1px solid var(--ink);background:var(--card)}
.filters button{display:flex;justify-content:space-between;gap:8px;font:14px var(--sans);text-align:left;background:transparent;border:0;border-bottom:1px solid var(--ink);padding:10px 12px;cursor:pointer}
.filters button:last-child{border-bottom:0}.filters button.on{background:var(--ink);color:var(--paper)}.filters .c{font:12px var(--mono)}
.pgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.pcard{border:1px solid var(--ink);background:var(--card);padding:16px;display:flex;flex-direction:column;gap:10px}
.pcard[hidden]{display:none}
.ph{display:flex;align-items:center;gap:10px}.ph b{font:800 22px/1 var(--serif);letter-spacing:-.02em;flex:1}
.pmark{width:34px;height:34px;display:grid;place-items:center;background:var(--night);color:var(--glow);font:500 15px var(--mono)}
.pp{font:500 18px var(--mono)}.pp small{font-size:12px;color:var(--dim)}
.pcard p{margin:0;color:var(--dim)}
.pcard dl{display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin:0;border-top:1px solid var(--ink);padding-top:10px}
.pcard dt{font:10.5px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--dim)}.pcard dd{margin:2px 0 0;font-size:13.5px}
.pf{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;border-top:1px solid var(--ink);padding-top:10px;margin-top:auto}
.badge{font:10.5px/1 var(--mono);text-transform:uppercase;letter-spacing:.05em;border:1px solid var(--green);color:var(--green);padding:4px 6px;margin:0 6px 6px 0;display:inline-block}
.links a{font:12px var(--mono);text-transform:uppercase;margin-left:12px}
.b.on{background:var(--ink);color:var(--paper)}
.st{font:12px var(--mono);border:1px solid;padding:2px 6px}.st.ok{color:var(--green)}.st.bad{color:#b42318}
.limgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 14px}
.limrow{display:flex;align-items:baseline;gap:10px}.limrow input{font:800 40px/1 var(--serif);width:150px;min-width:0;padding:6px 10px;background:var(--paper)}.limrow span{color:var(--dim)}
@media (max-width:820px){.cab{grid-template-columns:1fr}.side{border-right:0;border-bottom:1px solid var(--ink);flex-direction:row;flex-wrap:wrap;padding:14px}.side .logo{width:100%;margin-bottom:8px}.side .me{margin-top:0;border-top:0;padding-top:4px;flex-direction:row;align-items:center;width:100%}.main{padding:0 16px 48px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metrics>div:nth-child(3){border-left:0}.metrics>div:nth-child(n+3){border-top:1px solid var(--ink)}input[type=text],input[type=password],select{min-width:0;width:100%}.ex,.pgrid,.limgrid{grid-template-columns:minmax(0,1fr)}.catalog{grid-template-columns:minmax(0,1fr)}.filters{flex-direction:row;flex-wrap:wrap}.filters button{border-bottom:0;border-right:1px solid var(--ink)}.codebox{flex-direction:column;align-items:stretch}.codebox pre{width:100%}}
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
<meta name="theme-color" content="#f7f5e4">
${FONTS}
<style>${CSS}${CABINET_CSS}</style>
</head>
<body>${FLISK_BAR}<div class="cab">
<aside class="side">
<a class="logo" href="/"><span class="mark">&gt;_</span>fleet</a>
${nav}
<div class="me"><span>@${esc(login)}</span><form method="post" action="/auth/signout"><button class="b" type="submit">Sign out</button></form></div>
</aside>
<main class="main">
<div class="ctop"><h1>${esc(title)} <span class="pill"><i></i>Beta</span></h1><a class="b" href="/">Home</a></div>
${body}
</main>
</div></body></html>`;
}

// Get started, after Monid's: set up your agent (picker), your key, then copy-ready things to ask it. Steps tick off
// when fleet can see them done.
function startSection(origin, keys, pods) {
  const real = pods.some((p) => !p.failedStart && p.provider !== 'demo');
  const any = pods.some((p) => !p.failedStart);
  const agents = [
    ['claude', 'Claude Code', `claude mcp add --transport http fleet ${origin}/mcp \\\n  --header "Authorization: Bearer fleet_..." \\\n  --header "X-Daytona-Key: ..."`],
    ['cursor', 'Cursor', `// .cursor/mcp.json\n{ "mcpServers": { "fleet": {\n    "url": "${origin}/mcp",\n    "headers": { "Authorization": "Bearer fleet_...", "X-Daytona-Key": "..." }\n} } }`],
    ['any', 'Any agent', `set up ${origin}/SKILL.md`],
  ];
  const examples = [
    'Start a fleet pod, clone this repo, run its tests, then stop the pod and tell me what failed.',
    'Run this Python script in a fleet pod with 2 vCPU and 4 GB, show me the output, then stop the pod.',
    'Start one fleet pod on each provider I have a key for, time "npm install" in each, and stop them all.',
  ];
  const step = (n, done, title, inner) =>
    `<div class="card${done ? ' done' : ''}"><div class="chead"><i>${done ? '✓' : n}</i><b>${title}</b></div><div class="cbody">${inner}</div></div>`;
  const latest = keys[0];
  return `<p class="lede" style="margin:22px 0 0">One key. Every pod your agent needs.</p>
${step(
  1,
  false,
  `Set up your <select id="agent" aria-label="Your agent">${agents.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join('')}</select>`,
  `${agents.map(([id, , code], i) => `<div data-agent="${id}"${i ? ' hidden' : ''}><p>${id === 'any' ? 'In your agent’s chat, send:' : 'Run this once, with your own keys in place of the dots:'}</p><div class="codebox"><pre>${esc(code)}</pre><button type="button" class="b" data-copy="${esc(code)}">Copy</button></div></div>`).join('')}`,
)}
${step(
  2,
  keys.length > 0,
  'Your fleet key',
  keys.length
    ? `<p>Give this key to your agent. It goes in the Authorization header.</p><div class="keyline"><span class="m">${esc(latest.name)}</span><code>${esc(latest.hint || latest.id + '…')}</code><a class="b" href="/console?section=keys">Manage</a></div>`
    : `<p>You don't have a key yet.</p><a class="b inv" href="/console?section=keys">Create key</a>`,
)}
${step(
  3,
  real,
  'Bring a provider key',
  `<p>Fleet starts pods on your own provider account. ${real ? 'You have started a real pod.' : any ? 'You tried the demo pod; now start a real one.' : 'No account yet? Try the demo pod first.'}</p><div class="row" style="margin-top:12px"><a class="b${real ? '' : ' inv'}" href="/console?section=providers">Pick a provider</a><a class="b" href="/console?section=try">Try a pod</a></div>`,
)}
${step(
  4,
  false,
  'Try it out',
  `<p>Fleet is ready with your agent. Copy any of these and send it to your agent.</p><div class="ex">${examples.map((e) => `<button type="button" class="exb" data-copy="${esc(e)}"><span class="m">Copy</span>${esc(e)}</button>`).join('')}</div>`,
)}
<script>
(()=>{const a=document.getElementById('agent');a.addEventListener('change',()=>document.querySelectorAll('[data-agent]').forEach(d=>d.hidden=d.dataset.agent!==a.value));
document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',()=>navigator.clipboard.writeText(b.dataset.copy).then(()=>{const t=b.querySelector('.m')||b;const was=t.textContent;t.textContent='Copied';setTimeout(()=>t.textContent=was,1500)})))})();
</script>`;
}

function overview(pods, keys = []) {
  const s = summarize(pods);
  const max = Math.max(1, ...s.days.map((d) => d.started + d.failed));
  const rows = s.days
    .map(
      (d) =>
        `<tr><td>${d.day}</td><td class="n">${d.started}</td><td class="n">${d.failed}</td><td>${d.started ? `<span class="bar" style="width:${Math.round((d.started / max) * 220)}px"></span>` : ''}${d.failed ? `<span class="bar" style="width:${Math.max(4, Math.round((d.failed / max) * 220))}px;background:transparent;border:1.5px solid var(--ink);box-sizing:border-box"></span>` : ''}</td></tr>`,
    )
    .join('');
  return `<div class="metrics">
<div><b>${s.running}</b><span>Running, under 1 hour</span></div>
<div><b>${s.startedToday}</b><span>Started today</span></div>
<div><b>${s.movedToday}</b><span>Moved to next provider today</span></div>
<div><b>${s.failedToday}</b><span>Failed starts today</span></div>
</div>
<p class="note">Fleet sees a pod stop only when you stop it through fleet. A pod older than an hour that you didn't stop counts as likely stopped: providers stop pods by themselves after about an hour.${s.failedToday ? ' <a href="/console?section=pods">See why starts failed</a>.' : ''}</p>
<h2>Pods, last 7 days</h2>
<div class="scroll"><table><tr><th>Day</th><th>Started</th><th>Failed</th><th></th></tr>${rows}</table></div>
<p class="note">Black bar: started. Outlined bar: failed starts.</p>
`;
}

function podsSection(pods) {
  if (!pods.length) {
    return `<div class="box"><b>Start your first pod</b><p class="note">Pods you start with your fleet keys show up here: provider, size, price and when they stopped.</p><div class="row"><a class="b inv" href="/console?section=docs">See how</a></div></div>`;
  }
  const status = (p) => {
    const st = podStatus(p);
    if (st === 'failed') return `start failed: ${p.failedStart.map((f) => `${f.provider}: ${f.error}`).join('; ')}`;
    if (st === 'stopped') return `stopped ${when(p.stopped)}`;
    if (st === 'gone') return `gone, seen ${when(p.gone)}`;
    if (st === 'running') return 'running';
    return 'likely stopped by the provider (over 1 hour)';
  };
  const rows = pods
    .map(
      (p) => `<tr><td>${esc(p.ref || '—')}</td><td>${esc(p.provider || '—')}</td><td>${p.cpu} vCPU · ${p.ram} GB</td><td class="n">${money(p.price)}</td><td>${when(p.started)}</td><td>${status(p)}</td><td>${esc((p.movedFrom || []).join(', ') || '—')}</td></tr>`,
    )
    .join('');
  return `<div class="scroll" style="margin-top:22px"><table><tr><th>Pod</th><th>Provider</th><th>Size</th><th>Per hour</th><th>Started</th><th>Status</th><th>Moved from</th></tr>${rows}</table></div>
<p class="note">A failed start lists each provider fleet tried and what it answered; a 401 means that provider's key is wrong. Fleet keeps no provider keys, so it can't stop pods for you. Stop one with DELETE /v1/pods/:id and your provider key. Pod ids here are cut short on purpose.</p>`;
}

function keysSection({ keys, newKey, error }) {
  const made = newKey
    ? `<div class="box inv"><p style="margin:0 0 8px">New key. Copy it now: fleet keeps only a hash, so it can't be shown again.</p><code id="k">${esc(newKey)}</code><div class="row" style="margin-top:12px"><button class="b" onclick="navigator.clipboard.writeText(document.getElementById('k').textContent).then(()=>{this.textContent='Copied'})">Copy key</button></div></div>`
    : '';
  const rows = keys
    .map(
      (k) => `<tr><td>${esc(k.name)}</td><td>${esc(k.hint || k.id + '…')}</td><td>${k.created ? when(k.created) : 'before the cabinet'}</td><td>${when(k.lastUsed)}</td><td><form method="post" action="/console/keys/${esc(k.id)}/revoke" onsubmit="return confirm('Revoke ${esc(k.name)}? Calls with this key stop working.')"><button class="b" type="submit">Revoke</button></form></td></tr>`,
    )
    .join('');
  return `${error ? `<div class="err">${esc(error)}</div>` : ''}${made}
<form class="row" method="post" action="/console/keys"><input type="text" name="name" maxlength="40" placeholder="Key name, for example ci" aria-label="Key name"><button class="b inv" type="submit">Create key</button><span class="note" style="margin:0">Up to ${MAX_KEYS} active keys.</span></form>
${keys.length ? `<div class="scroll" style="margin-top:22px"><table><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th></th></tr>${rows}</table></div>` : '<div class="box"><b>Create your first key</b><p class="note">A fleet key goes in the Authorization header of every API and MCP call.</p></div>'}
<p class="note">"Last used" updates at most once an hour.</p>`;
}

// Provider catalog, after Monid's tools page: search, filters with counts, one card per provider with badges.
function providersSection(prices, providers) {
  const list = prices.map((p) => ({ ...p, meta: providers[p.provider], facts: providers[p.provider].facts || {} }));
  const FILTERS = [
    ['all', 'All', () => true],
    ['nocard', 'No card needed', (p) => p.facts.card === false],
    ['credit', 'Free credit', (p) => /credit/i.test(p.facts.credit || '')],
    ['nomin', 'No monthly minimum', (p) => !p.facts.minimum],
    ['eu', 'Runs in the EU', (p) => (p.facts.regions || []).includes('EU')],
    ['us', 'Runs in the US', (p) => (p.facts.regions || []).includes('US')],
  ];
  const tags = (p) => FILTERS.filter(([id, , f]) => id !== 'all' && f(p)).map(([id]) => id).join(' ');
  const cards = list
    .map((p) => {
      const kp = KEY_PAGE[p.provider];
      return `<article class="pcard" data-tags="all ${tags(p)}" data-text="${esc(`${p.label} ${p.facts.blurb || ''} ${(p.facts.badges || []).join(' ')}`.toLowerCase())}">
<div class="ph"><span class="pmark">${esc(p.label.slice(0, 1).toUpperCase())}</span><b>${esc(p.label)}</b><span class="pp">${money(p.pricePerHour)}<small>/h</small></span></div>
<p>${esc(p.facts.blurb || p.note)}</p>
<dl><div><dt>Credit</dt><dd>${esc(p.facts.credit || '—')}</dd></div><div><dt>Biggest pod</dt><dd>${p.facts.maxCpu ? `${p.facts.maxCpu} vCPU · ${p.facts.maxRam} GB` : '—'}</dd></div><div><dt>Regions</dt><dd>${esc((p.facts.regions || []).join(', ') || '—')}</dd></div><div><dt>Header</dt><dd class="n">${esc(p.meta.keyHeader)}</dd></div></dl>
<div class="pf"><span class="badges">${(p.facts.badges || []).map((b) => `<span class="badge">${esc(b)}</span>`).join('')}</span><span class="links"><a href="${SIGNUP[p.provider] || p.source}" target="_blank" rel="noopener">Sign up</a>${kp ? `<a href="${kp.url}" target="_blank" rel="noopener">Get a key</a>` : ''}</span></div>
</article>`;
    })
    .join('');
  return `<div class="search"><input type="text" id="q" placeholder="Search providers (for example EU, no card, GPU)" aria-label="Search providers"></div>
<div class="catalog">
<nav class="filters" aria-label="Filter providers">${FILTERS.map(([id, label, f], i) => `<button type="button" data-f="${id}"${i ? '' : ' class="on"'}><span>${esc(label)}</span><span class="c">${list.filter(f).length}</span></button>`).join('')}</nav>
<div class="pgrid" id="pgrid">${cards}<p class="note" id="none" hidden>No provider matches. Clear the search.</p></div>
</div>
<p class="note">List prices for 2 vCPU and 4 GB, per hour, from each provider's own page. Bring your own account: no callback comes back from a provider, so make a key there and send it in the header, or paste it in <a href="/console?section=try">Try a pod</a>. Compare a whole month on the <a href="/pricing">pricing page</a>.</p>
<script>
(()=>{let f='all';const q=document.getElementById('q');const cards=[...document.querySelectorAll('.pcard')];
const draw=()=>{const t=q.value.trim().toLowerCase();let n=0;cards.forEach(c=>{const ok=c.dataset.tags.split(' ').includes(f)&&(!t||c.dataset.text.includes(t));c.hidden=!ok;n+=ok});document.getElementById('none').hidden=n>0};
document.querySelectorAll('[data-f]').forEach(b=>b.addEventListener('click',()=>{f=b.dataset.f;document.querySelectorAll('[data-f]').forEach(x=>x.classList.toggle('on',x===b));draw()}));q.addEventListener('input',draw)})();
</script>`;
}

function trySection(prices, providers) {
  const demo = Object.entries(providers).find(([, p]) => p.demo);
  const opts =
    (demo ? `<option value="${esc(demo[0])}">Demo · simulated, no account needed</option>` : '') +
    prices
      .filter((p) => p.pricePerHour !== null)
      .map((p) => `<option value="${esc(p.provider)}">${esc(p.label)} · ${money(p.pricePerHour)} an hour</option>`)
      .join('');
  const pages = JSON.stringify(Object.fromEntries(Object.entries(KEY_PAGE).map(([k, v]) => [k, v.url])));
  return `<p class="note">Pick Demo to see the whole flow with no account: a simulated pod that fleet runs itself. Pick a provider to start one real pod on your own account, run one command, and stop it. Fleet times each step. Your provider key goes to the provider for this one call and is not stored; tick the box to keep it in this browser only.</p>
<form id="try" class="box" autocomplete="off">
<div class="row" style="margin-top:0"><label>Provider <select id="prov">${opts}</select></label><a id="getkey" class="note" style="margin:0" target="_blank" rel="noopener" href="#">Get a key</a></div>
<div class="row"><input type="password" id="pkey" placeholder="Your provider API key" aria-label="Provider API key" style="flex:1"></div>
<div class="row"><input type="text" id="cmd" value="uname -sr; nproc; free -m | head -2" aria-label="Command" style="flex:1"></div>
<div class="row"><label><input type="checkbox" id="remember"> Remember this key in this browser</label><button class="b inv" type="submit" id="go">Start pod</button></div>
<p id="err" class="note" style="display:none"></p>
</form>
<div id="wait" style="display:none" aria-live="polite">
<h2 id="waitt">Starting a pod</h2>
<div class="metrics"><div><span class="sk big"></span><span>Start</span></div><div><span class="sk big"></span><span>Run</span></div><div><span class="sk big"></span><span>Stop</span></div><div><span class="sk big"></span><span>Total</span></div></div>
<div class="box"><span class="sk" style="width:70%"></span><span class="sk" style="width:45%;margin-top:10px"></span><span class="sk" style="width:58%;margin-top:10px"></span></div>
<p class="note">Real providers can take up to a minute to start a pod. Fleet stops it right after the command.</p>
</div>
<div id="out" style="display:none">
<h2>Result</h2>
<div class="metrics"><div><b id="tc">—</b><span>Start</span></div><div><b id="tr">—</b><span>Run</span></div><div><b id="ts">—</b><span>Stop</span></div><div><b id="tt">—</b><span>Total</span></div></div>
<pre id="so" style="margin-top:14px;white-space:pre-wrap"></pre>
<p class="note" id="meta"></p>
</div>
<script>
(()=>{const P=${pages};const $=(i)=>document.getElementById(i);
const store=(()=>{try{return window.localStorage}catch{return null}})();
const load=()=>{const v=$('prov').value;const k=store&&store.getItem('fleet_try_'+v);$('pkey').value=k||'';$('remember').checked=!!k;$('getkey').href=P[v]||'#';$('getkey').style.display=P[v]?'':'none';$('pkey').disabled=v==='demo';$('pkey').placeholder=v==='demo'?'No key needed for the demo pod':'Your provider API key'};
$('prov').addEventListener('change',load);load();
const s=(ms)=>ms==null?'—':(ms/1000).toFixed(1)+' s';
$('try').addEventListener('submit',async(e)=>{e.preventDefault();const key=$('pkey').value.trim();const err=$('err');err.style.display='none';
const isDemo=$('prov').value==='demo';$('pkey').disabled=isDemo;
if(!key&&!isDemo){err.textContent='Paste your provider API key first.';err.style.display='block';$('pkey').focus();return}
try{if(store){if($('remember').checked)store.setItem('fleet_try_'+$('prov').value,key);else store.removeItem('fleet_try_'+$('prov').value)}}catch{}
$('go').textContent='Starting…';$('go').disabled=true;$('out').style.display='none';$('waitt').textContent='Starting a pod on '+$('prov').selectedOptions[0].textContent.split(' · ')[0];$('wait').style.display='block';
try{const r=await fetch('/console/try',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:$('prov').value,key,command:$('cmd').value})});
const d=await r.json();
if(!r.ok){err.textContent=d.error+(d.failed?' — '+d.failed.map(f=>f.provider+': '+f.error).join('; '):'')+(d.createMs!=null?' (after '+s(d.createMs)+')':'');err.style.display='block'}
else{$('tc').textContent=s(d.createMs);$('tr').textContent=s(d.runMs);$('ts').textContent=s(d.stopMs);$('tt').textContent=s(d.totalMs);
const NL=String.fromCharCode(10);$('so').textContent=(d.stdout||'')+(d.stderr?NL+'[stderr]'+NL+d.stderr:'')+(d.exitCode==null?'':NL+'[exit '+d.exitCode+']');
$('meta').textContent='Pod '+d.pod+' on '+d.provider+(d.stopError?'. Stop failed: '+d.stopError+'. Stop it on the provider’s site.':', stopped.');$('out').style.display='block'}}
catch(x){err.textContent='Fleet did not answer: '+x.message;err.style.display='block'}
finally{$('wait').style.display='none';$('go').textContent='Start pod';$('go').disabled=false}});})();
</script>`;
}

function docsSection(origin) {
  return `<div class="card"><div class="chead"><b>The full docs are public</b></div><div class="cbody"><p>Every call with curl, TypeScript and Python, the MCP set-up, errors and limits.</p><div class="row" style="margin-top:12px"><a class="b inv" href="/docs">Open the docs</a><a class="b" href="/SKILL.md">SKILL.md for agents</a></div></div></div>
<div class="card"><div class="chead"><b>Give your agent one line</b></div><div class="cbody"><div class="codebox"><pre>set up ${esc(origin)}/SKILL.md</pre><button type="button" class="b" onclick="navigator.clipboard.writeText(this.previousElementSibling.textContent).then(()=>{this.textContent='Copied'})">Copy</button></div></div></div>`;
}

// Usage, after Monid's: every start, run and stop, newest first.
function usageSection(calls, errorsOnly) {
  const badge = (st) => `<span class="st ${st >= 400 ? 'bad' : 'ok'}">${st}</span>`;
  const rows = calls
    .map(
      (c) => `<tr><td>${when(c.at)}</td><td class="n">${esc(c.kind)}</td><td>${esc(c.provider || '—')}</td><td class="n">${esc(c.ref || '—')}</td><td>${badge(c.status)}</td><td class="n">${(c.ms / 1000).toFixed(1)} s</td><td>${esc(c.error || '')}</td></tr>`,
    )
    .join('');
  return `<div class="row"><a class="b${errorsOnly ? '' : ' on'}" href="/console?section=usage">All</a><a class="b${errorsOnly ? ' on' : ''}" href="/console?section=usage&only=errors">Errors</a><a class="b" style="margin-left:auto" href="/console?section=usage${errorsOnly ? '&only=errors' : ''}">Refresh</a></div>
${calls.length ? `<div class="scroll" style="margin-top:18px"><table><tr><th>Time</th><th>Call</th><th>Provider</th><th>Pod</th><th>Status</th><th>Took</th><th>Error</th></tr>${rows}</table></div><p class="note">The last ${calls.length} calls${errorsOnly ? ' that failed' : ''}, from the API, MCP and Try a pod.</p>` : `<div class="box"><b>${errorsOnly ? 'No failed calls' : 'No calls yet'}</b><p class="note">Every pod start, run and stop shows up here with its status and how long it took.</p></div>`}`;
}

// Limits, after Monid's budgets: the account's own caps, below fleet's hard ones.
function limitsSection(limits, { error, saved }) {
  const field = (k, label, unit, help) => {
    const [lo, hi] = LIMIT_RANGES[k];
    return `<div class="card lim"><div class="chead"><b>${label}</b></div><div class="cbody"><div class="limrow"><input type="number" name="${k}" min="${lo}" max="${hi}" step="${k === 'maxRam' ? '0.5' : '1'}" value="${esc(limits[k])}" aria-label="${label}" required><span>${unit}</span></div><p class="note">${help} From ${lo} to ${hi}.</p></div></div>`;
  };
  return `${error ? `<div class="err">${esc(error)}</div>` : ''}${saved ? '<div class="box">Saved. New pods follow these limits.</div>' : ''}
<form method="post" action="/console/limits">
<div class="limgrid">
${field('podsPerDay', 'Pods a day', 'pods', 'Starts past this answer 429 until midnight UTC.')}
${field('lifetimeMin', 'Pod lifetime', 'minutes', 'Each provider stops the pod by itself after this, even if your agent forgets.')}
${field('maxCpu', 'Biggest pod: CPU', 'vCPU', 'Bigger requests answer 400.')}
${field('maxRam', 'Biggest pod: memory', 'GB', 'Bigger requests answer 400.')}
</div>
<div class="row"><button class="b inv" type="submit">Save limits</button></div>
</form>
<p class="note">Fleet doesn't bill you, so there is no money budget here: these caps keep your provider bills small. Fleet's own caps stay on top: 120 calls a minute and 300 pods a day per account.</p>`;
}

export function cabinetPage({ origin, login, section, keys, pods, calls = [], limits, prices, providers, newKey, error, saved, errorsOnly }) {
  const auto = !keys.length && !pods.length ? 'start' : 'overview';
  const id = SECTIONS.some(([s]) => s === section) ? section : auto;
  const title = SECTIONS.find(([s]) => s === id)[1];
  const body =
    id === 'overview'
      ? overview(pods, keys)
      : id === 'pods'
        ? podsSection(pods)
        : id === 'keys'
          ? keysSection({ keys, newKey, error })
          : id === 'try'
            ? trySection(prices, providers)
            : id === 'providers'
              ? providersSection(prices, providers)
              : id === 'start'
                ? startSection(origin, keys, pods)
                : id === 'usage'
                  ? usageSection(calls, errorsOnly)
                  : id === 'limits'
                    ? limitsSection(limits, { error, saved })
                    : docsSection(origin);
  return shell({ login, section: id, title, body });
}
