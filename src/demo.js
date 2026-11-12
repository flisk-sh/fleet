// The agent race: four small coding jobs, each in its own pod, all started at the same moment.
// Each job is what a coding agent does: start a pod, write the code and its tests, run the tests, stop the pod.
// One job's first try carries a bug we planted on purpose: its tests fail, the agent writes the fix in the same pod
// and runs the tests again. So the page shows what happens when an agent gets it wrong, and still ends green.
// Jobs are spread over the providers you connected (cheapest first, then the next), and a provider that cannot
// start a pod falls back to the next one, which is fleet's routing at work.
// Keys stay on the server; the page never sees them.
import { createPod, pickOrder, runPod, stopPod, writeFile } from './route.js';
import { esc, shell } from './page.js';
import { RECORDED } from './demo-recorded.js';
import { providerTag } from './logos.js';
import { PROVIDERS } from './providers/index.js';

export { RECORDED };

export const DEMO_PROVIDERS = ['daytona', 'blaxel', 'upstash', 'vercel'];

const test = (mod, fn, cases) =>
  [
    'import unittest',
    `from ${mod} import ${fn}`,
    '',
    'class Tests(unittest.TestCase):',
    ...cases.map(([name, call, want]) => `    def test_${name}(self):\n        self.assertEqual(${call}, ${want})`),
    '',
    'if __name__ == "__main__":',
    '    unittest.main()',
    '',
  ].join('\n');

// Each job: the task, the code the agent writes first, its tests, and (for the planted bug) the fix it writes next.
export const JOBS = [
  {
    id: 'slugify',
    title: 'Add a slugify helper',
    file: 'slug.py',
    code: 'import re\n\ndef slugify(text):\n    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")\n',
    tests: test('slug', 'slugify', [
      ['words', 'slugify("Hello World")', '"hello-world"'],
      ['punctuation', 'slugify("  Ship it, now! ")', '"ship-it-now"'],
    ]),
  },
  {
    id: 'duration',
    title: 'Parse "1h30m" into seconds',
    file: 'duration.py',
    code: 'import re\n\nUNITS = {"h": 3600, "m": 60, "s": 1}\n\ndef seconds(text):\n    return sum(int(n) * UNITS[u] for n, u in re.findall(r"(\\d+)([hms])", text))\n',
    tests: test('duration', 'seconds', [
      ['hours_minutes', 'seconds("1h30m")', '5400'],
      ['seconds_only', 'seconds("45s")', '45'],
    ]),
  },
  {
    id: 'wordcount',
    title: 'Count words in a text',
    file: 'words.py',
    // The planted bug: split(" ") counts empty strings between double spaces.
    code: 'def count_words(text):\n    return len(text.split(" "))\n',
    fix: 'def count_words(text):\n    return len(text.split())\n',
    tests: test('words', 'count_words', [
      ['simple', 'count_words("one two three")', '3'],
      ['extra_spaces', 'count_words("  one   two ")', '2'],
    ]),
  },
  {
    id: 'roman',
    title: 'Turn numbers into Roman numerals',
    file: 'roman.py',
    code:
      'PAIRS = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"),\n         (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]\n\ndef roman(n):\n    out = ""\n    for value, sign in PAIRS:\n        while n >= value:\n            out += sign\n            n -= value\n    return out\n',
    tests: test('roman', 'roman', [
      ['year', 'roman(2026)', '"MMXXVI"'],
      ['four', 'roman(4)', '"IV"'],
    ]),
  },
];

const now = () => Date.now();
const testLines = (out) =>
  String(out || '')
    .split('\n')
    .filter((l) => /\.\.\. (ok|FAIL|ERROR)$/.test(l))
    .map((l) => l.replace(/^(test_\w+) \([^)]*\) \.\.\. /, '$1 '));

