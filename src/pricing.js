// /pricing: what a month of pods costs on each provider, after boat's calculator.
// Prices and plan rules come from each provider's own page (see providers/*.js facts). Free credits are not counted.
import { esc } from './page.js';
import { logoSvg } from './logos.js';

export const SIZES = [
  { cpu: 1, ram: 1 },
  { cpu: 2, ram: 4 },
  { cpu: 4, ram: 8 },
  { cpu: 8, ram: 16 },
];
const LENGTHS = [
  [300, '5 min'],
  [1800, '30 min'],
  [3600, '1 h'],
  [14400, '4 h'],
  [86400, '24 h'],
];
const PEAKS = [1, 10, 50, 100, 500];

// Everything the page needs, computed on the server from the provider adapters.
export function pricingData(providers) {
  return Object.entries(providers)
    .filter(([, p]) => !p.demo && p.facts)
    .map(([id, p]) => ({
      id,
      label: p.label,
      logo: logoSvg(id, p.label, 20),
      blocked: p.blocked ? p.blocked.kind : null,
      working: p.working || null, // date of the first real-account run; null = untested or blocked
      source: p.priceSource,
      hourly: SIZES.map((s) => p.price(s)),
      minimum: p.facts.minimum || 0,
      session: p.facts.session,
      concurrent: p.facts.concurrent,
      pro: p.facts.pro || null,
      poolCpu: p.facts.poolCpu || null,
      startsPerDay: p.facts.startsPerDay,
      maxCpu: p.facts.maxCpu,
    }));
}

export function pricingPage(origin, providers, shellFn) {
  const data = pricingData(providers);
  const seg = (name, items, on) =>
    `<div class="seg" data-name="${name}">${items.map(([v, l]) => `<button type="button" data-v="${v}"${String(v) === String(on) ? ' class="on"' : ''}>${esc(l)}</button>`).join('')}</div>`;
  const body = `<section class="sec">
<p class="m label">Pricing</p>
<h1 style="font-size:clamp(42px,6vw,80px);margin:0 0 14px">What a month of pods costs</h1>
<p class="lede">Fleet is free. You pay each provider directly on your own account, at their list price. Move the sliders to compare.</p>
</section>
<section class="sec calc">
<div class="inputs">
<label class="m label" for="n">Pods a month <b id="nv">1,000</b></label>
<input type="range" id="n" min="1" max="5" step="0.01" value="3" aria-describedby="nv">
<label class="wk"><input type="checkbox" id="wk" checked> <b>Working only</b> <small id="wkn"></small></label>
<p class="m label">Each pod runs for</p>${seg('len', LENGTHS, 1800)}
<p class="m label">Size of each pod</p>${seg('size', SIZES.map((s, i) => [i, `${s.cpu} vCPU · ${s.ram} GB`]), 1)}
<p class="m label">Most pods at once</p>${seg('peak', PEAKS.map((p) => [p, String(p)]), 10)}
</div>
<div class="out">
<p class="m label">Cheapest</p>
<div class="big"><b id="best">$0</b><span id="bestp">a month</span></div>
<p class="m" id="math" style="color:var(--dim);text-transform:none;letter-spacing:0"></p>
<div class="bars" id="bars" aria-live="polite"></div>
</div>
</section>
<section class="sec">
<p class="m label">How it's counted</p>
<ul class="rules">
<li>Hours × the provider's list price per hour for that size, billed per second.</li>
<li>boat bills at least its $20-a-month plan, which includes $20 of machine time.</li>
<li>E2B's free tier allows 1-hour sessions and 10 pods at once; longer or more need its $150-a-month Pro plan, which is added.</li>
<li>Daytona allows at most 4 vCPU and 8 GB a pod; a new account has 10 vCPU across all pods at once.</li>
<li>Free credits (Daytona $200, E2B $100, Isorun $50) are not taken off. Prices as read from each provider's page on 12 Nov 2026.</li>
</ul>
<div class="cta-row" style="margin-top:22px"><a class="b inv" href="/console?section=try">Try a demo pod</a><a class="b" href="/docs">Read the docs</a></div>
</section>
<script>
(()=>{const D=${JSON.stringify(data)};const S=${JSON.stringify(SIZES)};
const st={len:1800,size:1,peak:10};const $=(i)=>document.getElementById(i);
const money=(v)=>v>=100?'$'+Math.round(v).toLocaleString('en-US'):'$'+v.toFixed(2);
document.querySelectorAll('.seg').forEach(g=>g.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{g.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));st[g.dataset.name]=Number(b.dataset.v);draw()})));
$('n').addEventListener('input',draw);$('wk').addEventListener('change',draw);
function cost(p,n,hours){const h=p.hourly[st.size];if(h==null)return{no:'Does not offer this size'};let usage=n*hours*h,extra=0,notes=[];
if(p.minimum&&usage<p.minimum){notes.push('$'+p.minimum+' plan minimum');usage=p.minimum}
if(p.session&&(st.len>p.session||(p.concurrent&&st.peak>p.concurrent))){if(p.pro&&st.len<=p.pro.session&&st.peak<=p.pro.concurrent){extra=p.pro.monthly;notes.push('+$'+p.pro.monthly+' Pro plan')}else return{no:'Over its plan limits'}}
if(p.poolCpu&&st.peak*S[st.size].cpu>p.poolCpu)notes.push('needs a higher account tier');
if(p.startsPerDay&&n/30>p.startsPerDay)notes.push('needs a bigger plan for '+Math.round(n/30)+' starts a day');
return{v:usage+extra,notes}}
function draw(){const n=Math.round(Math.pow(10,Number($('n').value)));$('nv').textContent=n.toLocaleString('en-US');const hours=st.len/3600;
const why={down:'down right now',card:'needs a card',invite:'invitation only'};const shown=$('wk').checked?D.filter(p=>p.working):D;$('wkn').textContent=$('wk').checked?'Run for real through fleet: '+shown.length+' of '+D.length+' providers. Untick to see the rest, untested ones marked.':'All '+D.length+' providers, in price order.';const rows=shown.map(p=>({p,...cost(p,n,hours)})).sort((a,b)=>(!!a.p.blocked-!!b.p.blocked)||((a.v??Infinity)-(b.v??Infinity)));const ok=rows.filter(r=>r.v!=null&&!r.p.blocked);const best=ok[0];
$('best').textContent=best?money(best.v):'—';$('bestp').textContent=best?'a month on '+best.p.label+(best.p.working?'':' (untested)'):'no provider fits';
$('math').textContent=n.toLocaleString('en-US')+' pods × '+(hours<1?Math.round(hours*60)+' min':hours+' h')+' × '+S[st.size].cpu+' vCPU · '+S[st.size].ram+' GB';
const max=Math.max(...rows.filter(r=>r.v!=null).map(r=>r.v),0.01);
$('bars').innerHTML=rows.map(r=>r.v==null?'<div class="brow off"><span class="bn">'+r.p.logo+r.p.label+'</span><span class="bt">'+(r.p.blocked?(why[r.p.blocked]||'cannot start yet')+' · ':'')+r.no+'</span></div>':'<div class="brow'+(r===best?' win':'')+(r.p.blocked?' blk':'')+'"><span class="bn">'+r.p.logo+r.p.label+'</span><span class="bb"><i style="width:'+Math.max(2,r.v/max*100)+'%"></i></span><span class="bv">'+money(r.v)+'</span><span class="bx">'+(r.p.blocked?'':r===best?'cheapest':(r.v/best.v).toFixed(1)+'×')+'</span>'+((r.notes.length||r.p.blocked||!r.p.working)?'<span class="bnote">'+(r.p.blocked?[why[r.p.blocked]||'cannot start yet'].concat(r.notes):(r.p.working?r.notes:['untested'].concat(r.notes))).join(' · ')+'</span>':'')+'</div>').join('')}
draw()})();
</script>`;
  return shellFn('fleet pricing: what a month of pods costs', body);
}

