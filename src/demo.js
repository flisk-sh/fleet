// The ice-cream saga: one order, four flavours, each made in its own sandbox at the same time.
// Each flavour is one saga step: start a pod, write its code and tests, run the tests, and either serve it or undo it.
// Undo (the compensation): a failed flavour's pod is stopped and the flavour is marked "melted". The others still serve.
// One flavour carries a planted bug on purpose, so the undo is visible. The page says so.
// Keys stay on the server; the page never sees them.
import { createPod, runPod, stopPod, writeFile } from './route.js';
import { esc, shell } from './page.js';

export const DEMO_PROVIDERS = ['daytona', 'blaxel', 'upstash', 'vercel'];

export const FLAVOURS = [
  { id: 'vanilla', name: 'Vanilla', bug: false },
  { id: 'chocolate', name: 'Chocolate', bug: false },
  { id: 'strawberry', name: 'Strawberry', bug: true }, // the planted bug: the undo happens here
  { id: 'mint', name: 'Mint', bug: false },
];

// The code one flavour's agent writes: a scoop function and the tests for it.
export function flavourFiles(f) {
  const scoop = f.bug ? 'return "" + flavour' : 'return flavour + " scoop"';
  return {
    'work/scoop.py': `flavour = "${f.name}"\n\ndef scoop():\n    """Serve one scoop of this flavour."""\n    ${scoop}\n`,
    'work/test_scoop.py': [
      'import unittest',
      'from scoop import scoop',
      '',
      'class ScoopTests(unittest.TestCase):',
      '    def test_serves_one_scoop(self):',
      `        self.assertEqual(scoop(), "${f.name} scoop")`,
      '',
      'if __name__ == "__main__":',
      '    unittest.main()',
      '',
    ].join('\n'),
  };
}

const now = () => Date.now();

// One flavour, start to finish. Never throws: a failure becomes a melted flavour with its pod stopped.
async function makeFlavour(providers, keys, f, t0, ctx, emit = () => {}) {
  const row = { id: f.id, name: f.name, startMs: now() - t0, ok: false, steps: [] };
  // Every step is announced as it starts and as it ends, so a page can move the ship live instead of replaying afterwards.
  const step = async (name, fn, kind) => {
    const s = now() - t0;
    emit({ type: 'step-start', id: f.id, name, kind, t: s });
    const r = await fn().catch((e) => ({ ok: false, detail: String(e?.message || e).slice(0, 200) }));
    const rec = { name, kind, startMs: s, endMs: now() - t0, ok: r.ok !== false, detail: r.detail || '' };
    row.steps.push(rec);
    emit({ type: 'step-end', id: f.id, ...rec });
    return r;
  };
  const started = await step('Start a kitchen (sandbox)', async () => {
    const made = await createPod(providers, keys, { cpu: 1, ram: 1 }, ctx);
    if (made.status !== 201) return { ok: false, detail: made.error || 'no provider could start a sandbox' };
    return { pod: made.pod.id, provider: made.pod.provider, detail: made.pod.provider };
  }, 'start');
  if (!started.pod) {
    row.endMs = now() - t0;
    row.error = started.detail;
    emit({ type: 'ship-end', id: f.id, ok: false, endMs: row.endMs, error: row.error });
    return row;
  }
  row.provider = started.provider;
  const id = started.pod;
  try {
    await step('Write the scoop and its tests', async () => {
      for (const [path, content] of Object.entries(flavourFiles(f))) {
        const w = await writeFile(providers, keys, id, { path, content }, ctx);
        if (w.status !== 200) return { ok: false, detail: w.error };
      }
      return { detail: '2 files' };
    }, 'write');
    let output = '';
    await step('Taste it: run the tests', async () => {
      const run = await runPod(providers, keys, id, { command: 'python3 -m unittest -v 2>&1', cwd: 'work', timeout: 60 }, ctx);
      if (run.status !== 200) return { ok: false, detail: run.error };
      output = run.result.stdout || run.result.stderr || '';
      const passed = run.result.exitCode === 0;
      return { ok: passed, detail: passed ? 'tastes right' : 'does not taste right' };
    }, 'test');
    row.output = output.split('\n').filter((l) => /\.\.\. (ok|FAIL|ERROR)$/.test(l)).map((l) => l.replace(/^test_\w+ \(([^)]*)\) \.\.\. /, '$1 '));
    row.ok = row.steps.every((s) => s.ok);
  } finally {
    // Undo or serve: either way the kitchen closes.
    await step(row.ok ? 'Close the kitchen' : 'Undo: close the kitchen', async () => {
      const s = await stopPod(providers, keys, id, ctx);
      return { ok: s.status === 200, detail: s.status === 200 ? '' : s.error };
    }, row.ok ? 'close' : 'undo');
    row.endMs = now() - t0;
    emit({ type: 'ship-end', id: f.id, ok: row.ok, endMs: row.endMs });
  }
  return row;
}

