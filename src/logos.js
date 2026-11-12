// Provider logo marks: a glossy rounded tile with the provider's initials, one colour pair per provider.
// Inline SVG, no image files and no requests to the provider's own site, so pages stay fast and offline-safe.
const PAIRS = {
  boat: ['#ff8a5c', '#e0462b'],
  isorun: ['#6fa8ff', '#3b5bdb'],
  e2b: ['#ffc94d', '#f08c00'],
  daytona: ['#3ddc84', '#0ca678'],
  hopx: ['#c792ea', '#7048e8'],
  runloop: ['#5ce1e6', '#1098ad'],
  blaxel: ['#f78fb3', '#d6336c'],
  vercel: ['#e0e0e8', '#868e96'],
  sprites: ['#b8e986', '#74b816'],
  morph: ['#a3a3ff', '#4c6ef5'],
  upstash: ['#00e9a3', '#00a878'],
  demo: ['#9aa0a6', '#5f6368'],
};

const FALLBACK = ['#8ab4f8', '#4285f4'];

// Two letters from the label: "Fly Sprites" -> "FS", "Upstash Box" -> "UB", "e2b" -> "E2".
export function initials(label = '') {
  const words = String(label).replace(/\(.*?\)/g, '').trim().split(/[\s-]+/).filter(Boolean);
  const s = words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2);
  return s.toUpperCase();
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Unique gradient ids per id, so several logos can sit on one page.
export function logoSvg(id, label = id, px = 34) {
  const [a, b] = PAIRS[id] || FALLBACK;
  const gid = `lg-${String(id).replace(/[^a-z0-9]/gi, '')}`;
  return (
    `<svg class="plogo" width="${px}" height="${px}" viewBox="0 0 40 40" role="img" aria-label="${esc(label)} logo" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
    `<rect x="1" y="1" width="38" height="38" rx="9" fill="url(#${gid})"/>` +
    `<rect x="1.5" y="1.5" width="37" height="18" rx="8.5" fill="#fff" opacity=".14"/>` +
    `<text x="20" y="26" text-anchor="middle" font-family="Geist Mono, ui-monospace, monospace" font-size="${initials(label).length > 1 ? 14 : 18}" font-weight="700" fill="#0b0b0d">${esc(initials(label))}</text>` +
    `</svg>`
  );
}