// One job, start to finish. Never throws: a failure is reported on the job, and its pod is always stopped.
async function runJob(providers, keys, job, order, t0, ctx, emit) {
  const row = { id: job.id, title: job.title, startMs: now() - t0, ok: false, fixed: false, steps: [], output: [] };
  const step = async (kind, name, fn) => {
    const s = now() - t0;
    emit({ type: 'step-start', id: job.id, kind, name, t: s });
    const r = await fn().catch((e) => ({ ok: false, detail: String(e?.message || e).slice(0, 200) }));
    const rec = { kind, name, startMs: s, endMs: now() - t0, ok: r.ok !== false, detail: r.detail || '' };
    if (r.output) rec.output = r.output; // each test run keeps its own lines, so a failed first run stays visible
    row.steps.push(rec);
    emit({ type: 'step-end', id: job.id, ...rec, provider: r.provider });
    return r;
  };
  const write = (files) => async () => {
    for (const [path, content] of Object.entries(files)) {
      const w = await writeFile(providers, keys, row.pod, { path: `work/${path}`, content }, ctx);
      if (w.status !== 200) return { ok: false, detail: w.error };
    }
    return { detail: Object.keys(files).join(', ') };
  };
  const runTests = async () => {
    const r = await runPod(providers, keys, row.pod, { command: 'python3 -m unittest -v 2>&1', cwd: 'work', timeout: 60 }, ctx);
    if (r.status !== 200) return { ok: false, detail: r.error };
    row.output = testLines(r.result.stdout || r.result.stderr);
    const failed = row.output.filter((l) => !l.endsWith(' ok')).length;
    const output = row.output;
    return r.result.exitCode === 0 ? { detail: `${output.length} passed`, output } : { ok: false, detail: `${failed || 'some'} of ${output.length || '?'} failed`, output };
  };

  const started = await step('start', 'Start a pod', async () => {
    const made = await createPod(providers, keys, { cpu: 1, ram: 1, order }, ctx);
    if (made.status !== 201) return { ok: false, detail: made.error || 'no provider could start a pod' };
    const fellBack = (made.pod.failed || []).map((f) => f.provider);
    return { pod: made.pod.id, provider: made.pod.provider, fellBack, detail: fellBack.length ? `${made.pod.provider} (after ${fellBack.join(', ')} failed)` : made.pod.provider };
  });
  if (!started.pod) {
    row.endMs = now() - t0;
    row.error = started.detail;
    emit({ type: 'job-end', id: job.id, ok: false, endMs: row.endMs, error: row.error });
    return row;
  }
  row.pod = started.pod;
  row.provider = started.provider;
  if (started.fellBack.length) row.fellBackFrom = started.fellBack;
  try {
    const wrote = await step('write', 'Write the code and tests', write({ [job.file]: job.code, [`test_${job.file}`]: job.tests }));
    if (wrote.ok === false) return row;
    const first = await step('test', 'Run the tests', runTests);
    if (first.ok !== false) {
      row.ok = true;
    } else if (job.fix && row.output.length) {
      // The agent reads the failing test, writes the fix in the same pod, and runs the tests again.
      const fixed = await step('fix', 'Write the fix', write({ [job.file]: job.fix }));
      if (fixed.ok !== false) {
        const again = await step('test', 'Run the tests again', runTests);
        row.ok = again.ok !== false;
        row.fixed = row.ok;
      }
    }
  } finally {
    await step('stop', 'Stop the pod', async () => {
      const s = await stopPod(providers, keys, row.pod, ctx);
      return { ok: s.status === 200, detail: s.status === 200 ? '' : s.error };
    });
    row.endMs = now() - t0;
    emit({ type: 'job-end', id: job.id, ok: row.ok, fixed: row.fixed, endMs: row.endMs, provider: row.provider });
  }
  return row;
}

// Spread the jobs over the connected providers: job i asks the i-th provider first and falls back to the rest.
export function jobOrders(providers, keys, n = JOBS.length) {
  const picked = pickOrder(providers, keys, { cpu: 1, ram: 1 });
  if (picked.error) return { error: picked.error };
  const o = picked.order;
  return { orders: Array.from({ length: n }, (_, i) => [...o.slice(i % o.length), ...o.slice(0, i % o.length)]) };
}

