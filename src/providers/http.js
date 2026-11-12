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
    const msg = data?.message || data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || text.slice(0, 200);
    const err = new Error(`HTTP ${res.status}${msg ? `: ${msg}` : ''}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
