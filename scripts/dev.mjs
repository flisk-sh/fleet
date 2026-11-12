// Local preview without wrangler: serves the Worker with Bun and an in-memory key store.
// DEV_LOGIN skips GitHub: /auth/start hands out a key for that login.
import worker from '../src/index.js';

const store = new Map();
const KV = {
  get: async (k) => store.get(k) ?? null,
  put: async (k, v) => void store.set(k, v),
  delete: async (k) => void store.delete(k),
};
const port = Number(process.env.PORT || 8799);
const env = { KV, DEV_LOGIN: process.env.DEV_LOGIN || 'local-dev', PUBLIC_ORIGIN: `http://localhost:${port}` };
Bun.serve({ port, fetch: (request) => worker.fetch(request, env) });
console.log(`fleet on http://localhost:${port}`);