// All jobs at the same time. Each one is independent: one job failing never stops the others.
export async function demoRun(providers, keys, ctx = {}, emit = () => {}) {
  if (!Object.keys(keys).length) return { ok: false, error: 'connect Daytona, Blaxel, Upstash Box or Vercel on the Providers page first' };
  const plan = jobOrders(providers, keys);
  if (plan.error) return { ok: false, error: plan.error };
  emit({ type: 'plan', jobs: JOBS.map((j, i) => ({ id: j.id, provider: plan.orders[i][0] })) });
  const t0 = now();
  const jobs = await Promise.all(JOBS.map((j, i) => runJob(providers, keys, j, plan.orders[i], t0, ctx, emit)));
  const passed = jobs.filter((j) => j.ok).length;
  const totalMs = Math.max(...jobs.map((j) => j.endMs));
  // One after another: the sum of each job's own time. Both numbers come from this run.
  const sequentialMs = jobs.reduce((sum, j) => sum + (j.endMs - j.startMs), 0);
  const providersUsed = [...new Set(jobs.map((j) => j.provider).filter(Boolean))];
  return {
    ok: passed === jobs.length,
    passed,
    fixed: jobs.filter((j) => j.fixed).length,
    total: jobs.length,
    totalMs,
    sequentialMs,
    speedup: Math.round((sequentialMs / Math.max(1, totalMs)) * 10) / 10,
    providersUsed,
    jobs,
  };
}

