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
