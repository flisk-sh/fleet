// Local preview without wrangler: serves the Worker with Bun and an in-memory key store.
// DEV_LOGIN skips GitHub: /auth/start signs you in as that login. Cookies are marked Secure, which browsers accept on localhost.
import worker from '../src/index.js';

const store = new Map();
const KV = {
  get: async (k) => store.get(k) ?? null,
  put: async (k, v) => void store.set(k, v),
  delete: async (k) => void store.delete(k),
};
const port = Number(process.env.PORT || 8799);
const env = { KV, SESSION_SECRET: 'dev-only-secret', DEV_LOGIN: process.env.DEV_LOGIN || 'local-dev', PUBLIC_ORIGIN: `http://localhost:${port}` };
Bun.serve({ port, fetch: (request) => worker.fetch(request, env) });
console.log(`fleet on http://localhost:${port}`);
