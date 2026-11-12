// /podlytics: charts that compare the pod providers, after slopalytics.com's tabs of model charts.
// Prices come from the provider adapters (each provider's own price page). Speed and success come from fleet's own
// usage log (the calls table), summed over every account for the last 30 days. No login or pod id leaves the server.
import { esc, FLISK_BAR } from './page.js';

const PL_FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">';

export const PL_SIZES = [
  { cpu: 1, ram: 1 },
  { cpu: 2, ram: 4 },
  { cpu: 4, ram: 8 },
  { cpu: 8, ram: 16 },
  { cpu: 16, ram: 32 },
];
const COLORS = { daytona: '#3ddc84', boat: '#ff8a5c', e2b: '#ffc94d', isorun: '#6fa8ff' };
const SPARE = ['#c792ea', '#5ce1e6', '#f78fb3', '#b8e986', '#e0e0e8', '#ff6b6b', '#a3a3ff', '#d4a373', '#7fd1b9', '#f3a6ff'];
const DAYS = 30;

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p + 0.5))] : null);

// Speed and success per provider and call kind, from the usage log.
export async function measured(env, now = new Date()) {
  if (!env?.DB) return {};
  const since = new Date(now.getTime() - DAYS * 864e5).toISOString();
  const { results = [] } = await env.DB.prepare('SELECT provider, kind, status, ms FROM calls WHERE at >= ? AND provider IS NOT NULL ORDER BY n DESC LIMIT 20000')
    .bind(since)
    .all()
    .catch(() => ({ results: [] }));
  const out = {};
  for (const r of results) {
    const p = (out[r.provider] ||= {});
    const k = (p[r.kind] ||= { n: 0, ok: 0, ms: [] });
    k.n++;
    if (r.status < 300) {
      k.ok++;
      k.ms.push(r.ms);
    }
  }
  for (const p of Object.values(out))
    for (const k of Object.values(p)) {
      k.ms.sort((a, b) => a - b);
      k.p50 = pct(k.ms, 0.5);
      k.p90 = pct(k.ms, 0.9);
      delete k.ms;
    }
  return out;
}

export function podlyticsData(providers, stats = {}) {
  let spare = 0;
  return Object.entries(providers)
    .filter(([, p]) => !p.demo && p.facts)
    .map(([id, p]) => ({
      id,
      label: p.label,
      color: COLORS[id] || SPARE[spare++ % SPARE.length],
      working: p.working || null,
      help: p.help || null,
      source: p.priceSource || null,
      regions: p.facts.regions || [],
      billing: p.facts.billing || '',
      credit: p.facts.credit || '',
      minimum: p.facts.minimum || 0,
      hourly: PL_SIZES.map((s) => p.price(s)),
      stats: stats[id] || {},
    }));
}

