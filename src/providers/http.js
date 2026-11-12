// One fetch helper for every adapter: JSON in, JSON out, and an error that names the HTTP status and the provider's own message.
export async function call(fetchImpl, url, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetchImpl(url, {
    method,
    headers: { accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
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
