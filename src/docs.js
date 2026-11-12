// /docs (people) and /SKILL.md (agents), from one source. Layout after boat's docs: endpoint list on the left,
// code tabs (curl, TypeScript, Python), "Copy page", and an on-this-page list on wide screens.
import { esc } from './page.js';
import { PROVIDERS } from './providers/index.js';
import { fieldsOf } from './providers/fields.js';

const METHOD = { GET: 'GET', POST: 'POST', PUT: 'PUT', DELETE: 'DEL' };

// Each endpoint: what it does, its body, its answer, and the same call in three languages.
export function endpoints(origin) {
  const auth = `-H "Authorization: Bearer $FLEET_KEY"`;
  return [
    {
      id: 'start',
      method: 'POST',
      path: '/v1/pods',
      title: 'Start a pod',
      text: 'Starts a pod on the cheapest provider you sent a key for, and moves to the next one when a provider fails. Send provider to use only that one, or order to set your own order.',
      body: [
        ['cpu', 'whole number, 1 to 16', '2'],
        ['ram', 'GB, 1 to 64', '4'],
        ['provider', 'a provider name from GET /v1/prices (daytona works today), or demo', 'none'],
        ['order', 'list of providers to try in this order', 'none'],
      ],
      answer: '201 {"id":"pod_daytona_…","provider":"daytona","cpu":2,"ram":4,"pricePerHour":0.166,"failed":[{"provider":"boat","error":"HTTP 401: unauthorized"}]}',
      curl: `curl -X POST ${origin}/v1/pods \\\n  ${auth} \\\n  -H "X-Daytona-Key: $DAYTONA_KEY" \\\n  -d '{"cpu":2,"ram":4}'`,
      ts: `const pod = await fetch("${origin}/v1/pods", {\n  method: "POST",\n  headers: {\n    Authorization: \`Bearer \${process.env.FLEET_KEY}\`,\n    "X-Daytona-Key": process.env.DAYTONA_KEY,\n  },\n  body: JSON.stringify({ cpu: 2, ram: 4 }),\n}).then((r) => r.json());`,
      py: `import os, requests\n\npod = requests.post(\n    "${origin}/v1/pods",\n    headers={\n        "Authorization": f"Bearer {os.environ['FLEET_KEY']}",\n        "X-Daytona-Key": os.environ["DAYTONA_KEY"],\n    },\n    json={"cpu": 2, "ram": 4},\n).json()`,
    },
    {
      id: 'run',
      method: 'POST',
      path: '/v1/pods/:id/run',
      title: 'Run a command',
      text: 'Runs one shell command in the pod and waits for it, up to 10 minutes. Send the same provider key you started the pod with.',
      body: [
        ['command', 'a shell command', 'required'],
        ['cwd', 'folder to run in', 'none'],
        ['env', 'object of variable names to values, for this command only', 'none'],
        ['timeout', 'seconds, 1 to 3600; the answer then has timedOut', 'none'],
      ],
      answer: '200 {"stdout":"hello\\n","stderr":"","exitCode":0}. With timeout it also has "timedOut" (exit code 124 when true). A pod the provider already stopped answers 410 "this pod is gone".',
      curl: `curl -X POST ${origin}/v1/pods/$POD_ID/run \\\n  ${auth} \\\n  -H "X-Daytona-Key: $DAYTONA_KEY" \\\n  -d '{"command":"echo hello"}'`,
      ts: `const out = await fetch(\`${origin}/v1/pods/\${pod.id}/run\`, {\n  method: "POST",\n  headers: { Authorization: \`Bearer \${process.env.FLEET_KEY}\`, "X-Daytona-Key": process.env.DAYTONA_KEY },\n  body: JSON.stringify({ command: "echo hello" }),\n}).then((r) => r.json());`,
      py: `out = requests.post(\n    f"${origin}/v1/pods/{pod['id']}/run",\n    headers={"Authorization": f"Bearer {os.environ['FLEET_KEY']}", "X-Daytona-Key": os.environ["DAYTONA_KEY"]},\n    json={"command": "echo hello"},\n).json()`,
    },
    {
      id: 'write',
      method: 'PUT',
      path: '/v1/pods/:id/files',
      title: 'Write a file',
      text: 'Writes a file in the pod and makes its folders. Text by default; send binary as base64. At most 256 KB a call. Works on every provider, because fleet does it with one shell command.',
      body: [
        ['path', 'where in the pod, absolute or from the home folder', 'required'],
        ['content', 'the file, as text or base64', 'required'],
        ['encoding', 'utf8 or base64', 'utf8'],
      ],
      answer: '200 {"path":"app/main.py","bytes":9}',
      curl: `curl -X PUT ${origin}/v1/pods/$POD_ID/files \\\n  ${auth} \\\n  -H "X-Daytona-Key: $DAYTONA_KEY" \\\n  -d '{"path":"app/main.py","content":"print(42)"}'`,
      ts: `await fetch(\`${origin}/v1/pods/\${pod.id}/files\`, {\n  method: "PUT",\n  headers: { Authorization: \`Bearer \${process.env.FLEET_KEY}\`, "X-Daytona-Key": process.env.DAYTONA_KEY },\n  body: JSON.stringify({ path: "app/main.py", content: "print(42)" }),\n});`,
      py: `requests.put(\n    f"${origin}/v1/pods/{pod['id']}/files",\n    headers={"Authorization": f"Bearer {os.environ['FLEET_KEY']}", "X-Daytona-Key": os.environ["DAYTONA_KEY"]},\n    json={"path": "app/main.py", "content": "print(42)"},\n)`,
    },
    {
      id: 'read',
      method: 'GET',
      path: '/v1/pods/:id/files?path=',
      title: 'Read a file',
      text: 'Reads a file from the pod. Text comes back as text; a file that is not UTF-8 comes back as base64. At most 256 KB.',
      body: [],
      answer: '200 {"path":"app/main.py","bytes":9,"encoding":"utf8","content":"print(42)"}. 404 when the file is not there, 413 when it is too big.',
      curl: `curl "${origin}/v1/pods/$POD_ID/files?path=app/main.py" \\\n  ${auth} \\\n  -H "X-Daytona-Key: $DAYTONA_KEY"`,
      ts: `const file = await fetch(\`${origin}/v1/pods/\${pod.id}/files?path=app/main.py\`, {\n  headers: { Authorization: \`Bearer \${process.env.FLEET_KEY}\`, "X-Daytona-Key": process.env.DAYTONA_KEY },\n}).then((r) => r.json());`,
      py: `file = requests.get(\n    f"${origin}/v1/pods/{pod['id']}/files",\n    params={"path": "app/main.py"},\n    headers={"Authorization": f"Bearer {os.environ['FLEET_KEY']}", "X-Daytona-Key": os.environ["DAYTONA_KEY"]},\n).json()`,
    },
    {
      id: 'list',
      method: 'GET',
      path: '/v1/pods',
      title: 'List pods',
      text: 'Your pods, newest first, with provider, size, price and status: running, stopped, gone or likely-stopped. Add ?status=running to see only running ones. Needs only your fleet key.',
      body: [],
      answer: '200 {"pods":[{"id":"pod_daytona_…","provider":"daytona","cpu":2,"ram":4,"pricePerHour":0.166,"started":"2026-11-12T18:00:00Z","stopped":null,"status":"running"}]}',
      curl: `curl "${origin}/v1/pods?status=running" \\\n  ${auth}`,
      ts: `const { pods } = await fetch("${origin}/v1/pods?status=running", {\n  headers: { Authorization: \`Bearer \${process.env.FLEET_KEY}\` },\n}).then((r) => r.json());`,
      py: `pods = requests.get(\n    "${origin}/v1/pods",\n    params={"status": "running"},\n    headers={"Authorization": f"Bearer {os.environ['FLEET_KEY']}"},\n).json()["pods"]`,
    },
    {
      id: 'stop',
      method: 'DELETE',
      path: '/v1/pods/:id',
      title: 'Stop a pod',
      text: 'Stops the pod at the provider. Stopping a pod that is already gone also answers 200, so retries are safe. Always stop pods you no longer need: the provider bills while they run.',
      body: [],
      answer: '200 {"stopped":true} or {"stopped":true,"alreadyGone":true}',
      curl: `curl -X DELETE ${origin}/v1/pods/$POD_ID \\\n  ${auth} \\\n  -H "X-Daytona-Key: $DAYTONA_KEY"`,
      ts: `await fetch(\`${origin}/v1/pods/\${pod.id}\`, {\n  method: "DELETE",\n  headers: { Authorization: \`Bearer \${process.env.FLEET_KEY}\`, "X-Daytona-Key": process.env.DAYTONA_KEY },\n});`,
      py: `requests.delete(\n    f"${origin}/v1/pods/{pod['id']}",\n    headers={"Authorization": f"Bearer {os.environ['FLEET_KEY']}", "X-Daytona-Key": os.environ["DAYTONA_KEY"]},\n)`,
    },
    {
      id: 'prices',
      method: 'GET',
      path: '/v1/prices',
      title: 'List prices',
      text: 'The list price per hour of each provider for 2 vCPU and 4 GB, cheapest first. No key needed.',
      body: [],
      answer: '200 {"size":{"cpu":2,"ram":4},"prices":[{"provider":"boat","pricePerHour":0.018,…}]}',
      curl: `curl ${origin}/v1/prices`,
      ts: `const { prices } = await fetch("${origin}/v1/prices").then((r) => r.json());`,
      py: `prices = requests.get("${origin}/v1/prices").json()["prices"]`,
    },
  ];
}

