# AGENTS.md

Fleet is a Cloudflare Worker (`src/index.js`) with a D1 database named `fleet`. It stores users' provider keys encrypted and runs commands on their pods, so a wrong change is costly.

## Check before you push

- `bun test` (no install step; the Worker has no dependencies).
- `bunx wrangler@4 deploy --dry-run --outdir dist-worker` bundles the Worker without deploying. CI runs both.

## Never run without asking the user

- Changing or rotating `PROVIDER_KEYS_SECRET` (`wrangler secret put PROVIDER_KEYS_SECRET`): every stored provider key becomes unreadable and every user has to reconnect. See the comment in `wrangler.toml`.
- `wrangler d1 execute fleet --remote`: it changes the live schema and data. Edit `schema.sql` and tell the user which statement to run.
- `wrangler deploy` and any other `wrangler secret` command. Deploys are the user's call.

`.claude/settings.json` makes Claude Code ask before these.

## Other rules

- Never write a provider key, a provider token or a fleet key to the database, a log or a test fixture. Only SHA-256 hashes of fleet keys are stored.
- A change to the tools in `src/mcp.js` needs its annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`) kept right.
