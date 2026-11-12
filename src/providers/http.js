// Cloudflare Workers send no User-Agent, and some providers' firewalls (Blaxel's CloudFront: 403 "request blocked", seen live
// 2026-11-12) refuse a request without one. Every call fleet makes to a provider says who it is.
export const UA = 'fleet/0.2 (+https://fleet.flisk.si)';

// One fetch helper for every adapter: JSON in, JSON out, and an error that names the HTTP status and the provider's own message.
export async function call(fetchImpl, url, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetchImpl(url, {
    method,
    headers: { 'user-agent': UA, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.message || data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || plainText(text);
    const err = new Error(`HTTP ${res.status}${msg ? `: ${msg}` : ''}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// A provider's firewall or CDN can answer with a whole HTML page. Keep what a person can read: the page title, else its visible
// text, else a plain note, never the markup.
export function plainText(text) {
  const s = String(text || '');
  if (!/^\s*<\s*(!doctype|html|head|body)/i.test(s)) return s.slice(0, 200);
  const title = s.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
  const visible = s
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const shown = (title || visible).slice(0, 120);
  return `an HTML error page${/[a-z0-9]/i.test(shown) ? ` ("${shown}")` : ''}`;
}

// Errors saved before plainText existed hold a clipped HTML page in the middle of the message. Cleans one for display.
export function tidyError(text) {
  const s = String(text || '');
  const at = s.search(/<\s*(!doctype|html)/i);
  return at < 0 ? s : s.slice(0, at) + plainText(s.slice(at));
}

export const sleep =(ms) => new Promise((r) => setTimeout(r, ms));