const ERRORS = [
  ['400', 'Bad input, no provider key sent, or over your own limit. The message says which.'],
  ['401', 'Missing, revoked or unknown fleet key.'],
  ['404', 'No such pod id, or no such route.'],
  ['410', 'The pod is gone: the provider stopped, expired or deleted it. Start a new one.'],
  ['429', 'Too many calls (120 a minute) or too many pods today. Wait, or raise your limit.'],
  ['502', 'Every provider you sent a key for failed. "failed" lists each one and what it said.'],
];

// One row per provider, from the provider files. A credential with several parts goes in one header, the parts
// joined with ":" in this order (the cabinet's Providers page has one input per part and does the joining).
const headerRows = () => [
  ['Authorization', 'Bearer fleet_…, your fleet key from the cabinet. With connected providers this is the only header you need.'],
  ...Object.values(PROVIDERS)
    .filter((p) => !p.demo)
    .map((p) => {
      const f = fieldsOf(p);
      if (f.length === 1) return [p.keyHeader, `your ${p.label} API key`];
      const shape = f.map((x) => (x.optional ? `[${x.label}]` : x.label)).join(' : ');
      return [p.keyHeader, `your ${p.label} credentials in one value, the parts joined with colons: ${shape}${f.some((x) => x.optional) ? ' (square brackets are optional)' : ''}`];
    }),
  ['X-Demo-Key', 'any value: a simulated pod, no provider account'],
];
const HEADERS = headerRows();
const labels = (list) => list.map((p) => p.label).join(', ').replace(/, ([^,]*)$/, ' and $1');
const real = Object.values(PROVIDERS).filter((p) => !p.demo);
const WORKING = labels(real.filter((p) => p.working));
const UNTESTED = labels(real.filter((p) => !p.working && !p.blocked));
const BLOCKED = labels(real.filter((p) => !p.working && p.blocked));

