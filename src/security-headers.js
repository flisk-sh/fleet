// Baseline security headers for every response of this Worker (HTML, assets, API, errors).
// A header a handler already set is kept (a stricter value stays); only gaps are filled.
// Strict-Transport-Security gets includeSubDomains and the CSP gets frame-ancestors when they lack it.

const DEFAULTS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'SAMEORIGIN',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

export function withSecurityHeaders(response, { permissionsPolicy } = {}) {
  // A WebSocket upgrade carries the socket on the Response itself; leave it untouched.
  if (response.status === 101 || response.webSocket) return response;
  // Copy into a new Response: the headers of a fetched or redirect Response can be immutable.
  const out = new Response(response.body, response);
  const h = out.headers;
  for (const [name, value] of Object.entries(DEFAULTS)) {
    if (h.has(name)) continue;
    h.set(name, name === 'permissions-policy' && permissionsPolicy ? permissionsPolicy : value);
  }
  if (!/includesubdomains/i.test(h.get('strict-transport-security'))) {
    h.set('strict-transport-security', `${h.get('strict-transport-security')}; includeSubDomains`);
  }
  const csp = h.get('content-security-policy');
  if (!csp) h.set('content-security-policy', "frame-ancestors 'self' https://analytics.flisk.si");
  else if (!/(^|;)\s*frame-ancestors\b/i.test(csp)) h.set('content-security-policy', `${csp.replace(/;\s*$/, '')}; frame-ancestors 'self' https://analytics.flisk.si`);
  return out;
}
