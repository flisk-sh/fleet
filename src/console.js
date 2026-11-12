// The cabinet: same layout as inference.flisk.si's console (sidebar, title with a beta tag, ruled tables), in black and white.
import { CSS, esc, FONTS, FLISK_BAR } from './page.js';
import { MAX_KEYS, podStatus, summarize } from './store.js';

const SECTIONS = [
  ['overview', 'Overview'],
  ['pods', 'Pods'],
  ['keys', 'API keys'],
  ['try', 'Try a pod'],
  ['providers', 'Providers'],
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
input[type=text],input[type=password],select{font:14px/1.2 var(--mono);border:1px solid var(--ink);background:var(--card);color:var(--ink);padding:10px 12px;min-width:240px}
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
@media (max-width:820px){.cab{grid-template-columns:1fr}.side{border-right:0;border-bottom:1px solid var(--ink);flex-direction:row;flex-wrap:wrap;padding:14px}.side .logo{width:100%;margin-bottom:8px}.side .me{margin-top:0;border-top:0;padding-top:4px;flex-direction:row;align-items:center;width:100%}.main{padding:0 16px 48px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metrics>div:nth-child(3){border-left:0}.metrics>div:nth-child(n+3){border-top:1px solid var(--ink)}input[type=text],input[type=password],select{min-width:0;width:100%}}
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

// Like a provider's "Get started" page: four steps, each ticked off when fleet can see it's done.
function getStarted(keys, pods) {
  const real = pods.some((p) => !p.failedStart && p.provider !== 'demo');
  const any = pods.some((p) => !p.failedStart);
  const steps = [
    [keys.length > 0, 'Create a fleet key', 'It goes in the Authorization header of every call.', '/console?section=keys', 'Create key'],
    [any, 'Try the demo pod', 'No provider account needed: see start, run and stop end to end.', '/console?section=try', 'Try a pod'],
    [real, 'Bring a provider key', 'Make a key at boat, Isorun, E2B or Daytona and start a real pod.', '/console?section=providers', 'Get a key'],
    [false, 'Give it to your agent', 'Add fleet as an MCP server: pod_create, pod_run, pod_stop.', '/console?section=docs', 'Set up MCP'],
  ];
  if (steps.slice(0, 3).every(([done]) => done)) return '';
  return `<h2>Get started</h2><div class="start">${steps
    .map(
      ([done, title, text, href, cta], i) =>
        `<div class="${done ? 'done' : ''}"><i>${done ? '✓' : i + 1}</i><div><b>${esc(title)}</b><span>${esc(text)}</span></div>${done ? '<span>Done</span>' : `<a class="b${i === steps.findIndex(([d]) => !d) ? ' inv' : ''}" href="${href}">${esc(cta)}</a>`}</div>`,
    )
    .join('')}</div>`;
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
  return `${getStarted(keys, pods)}<div class="metrics">
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

function providersSection(prices, providers) {
  const rows = prices
    .map((p) => {
      const meta = providers[p.provider];
      const kp = KEY_PAGE[p.provider];
      return `<tr><td>${esc(p.label)}</td><td>${esc(meta.keyHeader)}</td><td class="n">${money(p.pricePerHour)}</td><td><a href="${SIGNUP[p.provider] || p.source}" target="_blank" rel="noopener">Sign up</a></td><td>${kp ? `<a href="${kp.url}" target="_blank" rel="noopener">Get a key</a> <span class="note" style="margin:0">(${kp.kind})</span>` : ''}</td><td>${esc(p.note)}</td></tr>`;
    })
    .join('');
  return `<p class="note">Bring your own account at each provider. Send its key in the header below with every call; fleet never stores it. List prices are for 2 vCPU and 4 GB, per hour.</p>
<div class="scroll" style="margin-top:22px"><table><tr><th>Provider</th><th>Header</th><th>Per hour</th><th>Account</th><th>API key</th><th>Note</th></tr>${rows}</table></div>
<p class="note">No callback comes back from a provider: they hand out API keys, not sign-in. Make a key there, then paste it in <a href="/console?section=try">Try a pod</a> or send it in the header.</p>`;
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
      ? overview(pods, keys)
      : id === 'pods'
        ? podsSection(pods)
        : id === 'keys'
          ? keysSection({ keys, newKey, error })
          : id === 'try'
            ? trySection(prices, providers)
            : id === 'providers'
            ? providersSection(prices, providers)
            : docsSection(origin);
  return shell({ login, section: id, title, body });
}