// The whole order: all flavours at the same time (the saga's parallel steps). Each row is its own saga step.
export async function demoRun(providers, keys, ctx = {}, emit = () => {}) {
  if (!Object.keys(keys).length) return { ok: false, error: 'connect Daytona, Blaxel, Upstash Box or Vercel on the Providers page first' };
  const t0 = now();
  const flavours = await Promise.all(FLAVOURS.map((f) => makeFlavour(providers, keys, f, t0, ctx, emit)));
  const served = flavours.filter((f) => f.ok).length;
  const totalMs = Math.max(...flavours.map((f) => f.endMs));
  const providersUsed = [...new Set(flavours.map((f) => f.provider).filter(Boolean))];
  // What it would have taken one after another: the sum of each ship's own time. Real numbers from this run.
  const sequentialMs = flavours.reduce((sum, f) => sum + (f.endMs - f.startMs), 0);
  return { ok: served === flavours.length, served, total: flavours.length, totalMs, sequentialMs, speedup: Math.round((sequentialMs / totalMs) * 10) / 10, providersUsed, flavours };
}

// ---- the page ----
// A race track. The server streams one line per real event, so each ship moves when its sandbox really finishes a step:
// start (a quarter of the way), write (half), test, deliver. The planted-bug ship reaches the test, fails, turns around
// and sails back while its sandbox is closed. A live clock runs, and the end shows a podium and the parallel payoff:
// all four at once versus the sum of the four one after another (both real numbers from this run).
const COLOURS = { vanilla: '#f3e2a0', chocolate: '#8a5a3c', strawberry: '#f48fb1', mint: '#5fd3a2' };

const PAGE_CSS = `
.race{padding:36px 48px 60px;border-bottom:1px solid var(--ink)}
.race h1{font:800 clamp(34px,5vw,60px)/1 var(--serif);letter-spacing:-.04em;margin:8px 0 12px}
.race .sub{max-width:62ch;font-size:17px;margin:0}
.race .ctl{display:flex;align-items:center;gap:20px;margin:22px 0 26px;flex-wrap:wrap}
.clock{font:500 34px/1 var(--mono);font-variant-numeric:tabular-nums;min-width:5.5ch}
.clock small{font-size:14px;color:var(--dim);margin-left:4px}
.lanes{border:1px solid var(--ink);background:var(--card)}
.lane{display:grid;grid-template-columns:200px minmax(0,1fr);border-bottom:1px solid var(--ink)}
.lane:last-child{border-bottom:0}
.who{padding:14px 16px;border-right:1px solid var(--ink);display:flex;flex-direction:column;justify-content:center;gap:4px}
.who b{display:flex;align-items:center;gap:8px;font:700 18px/1.2 var(--sans)}
.dot{width:14px;height:14px;border-radius:50%;border:1px solid var(--ink);display:inline-block}
.cap{font:12px/1.35 var(--mono);color:var(--dim);min-height:2.7em}
.lane.ok .cap{color:var(--green)}.lane.bad .cap{color:#c2410c}
.sea{position:relative;height:84px;margin:0;background:repeating-linear-gradient(180deg,#e8f1f4 0 10px,#dbe9ee 10px 12px);overflow:hidden}
.sea::after{content:"";position:absolute;left:0;right:0;bottom:0;height:10px;background:repeating-linear-gradient(90deg,#c9dde4 0 18px,#d6e6ec 18px 36px)}
.dock{position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:22px;opacity:.7}
.finish{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:30px}
.finish i{font-style:normal;position:absolute;left:-34px;top:2px;font-size:26px;opacity:0;transition:opacity .4s}
.lane.ok .finish i{opacity:1}
.ship{position:absolute;top:50%;left:6%;font-size:44px;line-height:1;transform:translate(-50%,-58%);transition:left 1s cubic-bezier(.4,0,.2,1);filter:drop-shadow(0 3px 2px rgba(0,0,0,.18));will-change:left}
.ship.bob{animation:bob 1.1s ease-in-out infinite}
.ship.back{transform:translate(-50%,-58%) scaleX(-1)}
.ship.sunk{opacity:.35;filter:grayscale(1)}
@keyframes bob{0%,100%{margin-top:0}50%{margin-top:-5px}}
.wake{position:absolute;top:50%;height:3px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.9));transform:translateY(8px);width:0}
.result{margin-top:26px}
.result[hidden]{display:none}
.podium{display:flex;gap:12px;flex-wrap:wrap;margin:0 0 18px}
.pod{border:1px solid var(--ink);background:var(--card);padding:10px 14px;font:600 16px/1.3 var(--sans);min-width:150px}
.pod small{display:block;font:12px var(--mono);color:var(--dim);margin-top:2px}
.pod.gold{background:var(--ink);color:var(--paper)}.pod.gold small{color:#c9c9d1}
.pod.out{border-style:dashed;color:#c2410c}
.pay{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--ink);background:var(--card)}
.pay>div{padding:18px 20px}.pay>div+div{border-left:1px solid var(--ink)}
.pay b{display:block;font:800 clamp(30px,4vw,48px)/1 var(--serif);letter-spacing:-.03em}
.pay span{font:12px/1.4 var(--mono);text-transform:uppercase;letter-spacing:.05em;color:var(--dim)}
.pay .win b{color:var(--green)}
.story{margin:16px 0 0;max-width:72ch;color:var(--dim)}
.result details{margin-top:14px;border:1px solid var(--ink);background:var(--card);padding:10px 14px}
.result summary{cursor:pointer;font:12px var(--mono);text-transform:uppercase;letter-spacing:.05em}
.result pre{border:0;padding:8px 0 0;white-space:pre-wrap}
.err{border:1px solid #c2410c;color:#c2410c;padding:12px 14px;margin-top:16px;background:var(--card)}
@media (max-width:760px){.race{padding:24px 16px 40px}.lane{grid-template-columns:1fr}.who{border-right:0;border-bottom:1px solid var(--ink);flex-direction:row;align-items:center;justify-content:space-between}.cap{min-height:0;text-align:right}.pay{grid-template-columns:1fr}.pay>div+div{border-left:0;border-top:1px solid var(--ink)}}
@media (prefers-reduced-motion:reduce){.ship,.ship.bob{transition:none;animation:none}}
`;

