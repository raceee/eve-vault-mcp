import { ScopeError } from "./errors.js";
import type { Actor } from "./types.js";

export function parseScopeParam(scope: string | undefined, fallback: string[]): string[] {
  if (scope === undefined || scope.trim() === "") {
    return [...fallback];
  }
  return uniqueScopes(scope.split(/[\s+]+/).filter(Boolean));
}

export function uniqueScopes(scopes: string[]): string[] {
  return [...new Set(scopes)];
}

export function assertKnownScopes(requested: string[], supported: string[]): void {
  const allowed = new Set(supported);
  const unknown = requested.filter((scope) => !allowed.has(scope));
  if (unknown.length > 0) {
    throw new ScopeError(`Unknown scope: ${unknown.join(" ")}`);
  }
}

export function isSubset(requested: string[], granted: string[]): boolean {
  const have = new Set(granted);
  return requested.every((scope) => have.has(scope));
}

export function assertScopes(actor: Actor, required: string[]): void {
  if (!isSubset(required, actor.scopes)) {
    const missing = required.filter((scope) => !actor.scopes.includes(scope));
    throw new ScopeError(`Missing scope: ${missing.join(" ")}`);
  }
}

export function hasScope(actor: Actor, scope: string): boolean {
  return actor.scopes.includes(scope);
}