export const PRICING_CSS = `
.calc{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:48px;align-items:start}
.calc>*{min-width:0}
.inputs .label{margin:22px 0 10px}.inputs .label:first-child{margin-top:0}
.inputs .label b{color:var(--ink);font-weight:500;margin-left:8px}
input[type=range]{width:100%;accent-color:var(--green)}
.seg{display:flex;flex-wrap:wrap}
.wk{display:block;margin:0 0 22px;font-size:14px}.wk small{display:block;color:var(--dim);margin:4px 0 0 24px;max-width:46ch}.wk input{vertical-align:-2px;margin-right:6px}
.seg button{font:12px/1 var(--mono);border:1px solid var(--ink);background:var(--card);padding:10px 12px;margin:0 -1px -1px 0;cursor:pointer}
.seg button.on{background:var(--ink);color:var(--paper)}
.out{border:1px solid var(--ink);background:var(--card);padding:24px}
.big{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.big b{font:800 clamp(56px,7vw,96px)/1 var(--serif);letter-spacing:-.04em}
.big span{font-size:18px}
.bars{margin-top:22px;border-top:1px solid var(--ink)}
.brow .bn{display:flex;align-items:center;gap:8px;min-width:0}.brow .bn .plogo{flex-shrink:0}.brow.blk .bb i{background:none;border-right:2px dashed var(--ink)}.brow.blk{color:var(--dim)}
.brow{display:grid;grid-template-columns:170px minmax(0,1fr) 84px 72px;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--ink);font:13px/1.3 var(--mono)}
.brow .bb{height:14px;background:repeating-linear-gradient(90deg,var(--paper) 0 3px,transparent 3px 6px);border:1px solid var(--ink)}
.brow .bb i{display:block;height:100%;background:var(--ink)}
.brow.win .bb i{background:var(--green)}
.brow .bv{text-align:right}.brow .bx{text-align:right;color:var(--dim)}
.brow .bnote{grid-column:2/-1;color:var(--dim);font-size:11.5px}
.brow.off{grid-template-columns:170px minmax(0,1fr);color:var(--dim)}
.rules{margin:0;padding-left:18px;max-width:80ch}.rules li{margin:6px 0}
@media (max-width:900px){.calc{grid-template-columns:minmax(0,1fr)}.brow{grid-template-columns:150px minmax(0,1fr) 72px}.brow .bx{display:none}}
`;
