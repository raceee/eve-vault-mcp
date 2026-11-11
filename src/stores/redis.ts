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
 * Minimal Redis surface so this adapter does not import a specific client.
 * Compatible with node-redis v4 `get/set/del/sAdd/sMembers`.
 */
export type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  sAdd?(key: string, member: string): Promise<unknown>;
  sMembers?(key: string): Promise<string[]>;
};

const PREFIX = "eve-vault-mcp:";

export function createRedisStore(redis: RedisLike): KitStore {
  return {
    async putClient(client) {
      await setJson(redis, `client:${client.clientId}`, client);
    },
    async getClient(clientId) {
      return getJson<RegisteredClient>(redis, `client:${clientId}`);
    },
    async putAuthSession(session) {
      await setJson(redis, `session:${session.id}`, session);
    },
    async getAuthSession(id) {
      return getJson<AuthSession>(redis, `session:${id}`);
    },
    async completeAuthSession(id, completedAt) {
      const session = await getJson<AuthSession>(redis, `session:${id}`);
      if (!session || session.completedAt !== undefined) return undefined;
      session.completedAt = completedAt;
      await setJson(redis, `session:${id}`, session);
      return session;
    },
    async putNonce(record) {
      await setJson(redis, `nonce:${record.id}`, record);
    },
    async getNonce(id) {
      return getJson<NonceRecord>(redis, `nonce:${id}`);
    },
    async consumeNonce(id, consumedAt) {
      const record = await getJson<NonceRecord>(redis, `nonce:${id}`);
      if (!record || record.consumedAt !== undefined) return undefined;
      record.consumedAt = consumedAt;
      await setJson(redis, `nonce:${id}`, record);
      return record;
    },
    async putCode(codeHash, record) {
      await setJson(redis, `code:${codeHash}`, record);
    },
    async consumeCode(codeHash) {
      const record = await getJson<AuthorizationCodeRecord>(redis, `code:${codeHash}`);
      if (!record) return undefined;
      await redis.del(PREFIX + `code:${codeHash}`);
      return record;
    },
    async putAccessToken(record) {
      await setJson(redis, `access:${record.tokenHash}`, record);
      await addFamily(redis, "access-family", record.refreshFamilyId, record.tokenHash);
    },
    async getAccessToken(tokenHash) {
      return getJson<AccessTokenRecord>(redis, `access:${tokenHash}`);
    },
    async revokeAccessToken(tokenHash, revokedAt) {
      const record = await getJson<AccessTokenRecord>(redis, `access:${tokenHash}`);
      if (record && record.revokedAt === undefined) {
        record.revokedAt = revokedAt;
        await setJson(redis, `access:${tokenHash}`, record);
      }
    },
    async putRefreshToken(record) {
      await setJson(redis, `refresh:${record.tokenHash}`, record);
      await addFamily(redis, "refresh-family", record.familyId, record.tokenHash);
    },
    async getRefreshToken(tokenHash) {
      return getJson<RefreshTokenRecord>(redis, `refresh:${tokenHash}`);
    },
    async rotateRefreshToken(tokenHash, rotatedAt) {
      const record = await getJson<RefreshTokenRecord>(redis, `refresh:${tokenHash}`);
      if (!record || record.rotatedAt !== undefined) return undefined;
      record.rotatedAt = rotatedAt;
      await setJson(redis, `refresh:${tokenHash}`, record);
      return record;
    },
    async revokeRefreshFamily(familyId, revokedAt) {
      for (const hash of await members(redis, `refresh-family:${familyId}`)) {
        const record = await getJson<RefreshTokenRecord>(redis, `refresh:${hash}`);
        if (record && record.rotatedAt === undefined) {
          record.rotatedAt = revokedAt;
          await setJson(redis, `refresh:${hash}`, record);
        }
      }
      for (const hash of await members(redis, `access-family:${familyId}`)) {
        const record = await getJson<AccessTokenRecord>(redis, `access:${hash}`);
        if (record && record.revokedAt === undefined) {
          record.revokedAt = revokedAt;
          await setJson(redis, `access:${hash}`, record);
        }
      }
    },
    async putPreparedAction(action) {
      await setJson(redis, `action:${action.id}`, action);
    },
    async getPreparedAction(id) {
      return getJson<PreparedAction>(redis, `action:${id}`);
    },
    async updatePreparedAction(id, patch) {
      const existing = await getJson<PreparedAction>(redis, `action:${id}`);
      if (!existing) return undefined;
      const updated = { ...existing, ...patch, id: existing.id };
      await setJson(redis, `action:${id}`, updated);
      return updated;
    },
  };
}

async function setJson(redis: RedisLike, key: string, value: unknown): Promise<void> {
  await redis.set(PREFIX + key, JSON.stringify(value));
}

async function getJson<T>(redis: RedisLike, key: string): Promise<T | undefined> {
  const raw = await redis.get(PREFIX + key);
  return raw ? (JSON.parse(raw) as T) : undefined;
}

async function addFamily(redis: RedisLike, kind: string, familyId: string, member: string): Promise<void> {
  if (redis.sAdd) {
    await redis.sAdd(PREFIX + `${kind}:${familyId}`, member);
    return;
  }
  const key = PREFIX + `${kind}:${familyId}`;
  const current = JSON.parse((await redis.get(key)) ?? "[]") as string[];
  if (!current.includes(member)) current.push(member);
  await redis.set(key, JSON.stringify(current));
}

async function members(redis: RedisLike, key: string): Promise<string[]> {
  if (redis.sMembers) {
    return redis.sMembers(PREFIX + key);
  }
  return JSON.parse((await redis.get(PREFIX + key)) ?? "[]") as string[];
}
