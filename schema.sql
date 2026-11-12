-- fleet storage on D1. Never a provider key, never a provider's access token.
CREATE TABLE IF NOT EXISTS keys (
  hash TEXT PRIMARY KEY,        -- SHA-256 of the fleet key
  id TEXT NOT NULL,             -- first 12 characters of the hash, shown and used to revoke
  login TEXT NOT NULL,          -- GitHub login
  name TEXT NOT NULL,
  hint TEXT NOT NULL DEFAULT '',
  created TEXT,
  last_used TEXT
);
CREATE INDEX IF NOT EXISTS keys_login ON keys (login);

CREATE TABLE IF NOT EXISTS pods (
  n INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL,
  ref TEXT,                     -- pod id cut at the first "~"; null for a failed start
  provider TEXT,
  cpu INTEGER, ram REAL, price REAL,
  started TEXT NOT NULL,
  stopped TEXT, gone TEXT,
  moved_from TEXT NOT NULL DEFAULT '[]',   -- JSON list of providers that failed first
  failed_start TEXT                        -- JSON list of {provider, error} when every provider failed
);
CREATE INDEX IF NOT EXISTS pods_login_started ON pods (login, started);
CREATE INDEX IF NOT EXISTS pods_login_ref ON pods (login, ref);

-- Usage log: one row per pod call (start, run, stop), from the API, MCP or Try a pod.
CREATE TABLE IF NOT EXISTS calls (
  n INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,           -- start, run or stop
  provider TEXT,
  ref TEXT,                     -- pod id cut at the first "~"
  status INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS calls_login_at ON calls (login, at);

-- Each account's own limits, set in the cabinet. Missing row = the defaults.
CREATE TABLE IF NOT EXISTS limits (
  login TEXT PRIMARY KEY,
  pods_per_day INTEGER NOT NULL,
  max_cpu INTEGER NOT NULL,
  max_ram REAL NOT NULL,
  lifetime_min INTEGER NOT NULL,
  updated TEXT NOT NULL
);

-- Provider keys a user connected in the cabinet, encrypted with PROVIDER_KEYS_SECRET (src/vault.js). Never in plain text.
CREATE TABLE IF NOT EXISTS provider_keys (
  login TEXT NOT NULL,
  provider TEXT NOT NULL,
  sealed TEXT NOT NULL,          -- base64(iv || AES-GCM ciphertext)
  hint TEXT NOT NULL,            -- last 4 characters, to tell keys apart
  created TEXT NOT NULL,
  PRIMARY KEY (login, provider)
);
