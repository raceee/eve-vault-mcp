import type { KitStore } from "./store.js";
import type {
  AccessTokenRecord,
  AuthSession,
  AuthorizationCodeRecord,
  NonceRecord,
  PreparedAction,
  RefreshTokenRecord,
  RegisteredClient,
} from "./types.js";

/**
 * Process-local store. Fine for the toy server and tests. Production
 * builders should implement `KitStore` with Redis or a database so
 * nonces and tokens survive restarts and scale across instances.
 */
export class MemoryStore implements KitStore {
  readonly clients = new Map<string, RegisteredClient>();
  readonly sessions = new Map<string, AuthSession>();
  readonly nonces = new Map<string, NonceRecord>();
  readonly codes = new Map<string, AuthorizationCodeRecord>();
  readonly accessTokens = new Map<string, AccessTokenRecord>();
  readonly refreshTokens = new Map<string, RefreshTokenRecord>();
  readonly preparedActions = new Map<string, PreparedAction>();

  async putClient(client: RegisteredClient): Promise<void> {
    this.clients.set(client.clientId, client);
  }

  async getClient(clientId: string): Promise<RegisteredClient | undefined> {
    return this.clients.get(clientId);
  }

  async putAuthSession(session: AuthSession): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async getAuthSession(id: string): Promise<AuthSession | undefined> {
    return this.sessions.get(id);
  }

  async completeAuthSession(id: string, completedAt: number): Promise<AuthSession | undefined> {
    const session = this.sessions.get(id);
    if (!session || session.completedAt !== undefined) {
      return undefined;
    }
    session.completedAt = completedAt;
    return session;
  }

  async putNonce(record: NonceRecord): Promise<void> {
    this.nonces.set(record.id, record);
  }

  async getNonce(id: string): Promise<NonceRecord | undefined> {
    return this.nonces.get(id);
  }

  async consumeNonce(id: string, consumedAt: number): Promise<NonceRecord | undefined> {
    const record = this.nonces.get(id);
    if (!record || record.consumedAt !== undefined) {
      return undefined;
    }
    record.consumedAt = consumedAt;
    return record;
  }

  async putCode(codeHash: string, record: AuthorizationCodeRecord): Promise<void> {
    this.codes.set(codeHash, record);
  }

  async consumeCode(codeHash: string): Promise<AuthorizationCodeRecord | undefined> {
    const record = this.codes.get(codeHash);
    if (!record) {
      return undefined;
    }
    this.codes.delete(codeHash);
    return record;
  }

  async putAccessToken(record: AccessTokenRecord): Promise<void> {
    this.accessTokens.set(record.tokenHash, record);
  }

  async getAccessToken(tokenHash: string): Promise<AccessTokenRecord | undefined> {
    return this.accessTokens.get(tokenHash);
  }

  async revokeAccessToken(tokenHash: string, revokedAt: number): Promise<void> {
    const record = this.accessTokens.get(tokenHash);
    if (record && record.revokedAt === undefined) {
      record.revokedAt = revokedAt;
    }
  }

  async putRefreshToken(record: RefreshTokenRecord): Promise<void> {
    this.refreshTokens.set(record.tokenHash, record);
  }

  async getRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | undefined> {
    return this.refreshTokens.get(tokenHash);
  }

  async rotateRefreshToken(tokenHash: string, rotatedAt: number): Promise<RefreshTokenRecord | undefined> {
    const record = this.refreshTokens.get(tokenHash);
    if (!record || record.rotatedAt !== undefined) {
      return undefined;
    }
    record.rotatedAt = rotatedAt;
    return record;
  }

  async revokeRefreshFamily(familyId: string, revokedAt: number): Promise<void> {
    for (const refresh of this.refreshTokens.values()) {
      if (refresh.familyId === familyId && refresh.rotatedAt === undefined) {
        refresh.rotatedAt = revokedAt;
      }
    }
    for (const access of this.accessTokens.values()) {
      if (access.refreshFamilyId === familyId && access.revokedAt === undefined) {
        access.revokedAt = revokedAt;
      }
    }
  }

  async putPreparedAction(action: PreparedAction): Promise<void> {
    this.preparedActions.set(action.id, action);
  }

  async getPreparedAction(id: string): Promise<PreparedAction | undefined> {
    return this.preparedActions.get(id);
  }

  async updatePreparedAction(
    id: string,
    patch: Partial<PreparedAction>,
  ): Promise<PreparedAction | undefined> {
    const existing = this.preparedActions.get(id);
    if (!existing) {
      return undefined;
    }
    const updated = { ...existing, ...patch, id: existing.id };
    this.preparedActions.set(id, updated);
    return updated;
  }
}
