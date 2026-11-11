import { TokenError, type ScopeError } from "./errors.js";
import { assertScopes } from "./scopes.js";
import type { Actor } from "./types.js";

export type AccessTokenVerifier = {
  verifyAccessToken(token: string): Promise<Actor>;
};

export function bearerTokenFromHeader(header: string | undefined | null): string | undefined {
  if (!header) {
    return undefined;
  }
  const match = /^Bearer\s+(\S+)/i.exec(header.trim());
  return match?.[1];
}

export function wwwAuthenticate(resourceMetadataUrl: string, error?: string, scope?: string): string {
  const parts = [`Bearer resource_metadata="${resourceMetadataUrl}"`];
  if (error) {
    parts.push(`error="${error}"`);
  }
  if (scope) {
    parts.push(`scope="${scope}"`);
  }
  return parts.join(", ");
}

export async function authenticateActor(
  verifier: AccessTokenVerifier,
  authorizationHeader: string | undefined | null,
): Promise<Actor> {
  const token = bearerTokenFromHeader(authorizationHeader);
  if (!token) {
    throw new TokenError("invalid_token", "Missing bearer token");
  }
  return verifier.verifyAccessToken(token);
}

export function requireActorScopes(actor: Actor, scopes: string[]): Actor {
  assertScopes(actor, scopes);
  return actor;
}

/**
 * Wrap a tool handler so it cannot run without the listed scopes.
 * Use this from an MCP `registerTool` callback.
 */
export function scopedTool<TArgs, TResult>(
  actor: Actor,
  scopes: string[],
  handler: (args: TArgs) => Promise<TResult> | TResult,
): (args: TArgs) => Promise<TResult> {
  return async (args) => {
    requireActorScopes(actor, scopes);
    return handler(args);
  };
}

export function insufficientScopeMessage(error: ScopeError): string {
  return error.message;
}
