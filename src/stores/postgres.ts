import type { KitStore } from "../store.js";
import type {
  AccessTokenRecord,
  AuthSession,
  AuthorizationCodeRecord,
  NonceRecord,
  PreparedAction,
  RefreshTokenRecord,
  RegisteredClient,
} from "../types.js";

/**
 * Minimal query surface so this adapter does not import `pg`.
 * Pass `pool` from `pg`, or any client with a compatible `query` method.
 */
export const POSTGRES_SCHEMA = `
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
`;

export type SqlQueryClient = {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

export function createPostgresStore(client: SqlQueryClient): KitStore {
  return {
    async putClient(clientRow) {
      await client.query(
        `INSERT INTO eve_vault_clients (client_id, body) VALUES ($1, $2::jsonb)
         ON CONFLICT (client_id) DO UPDATE SET body = EXCLUDED.body`,
        [clientRow.clientId, JSON.stringify(clientRow)],
      );
    },
    async getClient(clientId) {
      return one<RegisteredClient>(client, "eve_vault_clients", "client_id", clientId);
    },
    async putAuthSession(session) {
      await upsert(client, "eve_vault_sessions", "id", session.id, session);
    },
    async getAuthSession(id) {
      return one<AuthSession>(client, "eve_vault_sessions", "id", id);
    },
    async completeAuthSession(id, completedAt) {
      return claimJson<AuthSession>(
        client,
        "eve_vault_sessions",
        "id",
        id,
        "completedAt",
        completedAt,
      );
    },
    async putNonce(record) {
      await upsert(client, "eve_vault_nonces", "id", record.id, record);
    },
    async getNonce(id) {
      return one<NonceRecord>(client, "eve_vault_nonces", "id", id);
    },
    async consumeNonce(id, consumedAt) {
      return claimJson<NonceRecord>(client, "eve_vault_nonces", "id", id, "consumedAt", consumedAt);
    },
    async putCode(codeHash, record) {
      await upsert(client, "eve_vault_codes", "code_hash", codeHash, record);
    },
    async consumeCode(codeHash) {
      const record = await one<AuthorizationCodeRecord>(client, "eve_vault_codes", "code_hash", codeHash);
      if (!record) return undefined;
      await client.query(`DELETE FROM eve_vault_codes WHERE code_hash = $1`, [codeHash]);
      return record;
    },
    async putAccessToken(record) {
      await upsert(client, "eve_vault_access_tokens", "token_hash", record.tokenHash, record);
    },
    async getAccessToken(tokenHash) {
      return one<AccessTokenRecord>(client, "eve_vault_access_tokens", "token_hash", tokenHash);
    },
    async revokeAccessToken(tokenHash, revokedAt) {
      const record = await one<AccessTokenRecord>(client, "eve_vault_access_tokens", "token_hash", tokenHash);
      if (record && record.revokedAt === undefined) {
        record.revokedAt = revokedAt;
        await upsert(client, "eve_vault_access_tokens", "token_hash", tokenHash, record);
      }
    },
    async putRefreshToken(record) {
      await upsert(client, "eve_vault_refresh_tokens", "token_hash", record.tokenHash, record);
    },
    async getRefreshToken(tokenHash) {
      return one<RefreshTokenRecord>(client, "eve_vault_refresh_tokens", "token_hash", tokenHash);
    },
    async rotateRefreshToken(tokenHash, rotatedAt) {
      return claimJson<RefreshTokenRecord>(
        client,
        "eve_vault_refresh_tokens",
        "token_hash",
        tokenHash,
        "rotatedAt",
        rotatedAt,
      );
    },
    async revokeRefreshFamily(familyId, revokedAt) {
      const refreshRows = await client.query(
        `SELECT body FROM eve_vault_refresh_tokens WHERE body->>'familyId' = $1`,
        [familyId],
      );
      for (const row of refreshRows.rows) {
        const body = row.body as RefreshTokenRecord;
        if (body.rotatedAt === undefined) {
          body.rotatedAt = revokedAt;
          await upsert(client, "eve_vault_refresh_tokens", "token_hash", body.tokenHash, body);
        }
      }
      const accessRows = await client.query(
        `SELECT body FROM eve_vault_access_tokens WHERE body->>'refreshFamilyId' = $1`,
        [familyId],
      );
      for (const row of accessRows.rows) {
        const body = row.body as AccessTokenRecord;
        if (body.revokedAt === undefined) {
          body.revokedAt = revokedAt;
          await upsert(client, "eve_vault_access_tokens", "token_hash", body.tokenHash, body);
        }
      }
    },
    async putPreparedAction(action) {
      await upsert(client, "eve_vault_actions", "id", action.id, action);
    },
    async getPreparedAction(id) {
      return one<PreparedAction>(client, "eve_vault_actions", "id", id);
    },
    async updatePreparedAction(id, patch) {
      const existing = await one<PreparedAction>(client, "eve_vault_actions", "id", id);
      if (!existing) return undefined;
      const updated = { ...existing, ...patch, id: existing.id };
      await upsert(client, "eve_vault_actions", "id", id, updated);
      return updated;
    },
  };
}

async function upsert(
  client: SqlQueryClient,
  table: string,
  keyCol: string,
  key: string,
  body: unknown,
): Promise<void> {
  await client.query(
    `INSERT INTO ${table} (${keyCol}, body) VALUES ($1, $2::jsonb)
     ON CONFLICT (${keyCol}) DO UPDATE SET body = EXCLUDED.body`,
    [key, JSON.stringify(body)],
  );
}

async function one<T>(
  client: SqlQueryClient,
  table: string,
  keyCol: string,
  key: string,
): Promise<T | undefined> {
  const result = await client.query(`SELECT body FROM ${table} WHERE ${keyCol} = $1`, [key]);
  const body = result.rows[0]?.body;
  return body as T | undefined;
}

/**
 * Single-statement claim so two concurrent consumes cannot both succeed.
 * Only rows whose JSON field is still missing/null are updated.
 */
async function claimJson<T>(
  client: SqlQueryClient,
  table: string,
  keyCol: string,
  key: string,
  field: string,
  value: number,
): Promise<T | undefined> {
  const result = await client.query(
    `UPDATE ${table}
     SET body = jsonb_set(body, ARRAY[$2]::text[], to_jsonb($3::bigint), true)
     WHERE ${keyCol} = $1
       AND COALESCE(body->>$2, '') = ''
     RETURNING body`,
    [key, field, value],
  );
  return result.rows[0]?.body as T | undefined;
}