// The same content as Markdown, for agents ("set up https://fleet.flisk.si/SKILL.md") and for "Copy page".
export function skillMd(origin) {
  const eps = endpoints(origin);
  return `---
name: fleet
description: Start Linux pods for an agent on the cheapest sandbox provider the user has a key for (${WORKING} work today; ${UNTESTED} are built and untested on a real account; ${BLOCKED} cannot be tested yet), run commands in them, and stop them. Use when a task needs an isolated machine to run code.
---

# fleet

One API for every agent pod. Fleet starts each pod on the cheapest provider you have a key for and moves to the next one when a provider fails. Provider keys the user connects in the cabinet are stored encrypted; keys sent in headers are never stored.

## Set up

1. Ask the user for a fleet key (they make one at ${origin}/console?section=keys). Keep it in FLEET_KEY.
2. Ask the user to connect at least one provider (${WORKING} work today; the others are marked untested or blocked) on ${origin}/console?section=providers. Then only the fleet key is needed. Without a connection, send the provider key in its header. To try first without any, send \`X-Demo-Key: demo\`.
3. Or add fleet as an MCP server: url ${origin}/mcp, the same headers. Tools: pod_create, pod_run, pod_write_file, pod_read_file, pod_list, pod_stop.

## Headers

${HEADERS.map(([h, t]) => `- \`${h}\`: ${t}`).join('\n')}

## Calls

