# Add this kit to an existing dApp

The kit is an OAuth 2.1 authorization server whose login step is **Sign in with EVE Vault**, plus a prepared-action helper and a small MCP tool template. You keep your own app, database, scopes, and tools.

Nothing here assumes a particular game world, contract, or product. Install from git until the maintainers publish:

```bash
npm install github:raceee/eve-vault-mcp#main
```

Do not `npm publish` this package from your app repo.

## What you add (checklist)

1. **A kit singleton** on the server (issuer URL, resource URL, your scopes, a `SignatureVerifier`, a `KitStore`).
2. **HTTP routes** for OAuth, login, approval pages, and (if you use MCP) `/mcp`.
3. **Well-known documents** at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`.
4. **A login + approve UI** — this repo already serves `/login` and `/approve/:id`. Build the web bundle (`npm run build`) so `/assets/login.js` and `/assets/approve.js` exist, or mount your own pages that call the same JSON endpoints.
5. **Your MCP tools**, each listing the scopes they need. Prepared actions should return `approvalCardToolResult(...)` so chat clients can render a card, and always keep the plain approval URL in the text.
6. **Storage** — `MemoryStore` for a single process; Postgres or Redis for anything that restarts or scales.
7. **A Sui RPC/GraphQL client** so zkLogin personal-message signatures can be verified (offline verify will not work).

## Node (Hono / Node http)

```ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import {
  createEveVaultMcpKit,
  createMystenVerifier,
  createMcpHandler,
  MemoryStore,
} from "eve-vault-mcp";

const kit = await createEveVaultMcpKit({
  issuer: "https://example.com",
  resource: "https://example.com/mcp",
  serverName: "Example dApp",
  scopes: ["identity.read", "actions.prepare", "actions.status"],
  store: new MemoryStore(),
  verifier: createMystenVerifier({ network: "mainnet" }),
});

const mcp = createMcpHandler({
  kit,
  serverName: "Example dApp",
  tools: [
    /* your tools */
  ],
});

const app = new Hono();
app.route("/", kit.app);
app.all("/mcp", (c) => mcp(c.req.raw));
serve({ fetch: app.fetch, port: 8787 });
```

## Next.js (App Router)

Set `issuer` to the public origin plus the mount path, for example `https://your.app/api/eve-vault`.

`app/api/eve-vault/[[...path]]/route.ts`:

```ts
import { createNextRouteHandlers } from "eve-vault-mcp/next";
import { kit } from "@/lib/eve-vault";

export const runtime = "nodejs";
export const { GET, POST, OPTIONS } = createNextRouteHandlers(kit);
```

Also serve RFC 8414 / RFC 9728 at the site root:

- `app/.well-known/oauth-authorization-server/route.ts`
- `app/.well-known/oauth-protected-resource/route.ts`

Those can call `kit.fetch(request)` the same way (see `createWellKnownHandlers`). MCP clients look there first.

Peer dependency: `@mysten/sui`. Optional: `pg` or `redis` only if you use those adapters.

## Storage

In-memory (default):

```ts
import { MemoryStore } from "eve-vault-mcp";
```

Postgres (you supply the client; this package does not depend on `pg`):

```ts
import { Pool } from "pg";
import { createPostgresStore, POSTGRES_SCHEMA } from "eve-vault-mcp/stores/postgres";

await pool.query(POSTGRES_SCHEMA);
const store = createPostgresStore(pool);
```

Redis:

```ts
import { createClient } from "redis";
import { createRedisStore } from "eve-vault-mcp/stores/redis";

const redis = createClient();
await redis.connect();
const store = createRedisStore(redis);
```

Implement `KitStore` yourself if you already have a data layer.

## Python / FastAPI (or any other backend)

Run this kit as a **standalone auth server** (the toy example is that process). Your Python service is only a resource server:

1. Players (and MCP clients) obtain tokens from the Node auth server.
2. Your API receives `Authorization: Bearer ...`.
3. You introspect the token — there is no JWKS document in the default opaque-token mode, because tokens are hashed server-side so they can be revoked.

```python
import httpx
from fastapi import FastAPI, Header, HTTPException

INTROSPECT = "https://auth.example.com/introspect"
app = FastAPI()

async def actor(authorization: str | None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "missing token")
    token = authorization.removeprefix("Bearer ")
    async with httpx.AsyncClient() as client:
        response = await client.post(INTROSPECT, data={"token": token})
    body = response.json()
    if not body.get("active"):
        raise HTTPException(401, "inactive token")
    return body  # sub/wallet_address, scope, aud, character_id

@app.get("/me")
async def me(authorization: str | None = Header(default=None)):
    return await actor(authorization)
```

A future JWT/JWKS access-token mode would let FastAPI verify locally without a round trip. It is not the default because revocation and single-use refresh rotation are simpler with opaque tokens plus `/introspect`.

## Prepared actions in chat

```ts
import { approvalCardToolResult, toApprovalCardModel } from "eve-vault-mcp";

const prepared = await kit.prepareAction({
  walletAddress: actor.address,
  title: "List item",
  description: "Unsigned intent. The player signs in EVE Vault.",
  // transaction: { format: "sui-transaction-json", data: txJson },
});
const action = await kit.getActionStatus(prepared.id);
return approvalCardToolResult(toApprovalCardModel(action, prepared.approvalUrl));
```

The tool result contains:

- Plain text with the approval URL (required for clients that cannot render UI).
- An MCP Apps resource (`text/html;profile=mcp-app`) and ChatGPT Apps `_meta["openai/outputTemplate"]`.
- `structuredContent` so the widget can show title, expiry, and wallet.

The card's **Approve in EVE Vault** button opens the approval URL in a **new tab**. Do not try to connect EVE Vault inside the widget iframe. After the player signs, call `get_action_status` (or `GET /actions/:id`) until `status` is `executed`, `expired`, or `cancelled`.

Sponsored gas: pass a `gasSponsor` when creating the kit if your backend already wraps transactions. The kit does not call CCP's sponsor API itself.

## Character lookup

Optional. If you set `createWorldApiCharacterResolver({ baseUrl })`, a successful sign-in will try `GET {baseUrl}/v2/smartcharacters/{address}` and attach `{ id, name? }` when the World API responds. Login still succeeds if that call fails. You can point this at any world gateway; there is no default world.
