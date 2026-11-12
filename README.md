# fleet

One API for every agent pod. A pod is a Linux machine your agent can run commands in.

Fleet starts each pod on the cheapest sandbox provider you have a key for, and moves to the next one when a provider fails. You bring your own provider accounts: connect each one once in the cabinet (fleet keeps the key encrypted), or send its key with each call.

Status: beta, live at https://fleet.flisk.si. Sign in with GitHub to reach the cabinet: up to 10 named fleet keys, your pods, an overview, providers and docs. The four adapters are written from the providers' public API docs and tested against recorded-style fake replies only. None has been run against a real provider account yet.

## Providers

| Provider | Header for your key | List price, 2 vCPU / 4 GB, per hour | Source |
|---|---|---|---|
| boat | `X-Boat-Key` | $0.018 | https://docs.boat.dev/pricing |
| Isorun | `X-Isorun-Key` | $0.110 | https://docs.isorun.ai/getting-started/pricing |
| E2B | `X-E2B-Key` | $0.166 | https://e2b.dev/pricing |
| Daytona | `X-Daytona-Key` | $0.166 | https://www.daytona.io/pricing |

Prices were read on 2026-11-12. You pay each provider directly on your own account; fleet adds nothing.

## API

Send your fleet key as `Authorization: Bearer fleet_...`, plus one header per provider you hold an account at.

```bash
curl -X POST https://fleet.flisk.si/v1/pods \
  -H "Authorization: Bearer fleet_..." \
  -H "X-E2B-Key: ..." -H "X-Daytona-Key: ..." \
  -d '{"cpu":2,"ram":4}'
```

| Call | Body | Returns |
|---|---|---|
| `POST /v1/pods` | `cpu`, `ram`, `provider?`, `order?` | `id`, `provider`, `pricePerHour`, `failed` |
| `POST /v1/pods/:id/run` | `command` | `stdout`, `stderr`, `exitCode` |
| `DELETE /v1/pods/:id` | | `stopped` |
| `GET /v1/prices` | | price table, no key needed |

- Without `provider` or `order`, fleet sorts your providers by list price for the size you ask for.
- `failed` lists the providers that were tried before the one that started the pod.
- A pod id holds the provider name and the provider's own id. For E2B it also holds that pod's access token, so treat pod ids as private.

## MCP

`POST /mcp` is an MCP server with three tools: `pod_create`, `pod_run`, `pod_stop`.

```json
{ "mcpServers": { "fleet": {
    "type": "http",
    "url": "https://fleet.flisk.si/mcp",
    "headers": { "Authorization": "Bearer fleet_...", "X-E2B-Key": "..." }
} } }
```

## What fleet stores

In Cloudflare D1 (`schema.sql`), sized for the free plan: every write is one row, every read uses an index.

- A SHA-256 hash of each fleet key, its name and when it was created and last used (written at most once a day).
- Pod facts for the cabinet: provider, size, price, start and stop times, and which providers failed first. The pod id is cut at the first `~`, so E2B's access token is never stored.
- Provider keys you connect in the cabinet, encrypted with AES-GCM under the `PROVIDER_KEYS_SECRET` secret (`src/vault.js`); only the last 4 characters are kept readable, to tell keys apart. Disconnect deletes the key. Keys sent in headers are never stored.
- Sessions are signed cookies, not stored.

## Free-plan guards

- At most 120 API calls a minute per account, counted in Cloudflare's Cache API, so the limit itself writes nothing.
- At most 300 pod starts a day per account.

## Demo pods

Send `X-Demo-Key: demo` (or `ttl=30` to make the pod die after 30 seconds) and fleet answers like a provider, with a simulated pod and no machine. It lets anyone try the flow without an account, and `scripts/synthetic.mjs` uses it to run 1 to 10 synthetic agents against a live fleet. It never shows up in the price table and proves nothing about real providers.

## Limits to know

- boat: fixed machine types (fleet picks the smallest that fits), needs a boat plan, machines in Europe only.
- E2B: memory comes from the E2B template, not from the request.
- Daytona: at most 4 vCPU and 8 GB a pod; output comes back as one stream, with no separate stderr.
- Pods stop by themselves after about an hour on Isorun, E2B and Daytona if you forget them.

## Run it locally

Needs [Bun](https://bun.sh).

```bash
bun test
```

```bash
bun scripts/dev.mjs
```

The dev server listens on http://localhost:8799 with an in-memory store. "Console" there skips GitHub and signs you in as `local-dev`.

`bun scripts/simulate.mjs` drives fleet's routing against a simulated provider (start delay, time to live) to measure 1 to 10 pods and what a caller sees when a pod dies. It needs no provider account.

## Add a provider

Add one file in `src/providers/` that exports `label`, `keyHeader`, `priceSource`, `price(size)`, `create`, `run` and `stop`, register it in `src/providers/index.js`, and add tests with fake replies in `test/providers.test.js`.

## License

MIT