${eps
  .map(
    (e) => `### ${e.title}: \`${e.method} ${e.path}\`

${e.text}
${e.body.length ? `\nBody: ${e.body.map(([k, t, d]) => `\`${k}\` (${t}${d !== 'none' && d !== 'required' ? `, default ${d}` : d === 'required' ? ', required' : ''})`).join(', ')}.\n` : ''}
\`\`\`bash
${e.curl}
\`\`\`

Answer: ${e.answer}`,
  )
  .join('\n\n')}

## Errors

${ERRORS.map(([c, t]) => `- ${c}: ${t}`).join('\n')}

## Rules for agents

- Always stop every pod you started, even when a step failed.
- A 410 means the pod is gone; start a new one instead of retrying.
- Never print or store the user's provider keys. Prefer connected providers over sending keys in headers.
`;
}

export function docsPage(origin, shellFn) {
  const eps = endpoints(origin);
  const nav = eps.map((e) => `<a href="#${e.id}"><span class="mt">${METHOD[e.method]}</span>${esc(e.title)}</a>`).join('');
  const tabs = (e) => `<div class="tabs" data-tabs>
<div class="tabbar"><button type="button" class="on" data-tab="curl">curl</button><button type="button" data-tab="ts">TypeScript</button><button type="button" data-tab="py">Python</button><button type="button" class="cp" data-copy-tab>Copy</button></div>
<pre data-pane="curl">${esc(e.curl)}</pre><pre data-pane="ts" hidden>${esc(e.ts)}</pre><pre data-pane="py" hidden>${esc(e.py)}</pre>
</div>`;
  const sections = eps
    .map(
      (e) => `<section class="ep" id="${e.id}">
<p class="m label"><span class="mt big">${METHOD[e.method]}</span> ${esc(e.path)}</p>
<h2>${esc(e.title)}</h2>
<p>${esc(e.text)}</p>
${e.body.length ? `<div class="scroll"><table><tr><th>Field</th><th>Value</th><th>Default</th></tr>${e.body.map(([k, t, d]) => `<tr><td class="n">${esc(k)}</td><td>${esc(t)}</td><td>${esc(d)}</td></tr>`).join('')}</table></div>` : ''}
${tabs(e)}
<p class="note"><b>Answer.</b> ${esc(e.answer)}</p>
</section>`,
    )
    .join('');
  const body = `<div class="docs">
<aside class="dnav">
<p class="m label">Start</p>
<a href="#start-here">Get started</a><a href="#headers">Keys and headers</a><a href="#mcp">MCP</a>
<p class="m label" style="margin-top:22px">Pods</p>
${nav}
<p class="m label" style="margin-top:22px">Reference</p>
<a href="#errors">Errors</a><a href="#limits">Limits</a><a href="/SKILL.md">SKILL.md</a>
</aside>
<article class="dmain">
<div class="dhead"><div><p class="m label">Docs</p><h1 style="font-size:clamp(40px,5vw,64px);margin:0">fleet API</h1></div><button type="button" class="b" data-copy-url="/SKILL.md">Copy page</button></div>
<section class="ep" id="start-here">
<h2>Get started</h2>
<p>Give your agent one line, and it sets itself up:</p>
<div class="cmd"><code>set up ${esc(origin)}/SKILL.md</code><button type="button" data-copy="set up ${esc(origin)}/SKILL.md">Copy</button></div>
<p>Or by hand: make a fleet key in the <a href="/console?section=keys">cabinet</a>, get a key from at least one provider, and start a pod. To try with no provider account, send <code>X-Demo-Key: demo</code>.</p>
</section>
<section class="ep" id="headers"><h2>Keys and headers</h2><p>Connect each provider once on the cabinet's Providers page and fleet keeps the key encrypted, so calls need only the fleet key. Or send a provider key with each call in its header; header keys are never stored. A header key wins over a connected one.</p><div class="scroll"><table><tr><th>Header</th><th>What goes in it</th></tr>${HEADERS.map(([h, t]) => `<tr><td class="n">${esc(h)}</td><td>${esc(t)}</td></tr>`).join('')}</table></div></section>
${sections}
<section class="ep" id="mcp"><h2>MCP</h2><p>The same calls as tools for Claude Code, Cursor or any MCP client: pod_create, pod_run, pod_write_file, pod_read_file, pod_list, pod_stop.</p>
<div class="tabs" data-tabs><div class="tabbar"><button type="button" class="on" data-tab="cc">Claude Code</button><button type="button" data-tab="cu">Cursor</button><button type="button" class="cp" data-copy-tab>Copy</button></div>
<pre data-pane="cc">claude mcp add --transport http fleet ${esc(origin)}/mcp \\
  --header "Authorization: Bearer $FLEET_KEY" \\
  --header "X-Daytona-Key: $DAYTONA_KEY"</pre>
