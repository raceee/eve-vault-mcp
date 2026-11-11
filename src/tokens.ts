import { sha256Hex, newAccessToken, newRefreshToken } from "./crypto.js";
import { TokenError } from "./errors.js";
import { isSubset } from "./scopes.js";
import type { KitStore } from "./store.js";
import type {
  AccessTokenRecord,
  Actor,
  CharacterIdentity,
  RefreshTokenRecord,
  TtlConfig,
} from "./types.js";

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: string[];
};

export type TokenSubject = {
  clientId: string;
  address: string;
  character?: CharacterIdentity;
  scopes: string[];
  resource: string;
};

export async function issueTokenPair(
  store: KitStore,
  subject: TokenSubject,
  ttl: TtlConfig,
  now: number,
  familyId = sha256Hex(`${subject.clientId}:${subject.address}:${now}:${Math.random()}`),
): Promise<IssuedTokens> {
  const accessToken = newAccessToken();
  const refreshToken = newRefreshToken();
  const access: AccessTokenRecord = {
    tokenHash: sha256Hex(accessToken),
    clientId: subject.clientId,
    address: subject.address,
    ...(subject.character ? { character: subject.character } : {}),
    scopes: subject.scopes,
    resource: subject.resource,
    expiresAt: now + ttl.accessTokenMs,
    refreshFamilyId: familyId,
  };
  const refresh: RefreshTokenRecord = {
    tokenHash: sha256Hex(refreshToken),
    clientId: subject.clientId,
    address: subject.address,
    ...(subject.character ? { character: subject.character } : {}),
    scopes: subject.scopes,
    resource: subject.resource,
    expiresAt: now + ttl.refreshTokenMs,
    familyId,
  };
  await store.putAccessToken(access);
  await store.putRefreshToken(refresh);
  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(ttl.accessTokenMs / 1000),
    scopes: subject.scopes,
  };
}

export async function verifyAccessToken(
  store: KitStore,
  token: string,
  now: number,
  expectedResource?: string,
): Promise<Actor> {
  const record = await store.getAccessToken(sha256Hex(token));
  if (!record) {
    throw new TokenError("invalid_token", "Unknown access token");
  }
  if (record.revokedAt !== undefined) {
    throw new TokenError("invalid_token", "Access token has been revoked");
  }
  if (record.expiresAt <= now) {
    throw new TokenError("invalid_token", "Access token has expired");
  }
  if (expectedResource && record.resource !== expectedResource) {
    throw new TokenError("invalid_token", "Access token was issued for a different resource");
  }
  return {
    token,
    clientId: record.clientId,
    address: record.address,
    ...(record.character ? { character: record.character } : {}),
    scopes: record.scopes,
    resource: record.resource,
    expiresAt: record.expiresAt,
  };
}

export async function revokeToken(store: KitStore, token: string, now: number): Promise<void> {
  const hash = sha256Hex(token);
  const access = await store.getAccessToken(hash);
  if (access) {
    await store.revokeAccessToken(hash, now);
    await store.revokeRefreshFamily(access.refreshFamilyId, now);
    return;
  }
  const refresh = await store.getRefreshToken(hash);
  if (refresh) {
    await store.revokeRefreshFamily(refresh.familyId, now);
  }
}

export async function rotateRefreshToken(
  store: KitStore,
  refreshToken: string,
  clientId: string,
  requestedScopes: string[] | undefined,
  ttl: TtlConfig,
  now: number,
): Promise<IssuedTokens> {
  const hash = sha256Hex(refreshToken);
  const existing = await store.getRefreshToken(hash);
  if (!existing) {
    throw new TokenError("invalid_grant", "Unknown refresh token", 400);
  }
  if (existing.clientId !== clientId) {
    throw new TokenError("invalid_grant", "Refresh token was not issued to this client", 400);
  }
  if (existing.expiresAt <= now) {
    throw new TokenError("invalid_grant", "Refresh token has expired", 400);
  }
  if (existing.rotatedAt !== undefined) {
    await store.revokeRefreshFamily(existing.familyId, now);
    throw new TokenError("invalid_grant", "Refresh token already used", 400);
  }
  const scopes = requestedScopes ?? existing.scopes;
  if (!isSubset(scopes, existing.scopes)) {
    throw new TokenError("invalid_scope", "Cannot expand scopes on refresh", 400);
  }
  const rotated = await store.rotateRefreshToken(hash, now);
  if (!rotated) {
    await store.revokeRefreshFamily(existing.familyId, now);
    throw new TokenError("invalid_grant", "Refresh token already used", 400);
  }
  return issueTokenPair(
    store,
    {
      clientId: existing.clientId,
      address: existing.address,
      ...(existing.character ? { character: existing.character } : {}),
      scopes,
      resource: existing.resource,
    },
    ttl,
    now,
    existing.familyId,
  );
}
