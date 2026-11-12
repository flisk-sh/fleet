// Local preview without wrangler: serves the Worker with Bun and an in-memory D1 stand-in.
// DEV_LOGIN skips GitHub: /auth/start signs you in as that login.
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { fakeD1 } from '../test/d1.js';

const DB = fakeD1(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
const port = Number(process.env.PORT || 8799);
const env = { DB, SESSION_SECRET: 'dev-only-secret', DEV_LOGIN: process.env.DEV_LOGIN || 'local-dev', PUBLIC_ORIGIN: `http://localhost:${port}` };
Bun.serve({ port, fetch: (request) => worker.fetch(request, env) });
console.log(`fleet on http://localhost:${port}`);
