import type { EveVaultMcpKit } from "./kit.js";

export type NextRouteContext = {
  params?: Promise<Record<string, string | string[]>> | Record<string, string | string[]>;
};

/**
 * Next.js App Router handlers. Point a catch-all route at the kit:
 *
 *   app/api/eve-vault/[[...path]]/route.ts
 *   export const { GET, POST, OPTIONS } = createNextRouteHandlers(kit)
 *
 * Set `issuer` to the public URL of that mount (including `/api/eve-vault`)
 * so authorize/token metadata matches the path Next actually serves.
 */
export function createNextRouteHandlers(kit: EveVaultMcpKit) {
  const handler = async (request: Request) => kit.fetch(request);
  return {
    GET: handler,
    POST: handler,
    PUT: handler,
    PATCH: handler,
    DELETE: handler,
    OPTIONS: handler,
  };
}

/**
 * Well-known documents must be served from `/.well-known/...` on the host,
 * not under `/api/eve-vault`. Export these from
 * `app/.well-known/oauth-authorization-server/route.ts` (and the
 * protected-resource sibling).
 */
export function createWellKnownHandlers(kit: EveVaultMcpKit) {
  return createNextRouteHandlers(kit);
}