// ---- the page ----
// A live timeline, like a CI run: one row per job, a bar per step that grows while the step runs.
// The server streams one line per real event, so every bar is a real step in a real pod.
const PAGE_CSS = `
.race{padding:40px 48px 64px;border-bottom:1px solid var(--ink)}
.race h1{font:800 clamp(36px,5.4vw,68px)/.98 var(--serif);letter-spacing:-.045em;margin:10px 0 14px}
.race h1 em{font-style:normal;color:var(--green)}
.race .sub{max-width:64ch;font-size:17px;margin:0}
.ctl{display:flex;align-items:center;gap:22px;margin:26px 0 22px;flex-wrap:wrap}
.clock{font:500 38px/1 var(--mono);font-variant-numeric:tabular-nums;min-width:6ch}
.clock small{font-size:14px;color:var(--dim);margin-left:4px}
.legend{display:flex;gap:14px;flex-wrap:wrap;font:11px/1 var(--mono);text-transform:uppercase;letter-spacing:.05em;color:var(--dim)}
.legend span{display:inline-flex;align-items:center;gap:6px}
.legend i{width:14px;height:10px;display:inline-block}
.board{border:1px solid var(--ink);background:var(--card)}
.job{display:grid;grid-template-columns:260px minmax(0,1fr) 150px;border-bottom:1px solid var(--ink);min-height:68px}
.job:last-child{border-bottom:0}
.who{padding:12px 16px;border-right:1px solid var(--ink);display:flex;flex-direction:column;justify-content:center;gap:5px;min-width:0}
.who b{font:650 16px/1.25 var(--sans)}
.replay{margin:14px 0 0;max-width:64ch;color:var(--dim);font-size:15px}
.who small{font:11.5px/1.3 var(--mono);color:var(--dim);overflow-wrap:anywhere}
.who small .ptag,.story .ptag{gap:5px;color:var(--ink)}
.track{position:relative;margin:0 14px}
.track .lane{position:absolute;left:0;right:0;top:50%;height:22px;transform:translateY(-50%);background:repeating-linear-gradient(90deg,transparent 0 calc(10% - 1px),rgba(23,23,21,.08) calc(10% - 1px) 10%)}
.seg{position:absolute;top:0;height:22px;min-width:2px;transition:width .12s linear}
.seg.run{animation:pulse 1s ease-in-out infinite}
@keyframes pulse{50%{opacity:.6}}
.k-start{background:repeating-linear-gradient(135deg,#bdb9a4 0 4px,#d8d4be 4px 8px)}
.k-write{background:var(--ink)}
.k-test{background:var(--green)}
.k-test.bad{background:#c2410c}
.k-fix{background:#d97706}
.k-stop{background:#9a988a}
.state{display:flex;align-items:center;justify-content:center;border-left:1px solid var(--ink);padding:0 10px}
.chip{font:10.5px/1 var(--mono);text-transform:uppercase;letter-spacing:.05em;padding:5px 7px;border:1px solid var(--dim);color:var(--dim);white-space:nowrap}
.chip.live{border-color:var(--ink);color:var(--ink)}
.chip.pass{background:var(--ink);border-color:var(--ink);color:var(--paper)}
.chip.pass:before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--glow);margin-right:6px;vertical-align:1px}
.chip.fail{border-color:#c2410c;color:#c2410c}
.axis{display:grid;grid-template-columns:260px minmax(0,1fr) 150px;border-top:1px solid var(--ink);font:10.5px/1 var(--mono);color:var(--dim)}
.axis .ticks{position:relative;height:24px;margin:0 14px}
.axis .ticks span{position:absolute;top:7px;transform:translateX(-50%);white-space:nowrap}.axis .ticks span:last-child{transform:translateX(-100%)}.axis .ticks span:first-child{transform:none}
.axis>div:first-child{border-right:1px solid var(--ink);padding:7px 16px}
.axis>div:last-child{border-left:1px solid var(--ink)}
.result{margin-top:28px}
.result[hidden]{display:none}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid var(--ink);background:var(--card)}
.stats>div{padding:18px 20px}.stats>div+div{border-left:1px solid var(--ink)}
.stats b{display:block;font:800 clamp(30px,3.8vw,50px)/1 var(--serif);letter-spacing:-.03em;margin-bottom:6px}
.stats span{font:11.5px/1.4 var(--mono);text-transform:uppercase;letter-spacing:.05em;color:var(--dim)}
.stats .win b{color:var(--green)}
.versus{border:1px solid var(--ink);border-top:0;background:var(--card);padding:16px 20px;display:grid;gap:10px}
.versus div{display:grid;grid-template-columns:150px minmax(0,1fr);align-items:center;gap:12px;font:11.5px/1.3 var(--mono);text-transform:uppercase;letter-spacing:.04em}
.versus i{display:block;height:16px}
.versus .par i{background:var(--green)}
.versus .seq b{display:flex;gap:2px}.versus .seq i{background:var(--ink)}
.story{margin:18px 0 0;max-width:74ch;font-size:16px}
.story+.story{margin-top:8px;color:var(--dim)}
.result details{margin-top:16px;border:1px solid var(--ink);background:var(--card);padding:10px 14px}
.result summary{cursor:pointer;font:12px var(--mono);text-transform:uppercase;letter-spacing:.05em}
.result pre{border:0;padding:8px 0 0;margin:0;white-space:pre-wrap;font:12.5px/1.5 var(--mono)}
.err{border:1px solid #c2410c;padding:14px 16px;margin-top:18px;background:var(--card)}
.err p{margin:0 0 10px}
@media (max-width:820px){.race{padding:26px 16px 44px}.job{grid-template-columns:minmax(0,1fr) 128px;grid-template-rows:auto 44px}.chip{font-size:9.5px;padding:4px 5px}.state{padding:0 6px}.who{grid-column:1/-1;border-right:0;border-bottom:1px solid var(--ink)}.track{grid-row:2}.state{grid-row:2}.axis{grid-template-columns:minmax(0,1fr) 128px}.axis>div:first-child{display:none}.stats{grid-template-columns:1fr 1fr}.stats>div:nth-child(3){border-left:0}.stats>div:nth-child(n+3){border-top:1px solid var(--ink)}.versus div{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.seg,.seg.run{transition:none;animation:none}}
`;

