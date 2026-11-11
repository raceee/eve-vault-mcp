/**
 * Next.js App Router catch-all (copy into your app; not run by this repo).
 *
 *   app/api/eve-vault/[[...path]]/route.ts
 *
 *   import { createNextRouteHandlers } from "eve-vault-mcp/next";
 *   import { kit } from "@/lib/eve-vault-mcp";
 *   export const { GET, POST, OPTIONS } = createNextRouteHandlers(kit);
 *
 * Set issuer to the public URL of this mount. The helper strips that
 * pathname so Hono sees `/authorize`. Well-known routes at the site root
 * must use `createWellKnownHandlers` (no strip). See INTEGRATING.md.
 */
export {};
