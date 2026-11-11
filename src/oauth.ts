import { normalizeSuiAddress } from "@mysten/sui/utils";

import type { CharacterResolver } from "./character.js";
import { newAuthorizationCode, randomId, sha256Hex } from "./crypto.js";
import { KitError, NonceError } from "./errors.js";
import { encodeLoginMessage } from "./login-message.js";
import { isValidCodeChallenge, verifyS256 } from "./pkce.js";
import { exactRedirectMatch } from "./redirect.js";
import { assertKnownScopes, parseScopeParam } from "./scopes.js";
import type { KitStore } from "./store.js";
import { issueTokenPair, rotateRefreshToken, type IssuedTokens } from "./tokens.js";
import type { AuthSession, TtlConfig } from "./types.js";
import type { SignatureVerifier } from "./verify.js";

export type AuthorizeQuery = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  state?: string;
  scope?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  resource?: string;
};

export type AuthorizeStart = {
  session: AuthSession;
  loginUrl: string;
};

export async function startAuthorization(
  store: KitStore,
  query: AuthorizeQuery,
  config: {
    issuer: string;
    resource: string;
    scopes: string[];
    defaultScopes: string[];
    ttl: TtlConfig;
    now: number;
  },
): Promise<AuthorizeStart> {
  if (query.response_type !== "code") {
    throw new KitError("unsupported_response_type", "response_type must be code");
  }
  if (!query.client_id) {
    throw new KitError("invalid_request", "client_id is required");
  }
  if (!query.redirect_uri) {
    throw new KitError("invalid_request", "redirect_uri is required");
  }
  const client = await store.getClient(query.client_id);
  if (!client) {
    throw new KitError("invalid_client", "Unknown client_id", 401);
  }
  if (!exactRedirectMatch(client.redirectUris, query.redirect_uri)) {
    throw new KitError("invalid_request", "redirect_uri does not match the registered client");
  }
  if (query.code_challenge_method !== "S256") {
    throw new KitError("invalid_request", "code_challenge_method must be S256");
  }
  if (!query.code_challenge || !isValidCodeChallenge(query.code_challenge)) {
    throw new KitError("invalid_request", "code_challenge is required (PKCE S256)");
  }
  if (query.resource && query.resource !== config.resource) {
    throw new KitError("invalid_target", "resource does not match this server");
  }

  const scopes = parseScopeParam(query.scope, config.defaultScopes);
  try {
    assertKnownScopes(scopes, config.scopes);
  } catch {
    throw new KitError("invalid_scope", "One or more requested scopes are not supported");
  }

  const sessionId = randomId();
  const nonceId = randomId();
  const nonceValue = randomId();
  const session: AuthSession = {
    id: sessionId,
    clientId: client.clientId,
    redirectUri: query.redirect_uri,
    ...(query.state !== undefined ? { state: query.state } : {}),
    scopes,
    resource: query.resource ?? config.resource,
    codeChallenge: query.code_challenge,
    codeChallengeMethod: "S256",
    nonceId,
    expiresAt: config.now + config.ttl.authSessionMs,
  };
  await store.putAuthSession(session);
  await store.putNonce({
    id: nonceId,
    sessionId,
    value: nonceValue,
    expiresAt: config.now + config.ttl.nonceMs,
  });
  return {
    session,
    loginUrl: new URL(`/login?session=${encodeURIComponent(sessionId)}`, config.issuer).toString(),
  };
}

export async function loadLoginChallenge(
  store: KitStore,
  sessionId: string,
  config: { issuer: string; serverName: string; now: number },
) {
  const session = await liveSession(store, sessionId, config.now);
  const nonce = await store.getNonce(session.nonceId);
  if (!nonce || nonce.consumedAt !== undefined) {
    throw new NonceError("No pending sign-in nonce");
  }
  if (nonce.expiresAt <= config.now) {
    throw new NonceError("Sign-in nonce has expired");
  }
  const client = await store.getClient(session.clientId);
  const message = encodeLoginMessage({
    serverName: config.serverName,
    issuer: config.issuer,
    clientName: client?.clientName ?? session.clientId,
    clientId: session.clientId,
    scopes: session.scopes,
    nonce: nonce.value,
  });
  return {
    session,
    nonce,
    clientName: client?.clientName ?? session.clientId,
    message: new TextDecoder().decode(message),
    messageBytes: message,
  };
}