// Runs in the browser. Kept as a real function so its source is embedded as-is (no escaping inside a template).
// Wrangler's bundler (keepNames) adds __name(fn, "name") calls inside it, so the page defines a no-op __name first.
function client(D, SIZES) {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NS = 'http://www.w3.org/2000/svg';
  const st = { off: new Set(), size: 1, workingOnly: false, log: false, task: 1800, month: 1000, q: '' };
  try {
    const saved = JSON.parse(localStorage.getItem('podlytics') || '{}');
    if (Array.isArray(saved.off)) st.off = new Set(saved.off);
    if (saved.size != null) st.size = saved.size;
  } catch {}
  const save = () => {
    try {
      localStorage.setItem('podlytics', JSON.stringify({ off: [...st.off], size: st.size }));
    } catch {}
  };
  const shown = () => D.filter((p) => !st.off.has(p.id) && (!st.workingOnly || p.working));
  const money = (v) => (v == null ? '—' : v >= 100 ? '$' + Math.round(v).toLocaleString('en-US') : v >= 1 ? '$' + v.toFixed(2) : '$' + v.toFixed(3));
  const secs = (ms) => (ms == null ? '—' : ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + ' s');
  const sizeLabel = (i) => SIZES[i].cpu + ' vCPU · ' + SIZES[i].ram + ' GB';
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };
  const tip = $('#tip');
  const showTip = (ev, html) => {
    tip.innerHTML = html;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = ev.clientX + 14;
    let y = ev.clientY + 14;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  };
  const hideTip = () => {
    tip.hidden = true;
  };
  const hover = (node, html) => {
    node.addEventListener('mousemove', (e) => showTip(e, html));
    node.addEventListener('mouseleave', hideTip);
    node.style.cursor = 'default';
  };
  const empty = (svg, W, H, text) => {
    const t = el('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'muted' }, svg);
    t.textContent = text;
  };
  const frame = (box) => {
    box.innerHTML = '';
    const W = Math.max(320, box.clientWidth);
    const H = W < 600 ? 300 : 380;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' }, box);
    return { svg, W, H };
  };
  // Lines that end in a label on the right; labels are pushed apart so they never overlap (like slopalytics).
  const spreadLabels = (items, top, bottom, gap = 18) => {
    items.sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < gap) items[i].y = items[i - 1].y + gap;
    const over = items.length ? items[items.length - 1].y - bottom : 0;
    if (over > 0) for (const it of items) it.y -= over;
    for (let i = 0; i < items.length; i++) if (items[i].y < top + i * gap) items[i].y = top + i * gap;
    return items;
  };
  const gridY = (svg, x0, x1, ys, fmt, yOf) => {
    for (const v of ys) {
      const y = yOf(v);
      el('line', { x1: x0, x2: x1, y1: y, y2: y, class: 'grid' }, svg);
      el('text', { x: x0 - 10, y: y + 4, 'text-anchor': 'end', class: 'tick' }, svg).textContent = fmt(v);
    }
  };
  const niceMax = (v) => {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  };

  // 1. Cost vs size
  function costVsSize() {
    const { svg, W, H } = frame($('#c-size'));
    const ps = shown();
    const L = 64, R = W < 600 ? 92 : 170, T = 24, B = 46;
    const xs = SIZES.map((_, i) => L + (i * (W - L - R - 30)) / (SIZES.length - 1));
    const vals = ps.flatMap((p) => p.hourly.filter((v) => v != null));
    if (!vals.length) return empty(svg, W, H, 'Turn on a provider on the right.');
    let yOf, ticks;
    if (st.log) {
      const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...vals))));
      const hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...vals))));
      yOf = (v) => T + (H - T - B) * (1 - (Math.log10(v) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo)));
      ticks = [];
      for (let d = lo; d <= hi * 1.001; d *= 10) ticks.push(d, d * 2, d * 5);
      ticks = ticks.filter((v) => v <= hi * 1.001);
    } else {
      const hi = niceMax(Math.max(...vals));
      yOf = (v) => T + (H - T - B) * (1 - v / hi);
      ticks = [0, hi / 4, hi / 2, (hi * 3) / 4, hi];
    }
    gridY(svg, L, W - R, ticks, (v) => money(v), yOf);
    SIZES.forEach((s, i) => {
      el('text', { x: xs[i], y: H - B + 20, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = s.cpu + ' vCPU';
      el('text', { x: xs[i], y: H - B + 34, 'text-anchor': 'middle', class: 'tick dim' }, svg).textContent = s.ram + ' GB';
    });
    el('text', { x: L, y: 12, class: 'axis' }, svg).textContent = 'USD per hour, list price';
    const labels = [];
    for (const p of ps) {
      const pts = p.hourly.map((v, i) => (v == null ? null : [xs[i], yOf(v), v, i])).filter(Boolean);
      if (!pts.length) continue;
      const g = el('g', { class: 'series', 'data-id': p.id }, svg);
      el('polyline', { points: pts.map((q) => q[0] + ',' + q[1]).join(' '), fill: 'none', stroke: p.color, 'stroke-width': 2, class: p.working ? '' : 'soon' }, g);
      for (const q of pts) {
        const c = el('circle', { cx: q[0], cy: q[1], r: 4.5, fill: p.color, stroke: '#0b0b0d', 'stroke-width': 1.5 }, g);
        hover(c, `<b style="color:${p.color}">${p.label}</b><br>${sizeLabel(q[3])}<br>${money(q[2])} an hour<br>${money(q[2] * 24 * 30)} a month non-stop`);
      }
      const last = pts[pts.length - 1];
      labels.push({ p, x: last[0], y0: last[1], y: last[1] });
    }
    for (const it of spreadLabels(labels, T + 6, H - B - 4)) {
      const lx = W - R + 18;
      el('line', { x1: it.x + 6, y1: it.y0, x2: lx - 6, y2: it.y, class: 'leader' }, svg);
      const t = el('text', { x: lx, y: it.y + 4, class: 'lbl', fill: it.p.color }, svg);
      t.textContent = it.p.label + (it.p.working ? '' : ' ·');
      hover(t, `<b>${it.p.label}</b><br>${it.p.working ? 'Working: run for real on ' + it.p.working : 'Not run on a real account yet: built from its docs'}`);
    }
  }

  // 2. Start time vs cost
  function startVsCost() {
    const { svg, W, H } = frame($('#c-speed'));
    const ps = shown();
    const L = 64, R = W < 600 ? 40 : 170, T = 24, B = 46;
    const pts = ps
      .map((p) => ({ p, ms: p.stats.start?.p50, p90: p.stats.start?.p90, n: p.stats.start?.n || 0, cost: p.hourly[st.size] }))
      .filter((d) => d.ms != null && d.cost != null);
    const missing = ps.filter((p) => !pts.some((d) => d.p === p));
    $('#speed-missing').innerHTML = missing.length
      ? 'No measured starts yet for ' + missing.map((p) => `<span style="color:${p.color}">${p.label}</span>`).join(', ') + '. Every start through fleet adds to this chart.'
      : '';
    if (!pts.length) return empty(svg, W, H, 'No measured starts for these providers in the last 30 days.');
    const allMs = pts.flatMap((d) => [d.ms, d.p90 || d.ms]);
    const lo = Math.max(50, Math.pow(10, Math.floor(Math.log10(Math.min(...allMs)))));
    const hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...allMs) * 1.2)));
    const xOf = (v) => L + ((W - L - R) * (Math.log10(Math.max(v, lo)) - Math.log10(lo))) / (Math.log10(hi) - Math.log10(lo));
    const cmax = niceMax(Math.max(...pts.map((d) => d.cost)) * 1.15);
    const yOf = (v) => T + (H - T - B) * (1 - v / cmax);
    gridY(svg, L, W - R, [0, cmax / 4, cmax / 2, (cmax * 3) / 4, cmax], money, yOf);
    for (let d = lo; d <= hi * 1.001; d *= 10)
      for (const m of [1, 2, 5]) {
        const v = d * m;
        if (v > hi * 1.001) continue;
        el('text', { x: xOf(v), y: H - B + 20, 'text-anchor': 'middle', class: 'tick' }, svg).textContent = secs(v);
      }
    el('text', { x: L, y: 12, class: 'axis' }, svg).textContent = 'USD per hour at ' + sizeLabel(st.size);
    el('text', { x: (L + W - R) / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis' }, svg).textContent = 'Median time to a running pod (lower is better, log scale)';
    // Faster and cheaper corner.
    el('text', { x: L + 8, y: H - B - 10, class: 'tick dim' }, svg).textContent = '↙ faster and cheaper';
    for (const d of pts) {
      const x = xOf(d.ms), y = yOf(d.cost);
      if (d.p90 && d.p90 > d.ms) el('line', { x1: x, x2: xOf(d.p90), y1: y, y2: y, stroke: d.p.color, 'stroke-width': 2, opacity: 0.45 }, svg);
      const c = el('circle', { cx: x, cy: y, r: 7, fill: d.p.color, stroke: '#0b0b0d', 'stroke-width': 2 }, svg);
      hover(c, `<b style="color:${d.p.color}">${d.p.label}</b><br>start median ${secs(d.ms)}, p90 ${secs(d.p90)}<br>${d.n} starts in 30 days<br>${money(d.cost)} an hour at ${sizeLabel(st.size)}`);
      el('text', { x: x + 12, y: y - 10, class: 'lbl', fill: d.p.color }, svg).textContent = d.p.label;
    }
  }

  // Bars shared by cost per task, month and reliability.
  function bars(boxSel, rows, { fmt, axis, note, cap }) {
    const { svg, W, H } = frame($(boxSel));
    if (!rows.length) return empty(svg, W, H, 'Nothing to show for this choice.');
    const L = 64, R = 20, T = 30;
    const tight = (W - L - R) / rows.length < 72;
    const B = tight ? 84 : 58;
    const max = cap || niceMax(Math.max(...rows.filter((r) => r.v != null).map((r) => r.v), 0) * 1.12 || 1);
    const yOf = (v) => T + (H - T - B) * (1 - v / max);
    gridY(svg, L, W - R, [0, max / 4, max / 2, (max * 3) / 4, max], fmt, yOf);
    el('text', { x: L, y: 14, class: 'axis' }, svg).textContent = axis;
    const slot = (W - L - R) / rows.length;
    const bw = Math.min(64, slot * 0.56);
    const best = rows.find((r) => r.v != null);
    rows.forEach((r, i) => {
      const cx = L + slot * i + slot / 2;
      if (tight) el('text', { x: cx + 4, y: H - B + 16, 'text-anchor': 'end', transform: `rotate(-40 ${cx + 4} ${H - B + 16})`, class: 'lbl', fill: r.p.color }, svg).textContent = r.p.label;
      else {
        el('text', { x: cx, y: H - B + 20, 'text-anchor': 'middle', class: 'lbl', fill: r.p.color }, svg).textContent = r.p.label;
        if (r.sub) el('text', { x: cx, y: H - B + 36, 'text-anchor': 'middle', class: 'tick dim' }, svg).textContent = r.sub;
      }
      if (r.v == null) {
        el('rect', { x: cx - bw / 2, y: yOf(max * 0.12), width: bw, height: yOf(0) - yOf(max * 0.12), class: 'nobar' }, svg);
        el('text', { x: cx, y: yOf(max * 0.12) - 8, 'text-anchor': 'middle', class: 'tick dim' }, svg).textContent = slot < 90 ? 'n/a' : r.none || 'no data';
        return;
      }
      const y = yOf(r.v);
      const rect = el('rect', { x: cx - bw / 2, y, width: bw, height: Math.max(1.5, yOf(0) - y), fill: r.p.color, rx: 2, opacity: r === best ? 1 : 0.78 }, svg);
      rect.style.transformOrigin = `${cx}px ${yOf(0)}px`;
      rect.classList.add('grow');
      if (slot >= 48 || r === best) el('text', { x: cx, y: y - 8, 'text-anchor': 'middle', class: 'val' }, svg).textContent = fmt(r.v);
      hover(rect, `<b style="color:${r.p.color}">${r.p.label}</b><br>${r.tip || fmt(r.v)}`);
    });
    if (note) $(note.sel).innerHTML = note.html;
  }

  function costPerTask() {
    const h = st.task / 3600;
    const rows = shown()
      .map((p) => {
        const hr = p.hourly[st.size];
        return { p, v: hr == null ? null : hr * h, none: 'no such size', tip: hr == null ? '' : `${money(hr)} an hour × ${lenLabel(st.task)} = <b>${money(hr * h)}</b><br>billed ${p.billing}` };
      })
      .sort((a, b) => (a.v ?? Infinity) - (b.v ?? Infinity));
    bars('#c-task', rows, { fmt: money, axis: 'USD for one pod of ' + sizeLabel(st.size) + ' running ' + lenLabel(st.task) });
  }

  function monthCost() {
    const h = 0.5;
    const rows = shown()
      .map((p) => {
        const hr = p.hourly[st.size];
        if (hr == null) return { p, v: null, none: 'no such size' };
        const usage = st.month * h * hr;
        const v = Math.max(usage, p.minimum || 0);
        return { p, v, sub: p.minimum ? '$' + p.minimum + ' plan min' : 'no minimum', tip: `${st.month.toLocaleString('en-US')} pods × 30 min × ${money(hr)}/h = ${money(usage)}${v > usage ? '<br>plan minimum lifts it to ' + money(v) : ''}` };
      })
      .sort((a, b) => (a.v ?? Infinity) - (b.v ?? Infinity));
    bars('#c-month', rows, { fmt: money, axis: 'USD a month for ' + st.month.toLocaleString('en-US') + ' pods × 30 min at ' + sizeLabel(st.size) });
  }

  function reliability() {
    const rows = shown()
      .map((p) => {
        const s = p.stats.start;
        if (!s || !s.n) return { p, v: null, none: 'no starts yet' };
        return { p, v: (100 * s.ok) / s.n, sub: s.n + ' starts', tip: `${s.ok} of ${s.n} starts worked in the last 30 days` };
      })
      .sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
    bars('#c-ok', rows, { fmt: (v) => Math.round(v) + '%', axis: 'Share of pod starts that worked, last 30 days', cap: 100 });
  }

  function callTimes() {
    const box = $('#c-calls');
    const ps = shown();
    const kinds = ['start', 'run', 'stop'];
    const max = Object.fromEntries(kinds.map((k) => [k, Math.max(1, ...ps.map((p) => p.stats[k]?.p90 || p.stats[k]?.p50 || 0))]));
    box.innerHTML = '<div class="crow hd2"><span></span><span>Start</span><span>Run</span><span>Stop</span></div>' + ps
      .map(
        (p) =>
          `<div class="crow"><span class="cn" style="color:${p.color}">${p.label}</span>` +
          kinds
            .map((k) => {
              const s = p.stats[k];
              if (!s || s.p50 == null) return '<span class="cc none">no data</span>';
              return `<span class="cc" data-tip="${p.label} ${k}: median ${secs(s.p50)}, p90 ${secs(s.p90)}, ${s.n} calls"><i style="width:${Math.max(3, (s.p50 / max[k]) * 100)}%;background:${p.color}"></i><i class="p90" style="left:calc(${(s.p90 / max[k]) * 100}% - 2px)"></i><em>${secs(s.p50)}</em></span>`;
            })
            .join('') +
          '</div>',
      )
      .join('');
    $$('[data-tip]', box).forEach((n) => hover(n, n.dataset.tip));
  }

  const lenLabel = (s) => (s < 3600 ? s / 60 + ' min' : s / 3600 + ' h');

  // Sidebar
  function sidebar() {
    const q = st.q.toLowerCase();
    $('#plist').innerHTML = D.filter((p) => !q || p.label.toLowerCase().includes(q))
      .map((p) => {
        const on = !st.off.has(p.id) && (!st.workingOnly || p.working);
        return `<button type="button" class="prow${on ? '' : ' off'}" data-id="${p.id}" aria-pressed="${on}"><span class="pn">${p.label}</span><span class="pt">${p.working ? 'working' : 'untested'}</span><i style="${on ? 'background:' + p.color + ';border-color:' + p.color : 'border-color:' + p.color}"></i></button>`;
      })
      .join('');
    $$('#plist .prow').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        st.off.has(id) ? st.off.delete(id) : st.off.add(id);
        save();
        all();
      }),
    );
    $('#pcount').textContent = shown().length;
    $$('#sizes button').forEach((b) => b.classList.toggle('on', Number(b.dataset.i) === st.size));
    $('#pfacts').innerHTML = shown()
      .map(
        (p) =>
          `<div class="fact"><b style="color:${p.color}">${p.label}</b> <span>${p.regions.join(' · ')} · ${p.billing}${p.credit ? ' · ' + p.credit : ''}</span>${p.source ? ` <a href="${p.source}" rel="noopener" target="_blank">prices</a>` : ''}${!p.working && p.help ? ` <a href="${p.help}" rel="noopener" target="_blank">help test it</a>` : ''}</div>`,
      )
      .join('');
  }

  function all() {
    sidebar();
    costVsSize();
    startVsCost();
    costPerTask();
    monthCost();
    reliability();
    callTimes();
  }

  // Controls
  $$('#sizes button').forEach((b) =>
    b.addEventListener('click', () => {
      st.size = Number(b.dataset.i);
      save();
      all();
    }),
  );
  $('#working').addEventListener('change', (e) => {
    st.workingOnly = e.target.checked;
    all();
  });
  $('#find').addEventListener('input', (e) => {
    st.q = e.target.value;
    sidebar();
  });
  $('#reset').addEventListener('click', () => {
    st.off.clear();
    st.size = 1;
    st.workingOnly = false;
    $('#working').checked = false;
    save();
    all();
  });
  const seg = (sel, key, cb) =>
    $$(sel + ' button').forEach((b) =>
      b.addEventListener('click', () => {
        $$(sel + ' button').forEach((x) => x.classList.toggle('on', x === b));
        if (key === 'log') st.log = b.dataset.v === 'log';
        else st[key] = Number(b.dataset.v);
        cb();
      }),
    );
  seg('#scale', 'log', costVsSize);
  seg('#tasklen', 'task', costPerTask);
  seg('#monthn', 'month', monthCost);
  addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== $('#find')) {
      e.preventDefault();
      $('#find').focus();
    }
  });
  $('#csv').addEventListener('click', () => {
    const head = ['provider', 'status', ...SIZES.map((s) => `usd_per_hour_${s.cpu}cpu_${s.ram}gb`), 'start_p50_ms', 'start_p90_ms', 'starts_30d', 'starts_ok_30d'];
    const lines = [head.join(',')].concat(
      D.map((p) => [p.label, p.working ? 'working' : 'not run yet', ...p.hourly.map((v) => (v == null ? '' : v)), p.stats.start?.p50 ?? '', p.stats.start?.p90 ?? '', p.stats.start?.n ?? 0, p.stats.start?.ok ?? 0].join(',')),
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }));
    a.download = 'podlytics.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  // Tabs scroll to their chart and follow the scroll, and ?chart= opens one.
  const tabs = $$('.tabs a');
  tabs.forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const t = document.getElementById(a.dataset.c);
      t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', '?chart=' + a.dataset.c);
    }),
  );
  const io = new IntersectionObserver(
    (es) => {
      for (const e of es) if (e.isIntersecting) tabs.forEach((a) => a.classList.toggle('on', a.dataset.c === e.target.id));
    },
    { rootMargin: '-30% 0px -60% 0px' },
  );
  $$('section.chart').forEach((s) => io.observe(s));
  // Draw once layout has settled, and again whenever the chart column changes width.
  let lastW = $('main').clientWidth;
  all();
  new ResizeObserver(() => {
    const w = $('main').clientWidth;
    if (w === lastW) return;
    lastW = w;
    all();
  }).observe($('main'));
  const want = new URLSearchParams(location.search).get('chart');
  if (want && document.getElementById(want)) document.getElementById(want).scrollIntoView({ block: 'start' });
}

