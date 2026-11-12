// Provider logos: the provider's real mark (see logo-images.js), or a plain letter tile for providers with no official mark.
import { LOGO_IMAGES } from './logo-images.js';

// Some marks are white on transparent, so they sit on a dark tile.
const TILE = { isorun: '#ecebe6', freestyle: '#ecebe6', tensorlake: '#ecebe6', langsmith: '#ecebe6', blaxel: '#ecebe6', e2b: '#ecebe6', vercel: '#ecebe6', upstash: '#ecebe6' };
export const TILE_COLOR = (id) => TILE[id] || '';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Two letters from the label: "Fly Sprites" -> "FS", "Upstash Box" -> "UB", "e2b" -> "E2".
export function initials(label = '') {
  const words = String(label).replace(/\(.*?\)/g, '').trim().split(/[\s-]+/).filter(Boolean);
  const s = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2);
  return s.toUpperCase();
}

export function logoSvg(id, label = id, px = 34) {
  const alt = `${esc(label)} logo`;
  const src = LOGO_IMAGES[id];
  if (src) {
    const bg = TILE[id] ? `background:${TILE[id]};` : '';
    return `<img class="plogo" src="${src}" width="${px}" height="${px}" alt="${alt}" style="${bg}border-radius:8px;object-fit:contain;padding:${TILE[id] ? 4 : 0}px">`;
  }
  return (
    `<span class="plogo" role="img" aria-label="${alt}" style="display:inline-grid;place-items:center;width:${px}px;height:${px}px;border-radius:8px;background:#e7e5df;color:#0b0b0d;font:600 ${Math.round(px * 0.38)}px/1 ui-monospace,monospace">${esc(initials(label))}</span>`
  );
}
