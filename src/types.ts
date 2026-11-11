export type CharacterIdentity = {
  id: string;
  name?: string;
  tribeId?: string;
};

export type RegisteredClient = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: "none";
  createdAt: number;
  static?: boolean;
};

export type AuthSession = {
  id: string;
  clientId: string;
  redirectUri: string;
  state?: string;
  scopes: string[];
  resource: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  nonceId: string;
  expiresAt: number;
  completedAt?: number;
};

export type NonceRecord = {
  id: string;
  sessionId: string;
  value: string;
  expiresAt: number;
  consumedAt?: number;
};

export type AuthorizationCodeRecord = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scopes: string[];
  resource: string;
  address: string;
  character?: CharacterIdentity;
  expiresAt: number;
};

export type AccessTokenRecord = {
  tokenHash: string;
  clientId: string;
  address: string;
  character?: CharacterIdentity;
  scopes: string[];
  resource: string;
  expiresAt: number;
  refreshFamilyId: string;
  revokedAt?: number;
};

export type RefreshTokenRecord = {
  tokenHash: string;
  clientId: string;
  address: string;
  character?: CharacterIdentity;
  scopes: string[];
  resource: string;
  expiresAt: number;
  familyId: string;
  rotatedAt?: number;
};

export type PreparedActionKind = "transaction" | "description";

export type PreparedTransaction = {
  format: "sui-transaction-json" | "bcs-base64";
  data: string;
};

export type PreparedAction = {
  id: string;
  walletAddress: string;
  title: string;
  description: string;
  kind: PreparedActionKind;
  transaction?: PreparedTransaction;
  expiresAt: number;
  createdAt: number;
  status: "pending" | "executed" | "expired" | "cancelled";
  digest?: string;
};

export type Actor = {
  token: string;
  clientId: string;
  address: string;
  character?: CharacterIdentity;
  scopes: string[];
  resource: string;
  expiresAt: number;
};

export type TtlConfig = {
  nonceMs: number;
  authSessionMs: number;
  authorizationCodeMs: number;
  accessTokenMs: number;
  refreshTokenMs: number;
  preparedActionMs: number;
};

export const DEFAULT_TTL: TtlConfig = {
  nonceMs: 5 * 60 * 1000,
  authSessionMs: 5 * 60 * 1000,
  authorizationCodeMs: 2 * 60 * 1000,
  accessTokenMs: 15 * 60 * 1000,
  refreshTokenMs: 8 * 60 * 60 * 1000,
  preparedActionMs: 10 * 60 * 1000,
};