const CSS = `
:root{--bg:#0b0b0d;--panel:#101013;--line:#222228;--ink:#ececf1;--dim:#8a8a96;--faint:#55555f;--green:#3ddc84;--mono:'Geist Mono',ui-monospace,Menlo,monospace;--sans:Geist,system-ui,-apple-system,'Segoe UI',sans-serif}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;overflow-x:clip}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 var(--sans);font-feature-settings:'ss01','tnum';-webkit-font-smoothing:antialiased}
a{color:inherit}
.hd{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:22px;height:56px;padding:0 22px;border-bottom:1px solid var(--line);background:rgba(11,11,13,.92);backdrop-filter:blur(8px)}
.brand{display:flex;align-items:center;gap:9px;text-decoration:none;font:700 21px/1 var(--sans);letter-spacing:-.04em;white-space:nowrap}
.brand .mk{display:inline-grid;place-items:center;width:22px;height:22px;background:var(--green);color:#0b0b0d;font:500 10px/1 var(--mono)}
.sw{display:flex;padding:3px;gap:2px;border:1px solid var(--line);border-radius:999px;background:var(--panel);font:500 12.5px/1 var(--mono);white-space:nowrap}.sw a{display:flex;align-items:center;gap:6px;text-decoration:none;color:var(--dim);padding:7px 12px;border-radius:999px}.sw a:hover{color:var(--ink)}.sw a.on{background:var(--ink);color:var(--bg)}.sw a i{width:6px;height:6px;border-radius:50%;background:var(--faint)}.sw a.on i{background:var(--green)}
.tabs{display:flex;gap:20px;overflow-x:auto;scrollbar-width:none;flex:1;min-width:0;align-self:stretch;border-left:1px solid var(--line);padding-left:20px}
.tabs::-webkit-scrollbar{display:none}
.tabs a{display:flex;align-items:center;text-decoration:none;color:var(--dim);font-size:13.5px;white-space:nowrap;border-bottom:2px solid transparent;margin-bottom:-1px}
.tabs a:hover{color:var(--ink)}.tabs a.on{color:var(--ink);border-bottom-color:var(--green)}
.tabs .sep{width:1px;background:var(--line);margin:16px 0}
.tools{display:flex;align-items:center;gap:14px;font-size:13px;color:var(--dim);white-space:nowrap}
.tools label{display:flex;align-items:center;gap:7px;cursor:pointer}
.tools input{accent-color:var(--green)}
.ib{background:none;border:1px solid var(--line);color:var(--dim);font:12px/1 var(--mono);padding:7px 9px;cursor:pointer}.ib:hover{color:var(--ink);border-color:var(--faint)}
.app{display:grid;grid-template-columns:minmax(0,1fr) 300px}
main{min-width:0;border-right:1px solid var(--line)}
.chart{padding:22px 26px 26px;border-bottom:1px solid var(--line);scroll-margin-top:64px}
.ch{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px}
.ch h2{margin:0;font:600 17px/1.2 var(--sans)}
.ch p{margin:2px 0 0;color:var(--dim);font-size:13px}
.seg{display:flex;gap:2px;font-size:12.5px}
.seg button{background:none;border:0;border-bottom:1.5px solid transparent;color:var(--dim);padding:4px 7px;cursor:pointer;font:inherit}
.seg button:hover{color:var(--ink)}.seg button.on{color:var(--green);border-bottom-color:var(--green)}
.plot{width:100%;min-height:300px}
.plot svg{display:block;overflow:visible}
.grid{stroke:var(--line);stroke-dasharray:2 4}
.tick{fill:var(--dim);font:11.5px var(--mono)}.tick.dim{fill:var(--faint)}
.axis{fill:var(--dim);font:12px var(--sans)}
.lbl{font:600 13px var(--sans)}
.val{fill:var(--ink);font:500 12px var(--mono)}
.muted{fill:var(--dim);font:14px var(--sans)}
.leader{stroke:var(--faint);stroke-width:1}
polyline.soon{stroke-dasharray:6 5}
.series{transition:opacity .15s}
.nobar{fill:none;stroke:var(--faint);stroke-dasharray:3 3}
.grow{animation:grow .5s cubic-bezier(.2,.7,.2,1) both}
@keyframes grow{from{transform:scaleY(0)}}
.note{color:var(--dim);font-size:12.5px;margin:10px 0 0}
#c-calls{display:grid;gap:10px;margin-top:12px}
.crow{display:grid;grid-template-columns:110px repeat(3,minmax(0,1fr));gap:10px;align-items:center}.crow.hd2{font:500 11px var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--faint)}
.cn{font-weight:600;letter-spacing:-.01em}
.cc{position:relative;height:32px;border:1px solid var(--line);border-radius:6px;background:var(--panel);overflow:hidden}
.cc i{position:absolute;left:0;top:0;bottom:0;opacity:.38;border-radius:0 4px 4px 0}
.cc i.p90{width:2px;background:var(--ink);opacity:.7}
.cc em{position:relative;display:flex;justify-content:flex-end;font:500 12.5px/32px var(--mono);font-style:normal;padding:0 10px;color:var(--ink)}.cc em span{display:none}
.cc.none{color:var(--faint);font:12px/32px var(--mono);padding-right:10px;text-align:right}
aside{position:sticky;top:56px;align-self:start;max-height:calc(100vh - 56px);overflow:auto;padding:18px 18px 24px}
.ah{display:flex;justify-content:space-between;align-items:center}
.ah h3{margin:0;font:600 16px/1 var(--sans)}.ah h3 small{color:var(--dim);font-weight:400;margin-left:6px;font-size:13px}
.find{display:flex;align-items:center;gap:8px;border:1px solid var(--line);margin:14px 0 18px;padding:0 10px}
.find input{flex:1;min-width:0;background:none;border:0;color:var(--ink);font:13px var(--sans);padding:9px 0;outline:none}
.find kbd{color:var(--faint);font:11px var(--mono)}
.sub{display:flex;justify-content:space-between;align-items:baseline;margin:16px 0 8px;font-weight:600;font-size:13px}
#sizes{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12.5px}
#sizes button{background:none;border:0;padding:2px 0;color:var(--dim);cursor:pointer;font:inherit}
#sizes button.on{color:var(--green)}#sizes button:hover{color:var(--ink)}
.prow{display:grid;grid-template-columns:minmax(0,1fr) auto 10px;gap:10px;align-items:center;width:100%;background:none;border:0;color:var(--ink);font:14px var(--sans);padding:7px 2px;cursor:pointer;text-align:left}
.prow:hover{background:var(--panel)}
.prow .pt{font:10.5px var(--mono);text-transform:uppercase;letter-spacing:.05em;color:var(--faint)}
.prow i{width:9px;height:9px;border-radius:50%;border:1.5px solid}
.prow.off{color:var(--faint)}
.fact{font-size:12.5px;color:var(--dim);margin:0 0 8px}.fact b{font-weight:600}.fact a{color:var(--dim)}
.ft{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 22px;border-top:1px solid var(--line);color:var(--dim);font-size:12.5px}
.ft a{color:var(--ink);text-decoration:none}.ft a:hover{text-decoration:underline}
#tip{position:fixed;z-index:20;pointer-events:none;background:#17171c;border:1px solid var(--faint);padding:8px 10px;font:12.5px/1.45 var(--sans);max-width:280px;box-shadow:0 8px 24px rgba(0,0,0,.5)}
@media (max-width:1000px){.app{grid-template-columns:minmax(0,1fr)}main{border-right:0}aside{position:static;max-height:none;order:-1;border-bottom:1px solid var(--line)}.tools label span{display:none}}
@media (max-width:600px){.about,.tools{display:none}.hd{gap:12px;padding:0 16px}.tabs{padding-left:12px;gap:14px}.chart{padding:18px 16px}aside{padding:16px}.crow{grid-template-columns:minmax(0,1fr)}.crow.hd2{display:none}.ft{padding:12px 16px}}
@media (prefers-reduced-motion:reduce){.grow{animation:none}}
`;