const PAGE_JS = String.raw`
(function(){
var JOBS=window.__JOBS__,go=document.getElementById('go'),clock=document.getElementById('clock'),board=document.getElementById('board'),ticks=document.getElementById('ticks'),result=document.getElementById('result');
var LIVE={start:'Starting pod',write:'Writing',test:'Testing',fix:'Fixing',stop:'Stopping'};
var rows={},timer=null,t0=0,scale=10,running=false;
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
var TAGS=window.__PTAGS__||{};function ptag(id){return TAGS[id]||esc(id)}
function secs(ms){return (ms/1000).toFixed(1)+' s'}
function elapsed(){return (performance.now()-t0)/1000}
function build(){board.innerHTML='';rows={};
  JOBS.forEach(function(j){var r=document.createElement('div');r.className='job';
    r.innerHTML='<div class="who"><b>'+esc(j.title)+'</b><small>waiting for a pod</small></div><div class="track"><div class="lane"></div></div><div class="state"><span class="chip">Queued</span></div>';
    board.appendChild(r);rows[j.id]={el:r,lane:r.querySelector('.lane'),who:r.querySelector('small'),chip:r.querySelector('.chip'),segs:[],open:null}});
  scale=10;drawAxis()}
function nice(s){var most=Math.max(3,Math.floor((ticks.clientWidth||600)/56)),steps=[1,2,5,10,15,20,30,60];for(var i=0;i<steps.length;i++){if(s/steps[i]<=most)return steps[i]}return 120}
function drawAxis(){var st=nice(scale),h='';for(var t=0;t<=scale+0.001;t+=st){h+='<span style="left:'+(t/scale*100)+'%">'+t+' s</span>'}ticks.innerHTML=h}
function layout(){var now=elapsed();
  if(running&&now>scale*0.92){scale=Math.ceil(now*1.3/5)*5;drawAxis()}
  Object.keys(rows).forEach(function(id){rows[id].segs.forEach(function(s){var end=s.end==null?now:s.end;s.el.style.left=(s.start/scale*100)+'%';s.el.style.width=Math.max(0,(end-s.start)/scale*100)+'%'})})}
function chip(r,cls,text){r.chip.className='chip '+cls;r.chip.textContent=text}
function onEvent(e){
  if(e.type==='plan'){e.jobs.forEach(function(p){if(rows[p.id])rows[p.id].who.innerHTML='asks '+ptag(p.provider)+' first'});return}
  var r=rows[e.id];if(!r)return;
  if(e.type==='step-start'){var el=document.createElement('i');el.className='seg run k-'+e.kind;el.title=e.name;r.lane.appendChild(el);
    var s={el:el,start:e.t/1000,end:null};r.segs.push(s);r.open=s;chip(r,'live',LIVE[e.kind]||e.name)}
  else if(e.type==='step-end'){var o=r.open;if(o){o.end=e.endMs/1000;o.el.classList.remove('run');if(!e.ok)o.el.classList.add('bad');o.el.title=e.name+' · '+secs(e.endMs-e.startMs)+(e.detail?' · '+e.detail:'')}
    if(e.kind==='start'&&e.ok){var fb=/\(after (.*) failed\)/.exec(e.detail||'');r.who.innerHTML='pod on '+ptag(e.provider||e.detail)+' · up in '+secs(e.endMs-e.startMs)+(fb?' · after '+fb[1].split(', ').map(ptag).join(' ')+' failed':'')}
    if(e.kind==='start'&&!e.ok)r.who.textContent=e.detail;
    if(e.kind==='test'&&!e.ok)chip(r,'live','Tests failed')}
  else if(e.type==='job-end'){if(e.ok)chip(r,'pass',e.fixed?'Fixed · '+secs(e.endMs):'Passed · '+secs(e.endMs));else chip(r,'fail','Failed')}
  layout()}
function finish(res){running=false;clearInterval(timer);clock.firstChild.nodeValue=(res.totalMs/1000).toFixed(1);scale=Math.max(1,Math.ceil(res.totalMs/1000*1.08));drawAxis();layout();
  var h='<div class="stats"><div class="win"><b>'+secs(res.totalMs)+'</b><span>all '+res.total+' at once</span></div><div><b>'+secs(res.sequentialMs)+'</b><span>one after another</span></div><div class="win"><b>'+res.speedup+'&times;</b><span>faster in parallel</span></div><div><b>'+res.passed+'/'+res.total+'</b><span>passed'+(res.fixed?' · '+res.fixed+' fixed itself':'')+'</span></div></div>';
  h+='<div class="versus"><div class="par"><span>Parallel pods</span><i style="width:'+(res.totalMs/res.sequentialMs*100)+'%"></i></div><div class="seq"><span>One at a time</span><b>'+res.jobs.map(function(j){return '<i title="'+esc(j.title)+'" style="flex:'+(j.endMs-j.startMs)+' 1 0"></i>'}).join('')+'</b></div></div>';
  var fx=res.jobs.filter(function(j){return j.fixed})[0];
  var bad=res.jobs.filter(function(j){return !j.ok});
  var starts=res.jobs.filter(function(j){return j.provider}).map(function(j){var s=j.steps[0];return ptag(j.provider)+' '+secs(s.endMs-s.startMs)});
  var line=res.passed===res.total?'All '+res.total+' agents finished green on '+res.providersUsed.length+' provider'+(res.providersUsed.length===1?'':'s')+': '+res.providersUsed.map(ptag).join(' ')+'.':res.passed+' of '+res.total+' agents finished green.';
  if(fx)line+=' <b>'+esc(fx.title)+'</b> had a bug we planted on purpose: its tests failed, the agent wrote the fix in the same pod, and the tests passed on the second run.';
  h+='<p class="story">'+line+'</p><p class="story">Pod start times: '+starts.join(' · ')+'. Every pod was stopped at the end'+(bad.length?'; '+bad.map(function(j){return esc(j.title)+': '+esc(j.error||'tests failed')}).join('; '):'')+'.</p>';
  h+='<details><summary>What ran in each pod</summary><pre>';
  res.jobs.forEach(function(j){h+=esc(j.title)+'  ['+esc(j.provider||'no pod')+']\n';(j.steps||[]).forEach(function(s){h+='  '+(s.ok?'ok  ':'FAIL')+' '+esc(s.name)+'  '+secs(s.endMs-s.startMs)+(s.detail?'  '+esc(s.detail):'')+'\n';(s.output||[]).forEach(function(l){h+='      '+esc(l)+'\n'})});h+='\n'});
  h+='</pre></details>';
  result.innerHTML=h;result.hidden=false;go.disabled=false;go.textContent=window.__REPLAY__?'Watch again':'Run again'}
function fail(msg){running=false;clearInterval(timer);var d=document.createElement('div');d.className='err';
  var p=document.createElement('p');p.textContent=msg;d.appendChild(p);
  if(/connect/i.test(msg)){var a=document.createElement('a');a.className='b inv';a.href='/console?section=providers';a.textContent='Connect a provider';d.appendChild(a);var w=document.createElement('a');w.className='b';w.href='/demo';w.style.marginLeft='10px';w.textContent='Watch a recorded run';d.appendChild(w)}
  result.innerHTML='';result.appendChild(d);result.hidden=false;go.disabled=false;
  Object.keys(rows).forEach(function(id){var r=rows[id];if(!/pass|fail/.test(r.chip.className))chip(r,'','Not run')})}
function replay(rec){
  // Play a recorded run back at its real speed: the same events a live run streams, at the times they happened.
  var ev=[{at:0,e:{type:'plan',jobs:rec.jobs.map(function(j){return {id:j.id,provider:j.provider}})}}];
  rec.jobs.forEach(function(j){j.steps.forEach(function(s){
    ev.push({at:s.startMs,e:{type:'step-start',id:j.id,kind:s.kind,name:s.name,t:s.startMs}});
    ev.push({at:s.endMs,e:{type:'step-end',id:j.id,kind:s.kind,name:s.name,startMs:s.startMs,endMs:s.endMs,ok:s.ok,detail:s.detail,provider:s.kind==='start'?j.provider:undefined}})});
    ev.push({at:j.endMs,e:{type:'job-end',id:j.id,ok:j.ok,fixed:j.fixed,endMs:j.endMs}})});
  ev.forEach(function(x,i){x.i=i});ev.sort(function(a,b){return a.at-b.at||a.i-b.i});
  ev.forEach(function(x){setTimeout(function(){onEvent(x.e)},x.at)});
  setTimeout(function(){finish(rec)},rec.totalMs+60)}
go.addEventListener('click',async function(){
  go.disabled=true;result.hidden=true;result.innerHTML='';build();t0=performance.now();running=true;clock.firstChild.nodeValue='0.0';
  timer=setInterval(function(){clock.firstChild.nodeValue=elapsed().toFixed(1);layout()},100);
  if(window.__REPLAY__)return replay(window.__REPLAY__);
  var res;try{res=await fetch('/console/demo',{method:'POST',headers:{accept:'application/x-ndjson'}})}catch(e){return fail('Could not reach fleet: '+e.message)}
  if(!res.ok||!res.body){var j={};try{j=await res.json()}catch(e){}return fail(j.error||'The run could not start')}
  var reader=res.body.getReader(),dec=new TextDecoder(),buf='',final=null;
  for(;;){var chunk=await reader.read();if(chunk.done)break;buf+=dec.decode(chunk.value,{stream:true});var i;
    while((i=buf.indexOf('\n'))>=0){var line=buf.slice(0,i);buf=buf.slice(i+1);if(!line.trim())continue;var e=JSON.parse(line);
      if(e.type==='done')final=e.result;else if(e.type==='error')return fail(e.error);else onEvent(e)}}
  if(final&&final.jobs)finish(final);else fail((final&&final.error)||'The run ended without a result')});
build();
})();
`;

