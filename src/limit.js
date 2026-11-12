// Rate limits that cost no storage writes: a counter per login per minute in Cloudflare's Cache API.
// Counts are per data centre and not exact, which is enough to stop one agent in a loop from using up
// the account's 100,000 requests a day (shared by every Flisk site on the Workers Free plan).
export const PER_MINUTE = 120;
export const PODS_PER_DAY = 300;

export async function overMinuteLimit(login, { cache = globalThis.caches?.default, now = Date.now(), limit = PER_MINUTE } = {}) {
  if (!cache) return false;
  const url = `https://fleet-limit.invalid/${encodeURIComponent(login)}/${Math.floor(now / 60000)}`;
  try {
    const hit = await cache.match(url);
    const count = hit ? Number(await hit.text()) || 0 : 0;
    if (count >= limit) return true;
    await cache.put(url, new Response(String(count + 1), { headers: { 'cache-control': 'max-age=120' } }));
  } catch {}
  return false;
}
