# fleet

One API for every agent pod. A pod is a Linux machine your agent can run commands in.

Fleet starts each pod on the cheapest sandbox provider you have a key for, and moves to the next one when a provider fails. You bring your own provider accounts: connect each one once in the cabinet (fleet keeps the key encrypted), or send its key with each call.

Status: beta, live at https://fleet.flisk.si. Sign in with GitHub to reach the cabinet: up to 10 named fleet keys, your pods, an overview, providers and docs. Daytona, Blaxel and Upstash Box have been run end to end on a real account. The other eight adapters are written from the providers' public API docs and tested against fake replies only.

## Providers

| Provider | Status | Header for your key | List price, 2 vCPU / 4 GB, per hour | Source |
|---|---|---|---|---|
| Daytona | **Working**: run end to end on a real account on 2026-11-12 | `X-Daytona-Key` | $0.166 | https://www.daytona.io/pricing |
| Upstash Box | **Working**: run end to end on a real account on 2026-11-12 | `X-Upstash-Key` | $0.100 (active CPU) | https://upstash.com/docs/box/overall/pricing |
| Blaxel | **Working**: run end to end on a real account on 2026-11-12 | `X-Blaxel-Key`: `<workspace>:<API key>` | $0.166 | https://blaxel.ai/pricing |
| boat | **Blocked**: needs a card (7-day trial, then $20 a month), [help wanted](https://github.com/flisk-sh/fleet/issues/1) | `X-Boat-Key`: `<key>[:<organization>]` | $0.018 | https://docs.boat.dev/pricing |
| Isorun | Untested, [help wanted](https://github.com/flisk-sh/fleet/issues/2) | `X-Isorun-Key` | $0.110 | https://docs.isorun.ai/getting-started/pricing |
| E2B | Untested, [help wanted](https://github.com/flisk-sh/fleet/issues/3) | `X-E2B-Key` | $0.166 | https://e2b.dev/pricing |
| Hopx | **Blocked**: provider down (API error 526 since 2026-11-12), [help wanted](https://github.com/flisk-sh/fleet/issues/4) | `X-Hopx-Key` | $0.166 | https://hopx.ai/pricing |
| Runloop | **Blocked**: invitation only (waitlist: support@runloop.ai), [help wanted](https://github.com/flisk-sh/fleet/issues/4) | `X-Runloop-Key` | $0.317 | https://www.runloop.ai/pricing |
| Vercel Sandbox | Untested, [help wanted](https://github.com/flisk-sh/fleet/issues/4) | `X-Vercel-Key` (`<token>:<project id>[:<team id>]`) | $0.341 at most (CPU billed only while busy) | https://vercel.com/docs/sandbox/pricing |
| Fly Sprites | **Blocked**: needs a card on accounts whose Fly trial ended, [help wanted](https://github.com/flisk-sh/fleet/issues/4) | `X-Sprites-Key` | $0.164 at most (billed on use) | https://fly.io/pricing |
| Morph | Untested, [help wanted](https://github.com/flisk-sh/fleet/issues/4) | `X-Morph-Key` | $0.100 | https://cloud.morph.so/web/subscribe |

Most providers need one API key. Three need more, joined with colons in one header value (the cabinet's Providers page has one input per part): Blaxel `workspace:key`, Vercel `token:projectId[:teamId]`, boat `key[:organization]`.

Working means fleet has started, run commands and files in, and stopped pods on a real account of that provider. **Untested** providers are built from public docs and pass tests against fake replies, so they should work; they wait for a test on a real account (`bun scripts/real-check.mjs`). **Blocked** providers cannot be tested yet: the provider is down, asks for a card, or is invitation only. Have an account at one of them, or want another provider ([#4](https://github.com/flisk-sh/fleet/issues/4))? Help is welcome.

Prices were read on 2026-11-12. You pay each provider directly on your own account; fleet adds nothing.

Not added, because fleet is a Worker that only speaks plain HTTP: Modal (no public HTTP API, its SDKs use gRPC), Northflank (commands only over an HTTP/2 or WebSocket stream), CodeSandbox (its HTTP exec is undocumented) and Cloudflare Sandbox (each user would deploy their own Worker).

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
| `POST /v1/pods/:id/run` | `command`, `cwd?`, `env?`, `timeout?` | `stdout`, `stderr`, `exitCode`, `timedOut` (with `timeout`) |
| `PUT /v1/pods/:id/files` | `path`, `content`, `encoding?` (`utf8` or `base64`) | `path`, `bytes` |
| `GET /v1/pods/:id/files?path=` | | `path`, `bytes`, `encoding`, `content` |
| `GET /v1/pods?status=` | | `pods`: id, provider, size, price, times, status |
| `DELETE /v1/pods/:id` | | `stopped` |
| `GET /v1/prices` | | price table, no key needed |

- Without `provider` or `order`, fleet sorts your providers by list price for the size you ask for.
- `failed` lists the providers that were tried before the one that started the pod.
- `cwd`, `env`, `timeout` and the file calls are shell commands fleet builds on top of run, so they work the same on every provider with no extra adapter code. Files move at most 256 KB a call. A timed-out command ends with exit code 124 and `timedOut: true`.
- `GET /v1/pods` needs only the fleet key. E2B ids in the list lack the access token, so keep the id `POST /v1/pods` gave you to run commands there.
- A pod id holds the provider name and the provider's own id. For E2B it also holds that pod's access token, so treat pod ids as private.

## MCP

`POST /mcp` is an MCP server with six tools: `pod_create`, `pod_run`, `pod_write_file`, `pod_read_file`, `pod_list`, `pod_stop`.

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

## Icons and link previews

`assets/` holds the sources (the icon from [flisk-emoji](https://github.com/flisk-sh/flisk-emoji), and `og.html`, the 1200 x 630 preview card). `bun scripts/build-assets.mjs` turns them into `src/assets.js` (needs `rsvg-convert` and Google Chrome), which the Worker serves as `/icon.svg`, `/favicon.ico`, `/apple-touch-icon.png` and `/og.png`. `src/seo.js` holds the page list behind the head tags, `/sitemap.xml`, `/robots.txt` and `/llms.txt`.

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
