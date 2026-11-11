import type { EveVaultMcpKit } from "./kit.js";
import { issuerMountPath, rewriteRequestForMount } from "./urls.js";

export type NextRouteContext = {
  params?: Promise<Record<string, string | string[]>> | Record<string, string | string[]>;
};

export type NextRouteHandlerOptions = {
  /**
   * Path the catch-all is mounted at, e.g. `/api/eve-vault`.
   * Defaults to the pathname of `kit.config.issuer`.
   */
  mountPath?: string;
};

/**
 * Next.js App Router handlers. Point a catch-all route at the kit:
 *
 *   app/api/eve-vault/[[...path]]/route.ts
 *   export const { GET, POST, OPTIONS } = createNextRouteHandlers(kit)
 *
 * Set `issuer` to the public URL of that mount (including `/api/eve-vault`)
 * so authorize/token metadata matches the path Next actually serves.
 *
 * Incoming request URLs keep the mount prefix (`/api/eve-vault/authorize`).
 * This helper strips that prefix before `kit.fetch` so Hono sees `/authorize`.
 */
export function createNextRouteHandlers(kit: EveVaultMcpKit, options?: NextRouteHandlerOptions) {
  const mountPath = options?.mountPath ?? issuerMountPath(kit.config.issuer);
  const handler = async (request: Request) => kit.fetch(rewriteRequestForMount(request, mountPath));
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
 * protected-resource sibling). Do not strip a mount prefix here.
 */
export function createWellKnownHandlers(kit: EveVaultMcpKit) {
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