const LEGEND = [
  ['k-start', 'Pod starting'],
  ['k-write', 'Write code'],
  ['k-test', 'Tests pass'],
  ['k-test bad', 'Tests fail'],
  ['k-fix', 'Fix'],
  ['k-stop', 'Stop pod'],
];

// replay: the public page plays back RECORDED instead of starting pods, so it needs no sign-in and no provider key.
// Logo and name for every provider the race can land on, so the page names each one with its mark.
const PTAGS = Object.fromEntries(Object.entries(PROVIDERS).filter(([, p]) => !p.demo).map(([id, p]) => [id, providerTag(id, p.label, 16)]));

export function demoPage({ replay = false } = {}) {
  const jobs = JOBS.map((j) => ({ id: j.id, title: j.title }));
  const lead = replay
    ? `<p class="m label">Recorded run · real pods on four providers</p>`
    : `<p class="m label">Live demo · parallel agent pods</p>`;
  const sub = replay
    ? 'Each row is one coding agent with its own pod: it writes a small function and its tests, runs them, and stops the pod. Fleet spread the four over Daytona, Blaxel, Upstash Box and Vercel and started them together. One agent\'s first try has a bug we planted, so you can watch it fail its tests, fix the code in the same pod, and pass.'
    : 'Each row is one coding agent with its own pod: it writes a small function and its tests, runs them, and stops the pod. Fleet spreads the four over the providers you connected and starts them together. One agent\'s first try has a bug we planted, so you can watch it fail its tests, fix the code in the same pod, and pass.';
  const note = replay
    ? `<p class="replay">This plays back a real run from ${esc(RECORDED.recordedOn)} at its real speed. <a href="/console/demo">Run it live</a> on your own providers: sign in with GitHub and connect one.</p>`
    : '';
  return shell(
    replay ? 'Agent race · recorded run · fleet' : 'Agent race · fleet demo',
    `<section class="race">
${lead}
<h1>Four agents. Four pods. <em>All at once.</em></h1>
<p class="sub">${sub}</p>
${note}
<div class="ctl"><button id="go" class="b inv" type="button">${replay ? 'Watch the run' : 'Run 4 agents'}</button><span class="clock" aria-live="off"><span id="clock">0.0</span><small>s</small></span>
<span class="legend" aria-hidden="true">${LEGEND.map(([c, t]) => `<span><i class="${c}"></i>${esc(t)}</span>`).join('')}</span></div>
<div class="board"><div id="board" aria-label="Agent jobs"></div><div class="axis"><div>Job</div><div class="ticks" id="ticks"></div><div></div></div></div>
<div id="result" class="result" hidden aria-live="polite"></div>
</section>
<script>window.__JOBS__=${JSON.stringify(jobs).replace(/</g, '\\u003c')};window.__PTAGS__=${JSON.stringify(PTAGS).replace(/</g, '\\u003c')};${replay ? `window.__REPLAY__=${JSON.stringify(RECORDED).replace(/</g, '\\u003c')};` : ''}</script>
<script>${PAGE_JS}</script>`,
    PAGE_CSS,
    replay ? { path: '/demo' } : undefined, // the public recorded run is indexable; the live demo in the cabinet is not
  );
}