const seg = (id, items, on) => `<div class="seg" id="${id}">${items.map(([v, l]) => `<button type="button" data-v="${v}"${String(v) === String(on) ? ' class="on"' : ''}>${esc(l)}</button>`).join('')}</div>`;

const CHARTS = [
  ['size', 'Cost vs size'],
  ['speed', 'Start time vs cost'],
  ['|'],
  ['task', 'Cost per task'],
  ['month', 'Month of pods'],
  ['|'],
  ['ok', 'Starts that worked'],
  ['calls', 'Time per call'],
];

export function podlyticsPage(data) {
  const measuredAny = data.some((p) => p.stats.start?.n);
  const safe = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>podlytics: sandbox providers compared</title>
<meta name="description" content="Price, start time and success rate of agent pod providers (boat, Daytona, E2B, Isorun), from list prices and fleet's own measured calls.">
<meta name="theme-color" content="#0b0b0d">
${PL_FONTS}
<style>${CSS}</style>
</head>
<body>
${FLISK_BAR}
<header class="hd">
<a class="brand" href="/" title="fleet"><span class="mk">&gt;_</span><span>fleet</span></a>
<nav class="sw" aria-label="Fleet products"><a href="/"><i></i>fleet</a><a class="on" href="/podlytics" aria-current="page"><i></i>podlytics</a></nav>
<nav class="tabs" aria-label="Charts">${CHARTS.map(([id, l]) => (id === '|' ? '<span class="sep"></span>' : `<a href="?chart=${id}" data-c="${id}"${id === 'size' ? ' class="on"' : ''}>${esc(l)}</a>`)).join('')}</nav>
<div class="tools"><label><input type="checkbox" id="working"><span>Working only</span></label><button type="button" class="ib" id="csv" title="Download the data as CSV">CSV ↓</button></div>
</header>
<div class="app">
<main>
<section class="chart" id="size"><div class="ch"><div><h2>Cost vs size</h2><p>List price per hour for each pod size. Dashed line: provider not yet run for real through fleet.</p></div>${seg('scale', [['lin', 'Linear'], ['log', 'Log']], 'lin')}</div><div class="plot" id="c-size"></div></section>
<section class="chart" id="speed"><div class="ch"><div><h2>Start time vs cost</h2><p>Median time from the start call to a running pod, measured on real starts through fleet. The faint line runs to p90.</p></div></div><div class="plot" id="c-speed"></div><p class="note" id="speed-missing"></p></section>
<section class="chart" id="task"><div class="ch"><div><h2>Cost per task</h2><p>One agent task on one pod, billed by the second.</p></div>${seg('tasklen', [[300, '5 min'], [1800, '30 min'], [3600, '1 h'], [14400, '4 h']], 1800)}</div><div class="plot" id="c-task"></div></section>
<section class="chart" id="month"><div class="ch"><div><h2>Month of pods</h2><p>Pods of 30 minutes each, with each provider's plan minimum. <a href="/pricing">Full calculator</a> for plan limits and peaks.</p></div>${seg('monthn', [[100, '100'], [1000, '1k'], [10000, '10k'], [100000, '100k']], 1000)}</div><div class="plot" id="c-month"></div></section>
<section class="chart" id="ok"><div class="ch"><div><h2>Starts that worked</h2><p>Share of pod starts through fleet that gave a running pod, last 30 days, every account.</p></div></div><div class="plot" id="c-ok"></div></section>
<section class="chart" id="calls"><div class="ch"><div><h2>Time per call</h2><p>Median start, run and stop times through fleet. The thin mark is p90.</p></div></div><div id="c-calls"></div></section>
</main>
<aside aria-label="Providers">
<div class="ah"><h3>Providers<small id="pcount"></small></h3><button type="button" class="ib" id="reset" title="Show every provider">↺</button></div>
<label class="find"><span aria-hidden="true">⌕</span><input id="find" placeholder="Find providers" aria-label="Find providers"><kbd>/</kbd></label>
<div class="sub"><span>Pod size</span><span style="color:var(--faint);font-weight:400;font-size:12px">vCPU / GB</span></div>
<div id="sizes">${PL_SIZES.map((s, i) => `<button type="button" data-i="${i}">${s.cpu}/${s.ram}</button>`).join('')}</div>
<div class="sub"><span>Sandbox providers</span><span style="color:var(--faint);font-weight:400;font-size:12px">click to hide</span></div>
<div id="plist"></div>
<div class="about"><div class="sub"><span>About them</span></div>
<div id="pfacts"></div></div>
<p class="note">${measuredAny ? 'Speed and success: every pod call through fleet in the last 30 days, all accounts summed.' : 'No pod calls measured yet. Start one and it shows up here.'} Free credits are not counted.</p>
</aside>
</div>
<div class="ft"><span>Prices from each provider's own page · speed from fleet's call log · <a href="https://github.com/flisk-sh/fleet">source</a></span><a href="/console?section=try">Try a pod on fleet →</a></div>
<div id="tip" hidden></div>
<script>var __name=function(f){return f};(${client.toString()})(${safe(data)},${safe(PL_SIZES)});</script>
</body>
</html>`;
}
