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
async function makeFlavour(providers, keys, f, t0, ctx) {
  const row = { id: f.id, name: f.name, startMs: now() - t0, ok: false, steps: [] };
  const step = async (name, fn) => {
    const s = now() - t0;
    const r = await fn().catch((e) => ({ ok: false, detail: String(e?.message || e).slice(0, 200) }));
    row.steps.push({ name, startMs: s, endMs: now() - t0, ok: r.ok !== false, detail: r.detail || '' });
    return r;
  };
  const started = await step('Start a kitchen (sandbox)', async () => {
    const made = await createPod(providers, keys, { cpu: 1, ram: 1 }, ctx);
    if (made.status !== 201) return { ok: false, detail: made.error || 'no provider could start a sandbox' };
    return { pod: made.pod.id, provider: made.pod.provider, detail: made.pod.provider };
  });
  if (!started.pod) {
    row.endMs = now() - t0;
    row.error = started.detail;
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
    });
    let output = '';
    await step('Taste it: run the tests', async () => {
      const run = await runPod(providers, keys, id, { command: 'python3 -m unittest -v 2>&1', cwd: 'work', timeout: 60 }, ctx);
      if (run.status !== 200) return { ok: false, detail: run.error };
      output = run.result.stdout || run.result.stderr || '';
      const passed = run.result.exitCode === 0;
      return { ok: passed, detail: passed ? 'tastes right' : 'does not taste right' };
    });
    row.output = output.split('\n').filter((l) => /\.\.\. (ok|FAIL|ERROR)$/.test(l)).map((l) => l.replace(/^test_\w+ \(([^)]*)\) \.\.\. /, '$1 '));
    row.ok = row.steps.every((s) => s.ok);
  } finally {
    // Undo or serve: either way the kitchen closes.
    await step(row.ok ? 'Close the kitchen' : 'Undo: close the kitchen', async () => {
      const s = await stopPod(providers, keys, id, ctx);
      return { ok: s.status === 200, detail: s.status === 200 ? '' : s.error };
    });
    row.endMs = now() - t0;
  }
  return row;
}

// The whole order: all flavours at the same time (the saga's parallel steps). Each row is its own saga step.
export async function demoRun(providers, keys, ctx = {}) {
  if (!Object.keys(keys).length) return { ok: false, error: 'connect Daytona, Blaxel, Upstash Box or Vercel on the Providers page first' };
  const t0 = now();
  const flavours = await Promise.all(FLAVOURS.map((f) => makeFlavour(providers, keys, f, t0, ctx)));
  const served = flavours.filter((f) => f.ok).length;
  const totalMs = Math.max(...flavours.map((f) => f.endMs));
  const providersUsed = [...new Set(flavours.map((f) => f.provider).filter(Boolean))];
  return { ok: served === flavours.length, served, total: flavours.length, totalMs, providersUsed, flavours };
}