const PAGE_JS = String.raw`
(function(){
var FL=window.__FLAVOURS__,go=document.getElementById('go'),clock=document.getElementById('clock'),lanes=document.getElementById('lanes'),result=document.getElementById('result');
var CAP={start:'Starting a sandbox...',write:'Writing its code and tests...',test:'Running the tests...',close:'Docking...'};
var POS={start:0.28,write:0.48,test:0.72,close:0.88};   // where the ship is when that step is DONE (fraction of the sea)
var NEXT={start:0.26,write:0.46,test:0.7,close:0.87}; // where it creeps to while that step runs
var state={},timer=null,t0=0;
function el(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function build(){lanes.innerHTML='';state={};
  FL.forEach(function(f){var lane=el('div','lane');lane.dataset.id=f.id;
    lane.innerHTML='<div class="who"><b><i class="dot" style="background:'+f.colour+'"></i>'+esc(f.name)+'</b><span class="cap">Waiting in the harbour</span></div>'+
      '<div class="sea"><span class="dock">&#9875;</span><span class="ship">&#9973;</span><span class="finish">&#127937;<i>&#127846;</i></span></div>';
    lanes.appendChild(lane);state[f.id]={lane:lane,ship:lane.querySelector('.ship'),cap:lane.querySelector('.cap'),pos:0.06}});
  Object.keys(state).forEach(function(id){place(id,0.06,0)});}
function place(id,p,secs){var s=state[id];s.ship.style.transition='left '+secs+'s '+(secs>2?'ease-out':'cubic-bezier(.4,0,.2,1)');s.ship.style.left=(p*100)+'%';s.pos=p}
function sail(id){state[id].ship.classList.add('bob')}
function tick(){var s=(performance.now()-t0)/1000;clock.firstChild.nodeValue=s.toFixed(1)}
function onEvent(e){var s=state[e.id];
  if(e.type==='step-start'){
    if(e.kind==='undo'){s.cap.textContent='Tests failed: sandbox closing, ship recalled';s.ship.classList.add('back');place(e.id,0.06,2.4);return}
    s.cap.textContent=CAP[e.kind]||e.name;sail(e.id);place(e.id,NEXT[e.kind]||s.pos,6)}
  else if(e.type==='step-end'){
    if(e.kind==='undo')return;
    if(e.kind==='test'&&!e.ok){s.cap.textContent='Tests failed!';place(e.id,0.62,0.5);return}
    if(e.ok&&POS[e.kind]){place(e.id,POS[e.kind],0.7)}
    if(!e.ok&&e.kind!=='test'){s.cap.textContent=(e.detail||'failed').slice(0,90)}}
  else if(e.type==='ship-end'){s.ship.classList.remove('bob');
    s.lane.classList.add(e.ok?'ok':'bad');
    if(e.ok){place(e.id,0.88,0.7);s.cap.textContent='Delivered in '+(e.endMs/1000).toFixed(1)+' s';}
    else{s.ship.classList.add('sunk');if(e.error){s.cap.textContent=e.error.slice(0,90)}else{s.cap.textContent='Recalled after '+(e.endMs/1000).toFixed(1)+' s. Sandbox closed.'}}}}
function ms(n){return (n/1000).toFixed(1)+' s'}
function finish(r){clearInterval(timer);clock.firstChild.nodeValue=(r.totalMs/1000).toFixed(1);
  var ok=r.flavours.filter(function(f){return f.ok}).sort(function(a,b){return a.endMs-b.endMs});
  var bad=r.flavours.filter(function(f){return !f.ok});
  var medal=['&#129351;','&#129352;','&#129353;','&#127846;'];
  var h='<div class="podium">';
  ok.forEach(function(f,i){h+='<div class="pod'+(i===0?' gold':'')+'">'+medal[Math.min(i,3)]+' '+esc(f.name)+'<small>delivered in '+ms(f.endMs)+' on '+esc(f.provider||'?')+'</small></div>'});
  bad.forEach(function(f){h+='<div class="pod out">&#10060; '+esc(f.name)+'<small>recalled after '+ms(f.endMs)+'</small></div>'});
  h+='</div><div class="pay"><div class="win"><b>'+ms(r.totalMs)+'</b><span>all '+r.total+' at once</span></div><div><b>'+ms(r.sequentialMs)+'</b><span>one after another</span></div><div class="win"><b>'+r.speedup+'&times;</b><span>faster with fleet</span></div></div>';
  if(bad.length){h+='<p class="story"><b>'+esc(bad[0].name)+'</b> had a bug we planted on purpose. Its tests failed, so fleet closed that sandbox and sent the ship back, and the other '+ok.length+' were not affected. That is the undo step of a saga.</p>'}
  else{h+='<p class="story">Every ship delivered.</p>'}
  h+='<details><summary>What ran in each sandbox</summary><pre>';
  r.flavours.forEach(function(f){h+=esc(f.name)+' ('+esc(f.provider||'no provider')+')\n';(f.steps||[]).forEach(function(s){h+='  '+(s.ok?'ok  ':'FAIL')+' '+esc(s.name)+'  '+ms(s.endMs-s.startMs)+(s.detail?'  '+esc(s.detail):'')+'\n'});(f.output||[]).forEach(function(l){h+='    '+esc(l)+'\n'});h+='\n'});
  h+='</pre></details>';
  result.innerHTML=h;result.hidden=false;go.disabled=false;go.textContent='Race again'}
function fail(msg){clearInterval(timer);var d=el('div','err');d.textContent=msg;result.innerHTML='';result.appendChild(d);result.hidden=false;go.disabled=false}
go.addEventListener('click',async function(){
  go.disabled=true;result.hidden=true;result.innerHTML='';build();t0=performance.now();clock.firstChild.nodeValue='0.0';timer=setInterval(tick,100);
  var res;try{res=await fetch('/console/demo',{method:'POST',headers:{accept:'application/x-ndjson'}})}catch(e){return fail('Could not reach fleet: '+e.message)}
  if(!res.ok||!res.body){var j={};try{j=await res.json()}catch(e){}return fail(j.error||'The race could not start')}
  var reader=res.body.getReader(),dec=new TextDecoder(),buf='',final=null;
  for(;;){var chunk=await reader.read();if(chunk.done)break;buf+=dec.decode(chunk.value,{stream:true});var i;
    while((i=buf.indexOf('\n'))>=0){var line=buf.slice(0,i);buf=buf.slice(i+1);if(!line.trim())continue;var e=JSON.parse(line);
      if(e.type==='done')final=e.result;else if(e.type==='error')return fail(e.error);else onEvent(e)}}
  if(final)finish(final);else fail('The race ended without a result')});
build();
})();
`;

export function demoPage() {
  const flavours = FLAVOURS.map((f) => ({ id: f.id, name: f.name, colour: COLOURS[f.id] }));
  return shell(
    'Agent race · fleet demo',
    `<section class="race">
<p class="m label">Live demo · parallel agents</p>
<h1>Race four AI jobs at once.</h1>
<p class="sub">Each ship is one agent job in its own sandbox: it writes code, runs the tests and delivers a scoop. All four set off together on your own providers, and you watch them move as the real work finishes. One ship has a bug we planted on purpose, so you can see what fleet does when a job fails.</p>
<div class="ctl"><button id="go" class="b inv" type="button">Start the race</button><span class="clock" aria-live="off"><span id="clockwrap"><span id="clock">0.0</span></span><small>s</small></span></div>
<div id="lanes" class="lanes" aria-label="Race track"></div>
<div id="result" class="result" hidden aria-live="polite"></div>
</section>
<script>window.__FLAVOURS__=${JSON.stringify(flavours).replace(/</g, '\\u003c')};</script>
<script>${PAGE_JS}</script>
<style>${PAGE_CSS}</style>`,
    '',
  );
}
