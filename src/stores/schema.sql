-- Postgres schema for createPostgresStore(). JSONB keeps the TypeScript
-- records intact; the key columns exist for lookup and unique constraints.

CREATE TABLE IF NOT EXISTS eve_vault_clients (
  client_id TEXT PRIMARY KEY,
  body JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS eve_vault_sessions (
  id TEXT PRIMARY KEY,
  body JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS eve_vault_nonces (
  id TEXT PRIMARY KEY,
  body JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS eve_vault_codes (
  code_hash TEXT PRIMARY KEY,
  body JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS eve_vault_access_tokens (
  token_hash TEXT PRIMARY KEY,
  body JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS eve_vault_refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  body JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS eve_vault_actions (
  id TEXT PRIMARY KEY,
  body JSONB NOT NULL
);
