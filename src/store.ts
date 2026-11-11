import type {
  AccessTokenRecord,
  AuthSession,
  AuthorizationCodeRecord,
  NonceRecord,
  PreparedAction,
  RefreshTokenRecord,
  RegisteredClient,
} from "./types.js";

export type KitStore = {
  putClient(client: RegisteredClient): Promise<void>;
  getClient(clientId: string): Promise<RegisteredClient | undefined>;

  putAuthSession(session: AuthSession): Promise<void>;
  getAuthSession(id: string): Promise<AuthSession | undefined>;
  completeAuthSession(id: string, completedAt: number): Promise<AuthSession | undefined>;

  putNonce(record: NonceRecord): Promise<void>;
  getNonce(id: string): Promise<NonceRecord | undefined>;
  /**
   * Marks the nonce consumed if it is still unused. Returns the record
   * only on a successful consume — callers must treat a miss as replay.
   */
  consumeNonce(id: string, consumedAt: number): Promise<NonceRecord | undefined>;

  putCode(codeHash: string, record: AuthorizationCodeRecord): Promise<void>;
  consumeCode(codeHash: string): Promise<AuthorizationCodeRecord | undefined>;

  putAccessToken(record: AccessTokenRecord): Promise<void>;
  getAccessToken(tokenHash: string): Promise<AccessTokenRecord | undefined>;
  revokeAccessToken(tokenHash: string, revokedAt: number): Promise<void>;

  putRefreshToken(record: RefreshTokenRecord): Promise<void>;
  getRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | undefined>;
  rotateRefreshToken(tokenHash: string, rotatedAt: number): Promise<RefreshTokenRecord | undefined>;
  revokeRefreshFamily(familyId: string, revokedAt: number): Promise<void>;

  putPreparedAction(action: PreparedAction): Promise<void>;
  getPreparedAction(id: string): Promise<PreparedAction | undefined>;
  updatePreparedAction(id: string, patch: Partial<PreparedAction>): Promise<PreparedAction | undefined>;
};