// The page. It draws the order as ice-cream cones and animates each flavour's bar from its real start and end times.
export function demoPage() {
  return shell(
    'Ice-cream race · fleet demo',
    `<section class="msg icecream">
<p class="m label">Agent demo · a saga</p>
<h1 style="font-size:clamp(40px,6vw,72px)">A fleet of ships races to deliver the ice cream.</h1>
<p class="lede">Each flavour is one ship: its own sandbox, its own job, all setting off at the same time. The first to deliver its scoop wins the race. One ship carries a bug we planted on purpose, so you can see the undo: it turns back, and the others still deliver.</p>
<p style="margin-top:24px"><button id="go" class="b inv" type="button">Start the race</button></p>
<div id="counter" class="counter" aria-live="polite"></div>
<p id="verdict" class="lede" style="margin-top:18px;min-height:1.6em"></p>
</section>
<script>
(()=>{const go=document.getElementById('go'),counter=document.getElementById('counter'),verdict=document.getElementById('verdict');
const esc=(s)=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cone=(name)=>'<div class="flavour" data-f="'+name+'"><div class="head"><span class="scoop-ico">&#9973;</span><b>'+esc(name)+' ship</b><span class="state">at sea</span></div><div class="track"><i class="bar"></i><span class="boat">&#9973;</span></div><ol class="steps"></ol></div>';
function draw(r){counter.innerHTML=r.flavours.map(f=>cone(f.name)).join('');
  r.flavours.forEach(f=>{const el=counter.querySelector('[data-f="'+f.name+'"]');
    const bar=el.querySelector('.bar'),state=el.querySelector('.state'),ol=el.querySelector('.steps');
    el.classList.add(f.ok?'ok':'bad');
    const scale=(ms)=>(ms/r.totalMs*100).toFixed(2)+'%';
    const delay=f.startMs;
    setTimeout(()=>{bar.style.transition='width '+Math.max(300,f.endMs-f.startMs)+'ms linear';bar.style.left=scale(f.startMs);bar.style.width='0%';
      requestAnimationFrame(()=>requestAnimationFrame(()=>{bar.style.width=scale(f.endMs-f.startMs)}));
      state.textContent=f.error?'no ship':(f.ok?'delivered':'turned back');
    },delay*0.6);
    (f.steps||[]).forEach((s,i)=>{setTimeout(()=>{const li=document.createElement('li');li.textContent=(s.ok?'✓ ':'✗ ')+s.name+(s.detail?' · '+s.detail:'');if(!s.ok)li.style.color='#c2410c';ol.appendChild(li)},s.startMs*0.6+i*0)});
    if(f.error){const li=document.createElement('li');li.textContent='✗ '+f.error;ol.appendChild(li)}
    if(f.output&&f.output.length){const pre=document.createElement('div');pre.className='taste';pre.textContent=f.output.join('\\n');el.appendChild(pre)}
  });
  setTimeout(()=>{verdict.textContent=r.served===r.total?'All '+r.total+' ships delivered in '+(r.totalMs/1000).toFixed(1)+' s, sailing on '+(r.providersUsed.join(', ')||'your providers')+'.':r.served+' of '+r.total+' delivered in '+(r.totalMs/1000).toFixed(1)+' s. The turned-back ship was recalled: its sandbox closed, and the others were not affected.'},r.totalMs*0.6+400);
}
go.addEventListener('click',async()=>{go.disabled=true;counter.innerHTML='';verdict.textContent='Ships are leaving the harbour...';
  let r;try{const res=await fetch('/console/demo',{method:'POST',headers:{'content-type':'application/json'}});r=await res.json();if(!res.ok)throw new Error(r.error||'failed')}catch(e){verdict.textContent=String(e.message||e);go.disabled=false;return}
  draw(r);go.disabled=false});})();
</script>
<style>
.icecream .counter{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin-top:26px}
.flavour{border:1px solid var(--ink);background:var(--card);padding:14px 14px 12px;border-radius:16px 16px 6px 6px;position:relative}
.flavour .head{display:flex;align-items:center;gap:8px;font:600 17px/1.2 var(--sans)}
.flavour .head .state{margin-left:auto;font:11px/1 var(--mono);text-transform:uppercase;color:var(--dim)}
.flavour.ok .state{color:var(--green)}.flavour.bad .state{color:#c2410c}
.scoop-ico{font-size:22px}
.track{position:relative;height:12px;border:1px solid var(--ink);margin:12px 0 10px;background:repeating-linear-gradient(90deg,transparent 0 9px,rgba(23,23,21,.08) 9px 10px)}
.track .bar{position:absolute;top:0;bottom:0;width:0;background:repeating-linear-gradient(90deg,var(--green) 0 10px,#16a34a 10px 14px)}
.track .boat{position:absolute;top:-12px;left:0;font-size:16px;transform:translateX(-50%)}
.flavour.bad .track .bar{background:#c2410c}
.steps{list-style:none;margin:0;padding:0;font:12px/1.5 var(--mono)}
.steps li{padding:2px 0}
.taste{margin-top:8px;font:11px/1.4 var(--mono);color:var(--dim);white-space:pre-wrap}
.counter{min-height:1px}
</style>`,
    '',
  );
}