<pre data-pane="cu" hidden>// .cursor/mcp.json
{ "mcpServers": { "fleet": {
    "url": "${esc(origin)}/mcp",
    "headers": { "Authorization": "Bearer fleet_...", "X-Daytona-Key": "..." }
} } }</pre></div></section>
<section class="ep" id="errors"><h2>Errors</h2><div class="scroll"><table><tr><th>Code</th><th>Meaning</th></tr>${ERRORS.map(([c, t]) => `<tr><td class="n">${c}</td><td>${esc(t)}</td></tr>`).join('')}</table></div></section>
<section class="ep" id="limits"><h2>Limits</h2><p>Each account: at most 120 calls a minute and 300 pod starts a day. In the cabinet you can set lower ones of your own: pods a day, the largest pod, and how long a pod may live before its provider stops it.</p></section>
</article>
</div>
<script>
document.querySelectorAll('[data-tabs]').forEach(t=>{const panes=t.querySelectorAll('[data-pane]');t.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{t.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('on',x===b));panes.forEach(p=>p.hidden=p.dataset.pane!==b.dataset.tab)}));const c=t.querySelector('[data-copy-tab]');if(c)c.addEventListener('click',()=>{const p=[...panes].find(p=>!p.hidden);navigator.clipboard.writeText(p.textContent).then(()=>{c.textContent='Copied';setTimeout(()=>c.textContent='Copy',1500)})})});
document.querySelectorAll('[data-copy-url]').forEach(b=>b.addEventListener('click',async()=>{const t=await fetch(b.dataset.copyUrl).then(r=>r.text());await navigator.clipboard.writeText(t);b.textContent='Copied';setTimeout(()=>b.textContent='Copy page',1500)}));
</script>`;
  return shellFn('fleet docs: API, MCP and SKILL.md', body);
}

export const DOCS_CSS = `
.docs{display:grid;grid-template-columns:240px minmax(0,1fr);border-bottom:1px solid var(--ink)}
.dnav{border-right:1px solid var(--ink);padding:28px 18px;position:sticky;top:0;align-self:start;max-height:100vh;overflow:auto}
.dnav a{display:flex;gap:10px;align-items:center;padding:7px 8px;text-decoration:none;font-size:14px}
.dnav a:hover{background:var(--card)}
.mt{font:500 10.5px/1 var(--mono);color:var(--green);min-width:34px}
.mt.big{font-size:12px;margin-right:6px}
.dmain{padding:28px 48px 64px;min-width:0}
.dhead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding-bottom:22px;border-bottom:1px solid var(--ink)}
.ep{padding:34px 0;border-bottom:1px solid var(--ink)}
.ep:last-child{border-bottom:0}
.ep h2{font-size:clamp(26px,3vw,36px);margin-bottom:10px}
.ep p{max-width:70ch;overflow-wrap:anywhere}
.ep table{margin:14px 0}
.tabs{border:1px solid var(--ink);margin-top:16px;background:var(--card)}
.tabbar{display:flex;border-bottom:1px solid var(--ink)}
.tabbar button{font:11px/1 var(--mono);text-transform:uppercase;letter-spacing:.06em;background:transparent;border:0;border-right:1px solid var(--ink);padding:10px 14px;cursor:pointer;color:var(--dim)}
.tabbar button.on{color:var(--ink);background:var(--paper);box-shadow:inset 0 -2px 0 var(--green)}
.tabbar .cp{margin-left:auto;border-right:0;border-left:1px solid var(--ink)}
.tabs pre{border:0;margin:0}
@media (max-width:820px){.docs{grid-template-columns:minmax(0,1fr)}.dnav{position:static;max-height:none;border-right:0;border-bottom:1px solid var(--ink);display:flex;flex-wrap:wrap;gap:2px 10px;padding:16px}.dnav .label{width:100%;margin:8px 0 0!important}.dmain{padding:20px 16px 48px}}
`;