export async function completeLogin(options: {
  store: KitStore;
  verifier: SignatureVerifier;
  characterResolver: CharacterResolver;
  sessionId: string;
  address: string;
  signature: string;
  issuer: string;
  serverName: string;
  ttl: TtlConfig;
  now: number;
}): Promise<{ redirectUrl: string; address: string }> {
  const challenge = await loadLoginChallenge(options.store, options.sessionId, {
    issuer: options.issuer,
    serverName: options.serverName,
    now: options.now,
  });
  const address = normalizeSuiAddress(options.address);

  await options.verifier.verifyPersonalMessage({
    message: challenge.messageBytes,
    signature: options.signature,
    address,
  });

  const consumed = await options.store.consumeNonce(challenge.nonce.id, options.now);
  if (!consumed) {
    throw new NonceError("Sign-in nonce has already been used");
  }

  const completed = await options.store.completeAuthSession(options.sessionId, options.now);
  if (!completed) {
    throw new KitError("invalid_request", "Authorization session already completed");
  }

  const character = await options.characterResolver.resolve(address);
  const code = newAuthorizationCode();
  await options.store.putCode(sha256Hex(code), {
    clientId: challenge.session.clientId,
    redirectUri: challenge.session.redirectUri,
    codeChallenge: challenge.session.codeChallenge,
    codeChallengeMethod: "S256",
    scopes: challenge.session.scopes,
    resource: challenge.session.resource,
    address,
    ...(character ? { character } : {}),
    expiresAt: options.now + options.ttl.authorizationCodeMs,
  });

  const redirect = new URL(challenge.session.redirectUri);
  redirect.searchParams.set("code", code);
  if (challenge.session.state !== undefined) {
    redirect.searchParams.set("state", challenge.session.state);
  }
  redirect.searchParams.set("iss", options.issuer);
  return { redirectUrl: redirect.toString(), address };
}

export type TokenForm = {
  grant_type?: string;
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  code_verifier?: string;
  refresh_token?: string;
  scope?: string;
  resource?: string;
};

export async function exchangeToken(
  store: KitStore,
  form: TokenForm,
  config: { resource: string; ttl: TtlConfig; now: number },
): Promise<IssuedTokens> {
  if (form.grant_type === "authorization_code") {
    return exchangeAuthorizationCode(store, form, config);
  }
  if (form.grant_type === "refresh_token") {
    if (!form.refresh_token || !form.client_id) {
      throw new KitError("invalid_request", "refresh_token and client_id are required");
    }
    const scopes = form.scope ? form.scope.split(/[\s+]+/).filter(Boolean) : undefined;
    return rotateRefreshToken(store, form.refresh_token, form.client_id, scopes, config.ttl, config.now);
  }
  throw new KitError("unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
}

async function exchangeAuthorizationCode(
  store: KitStore,
  form: TokenForm,
  config: { resource: string; ttl: TtlConfig; now: number },
): Promise<IssuedTokens> {
  if (!form.code || !form.redirect_uri || !form.client_id || !form.code_verifier) {
    throw new KitError("invalid_request", "code, redirect_uri, client_id, and code_verifier are required");
  }
  const record = await store.consumeCode(sha256Hex(form.code));
  if (!record) {
    throw new KitError("invalid_grant", "Authorization code is invalid or already used");
  }
  if (record.expiresAt <= config.now) {
    throw new KitError("invalid_grant", "Authorization code has expired");
  }
  if (record.clientId !== form.client_id) {
    throw new KitError("invalid_grant", "Authorization code was not issued to this client");
  }
  if (record.redirectUri !== form.redirect_uri) {
    throw new KitError("invalid_grant", "redirect_uri does not match the authorization request");
  }
  if (!verifyS256(form.code_verifier, record.codeChallenge)) {
    throw new KitError("invalid_grant", "PKCE verification failed");
  }
  const resource = form.resource ?? record.resource;
  if (resource !== record.resource) {
    throw new KitError("invalid_target", "resource does not match the authorization request");
  }
  return issueTokenPair(
    store,
    {
      clientId: record.clientId,
      address: record.address,
      ...(record.character ? { character: record.character } : {}),
      scopes: record.scopes,
      resource,
    },
    config.ttl,
    config.now,
  );
}

async function liveSession(store: KitStore, sessionId: string, now: number): Promise<AuthSession> {
  const session = await store.getAuthSession(sessionId);
  if (!session) {
    throw new KitError("invalid_request", "Unknown authorization session", 404);
  }
  if (session.completedAt !== undefined) {
    throw new KitError("invalid_request", "Authorization session already completed");
  }
  if (session.expiresAt <= now) {
    throw new KitError("invalid_request", "Authorization session has expired", 401);
  }
  return session;
}

export function oauthRedirectError(redirectUri: string, error: string, description: string, state?: string, iss?: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state !== undefined) {
    url.searchParams.set("state", state);
  }
  if (iss) {
    url.searchParams.set("iss", iss);
  }
  return url.toString();
}
