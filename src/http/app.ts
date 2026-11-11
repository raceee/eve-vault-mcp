import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";

import { registerDynamicClient, toDcrResponse } from "../clients.js";
import { isKitError } from "../errors.js";
import type { EveVaultMcpKit } from "../kit.js";
import { completeLogin, exchangeToken, loadLoginChallenge, oauthRedirectError, startAuthorization } from "../oauth.js";
import { completePreparedAction, getPreparedActionForDisplay, readPreparedAction } from "../prepare.js";
import { revokeToken, verifyAccessToken } from "../tokens.js";
import { approvePageHtml, loginPageHtml } from "./pages.js";

const here = dirname(fileURLToPath(import.meta.url));

export function createHttpApp(kit: EveVaultMcpKit): Hono {
  const app = new Hono();
  const issuer = kit.config.issuer;
  const resource = kit.config.resource;

  app.use(
    "*",
    cors({
      origin: "*",
      allowHeaders: ["Authorization", "Content-Type", "Mcp-Session-Id", "mcp-protocol-version", "Accept"],
      exposeHeaders: ["WWW-Authenticate", "Mcp-Session-Id"],
    }),
  );

  app.onError((error, c) => {
    if (isKitError(error)) {
      return c.json(
        { error: error.code, error_description: error.message },
        error.status as 400 | 401 | 403 | 404 | 409 | 410,
      );
    }
    return c.json({ error: "server_error", error_description: "Unexpected error" }, 500);
  });

  app.get("/health", (c) => c.json({ ok: true, name: kit.config.serverName }));

  app.get("/.well-known/oauth-authorization-server", (c) =>
    c.json(authorizationServerMetadata(issuer, kit.config.scopes)),
  );
  app.get("/.well-known/oauth-protected-resource", (c) => c.json(protectedResourceMetadata(issuer, resource, kit.config.scopes)));
  app.get("/.well-known/oauth-protected-resource/mcp", (c) =>
    c.json(protectedResourceMetadata(issuer, resource, kit.config.scopes)),
  );

  app.post("/register", async (c) => {
    const body = await c.req.json();
    const client = await registerDynamicClient(kit.store, body, kit.now());
    return c.json(toDcrResponse(client), 201);
  });

  app.get("/authorize", async (c) => {
    const query = c.req.query();
    try {
      const started = await startAuthorization(kit.store, query, {
        issuer,
        resource,
        scopes: kit.config.scopes,
        defaultScopes: kit.config.defaultScopes,
        ttl: kit.config.ttl,
        now: kit.now(),
      });
      return c.redirect(started.loginUrl);
    } catch (error) {
      if (isKitError(error) && query.redirect_uri && query.client_id) {
        const client = await kit.store.getClient(query.client_id);
        if (client?.redirectUris.includes(query.redirect_uri)) {
          return c.redirect(
            oauthRedirectError(query.redirect_uri, error.code, error.message, query.state, issuer),
          );
        }
      }
      throw error;
    }
  });

  app.get("/login", (c) => c.html(loginPageHtml()));

  app.get("/login/challenge", async (c) => {
    const sessionId = c.req.query("session");
    if (!sessionId) {
      return c.json({ error: "invalid_request", error_description: "session is required" }, 400);
    }
    const challenge = await loadLoginChallenge(kit.store, sessionId, {
      issuer,
      serverName: kit.config.serverName,
      now: kit.now(),
    });
    return c.json({
      session: sessionId,
      clientName: challenge.clientName,
      clientId: challenge.session.clientId,
      scopes: challenge.session.scopes,
      issuer,
      message: challenge.message,
      expiresAt: challenge.nonce.expiresAt,
    });
  });

  app.post("/login/complete", async (c) => {
    const body = await c.req.json<{ session?: string; address?: string; signature?: string; bytes?: string }>();
    if (!body.session || !body.address || !body.signature) {
      return c.json({ error: "invalid_request", error_description: "session, address, and signature are required" }, 400);
    }
    // `bytes` from the wallet is intentionally ignored. The server rebuilds the message.
    const completed = await completeLogin({
      store: kit.store,
      verifier: kit.verifier,
      characterResolver: kit.characterResolver,
      sessionId: body.session,
      address: body.address,
      signature: body.signature,
      issuer,
      serverName: kit.config.serverName,
      ttl: kit.config.ttl,
      now: kit.now(),
    });
    return c.json({ redirectUrl: completed.redirectUrl, address: completed.address });
  });

  app.post("/token", async (c) => {
    const form = (await c.req.parseBody()) as Record<string, string>;
    const tokens = await exchangeToken(kit.store, form, {
      resource,
      ttl: kit.config.ttl,
      now: kit.now(),
    });
    return c.json({
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: tokens.expiresIn,
      refresh_token: tokens.refreshToken,
      scope: tokens.scopes.join(" "),
    });
  });

  app.post("/revoke", async (c) => {
    const form = (await c.req.parseBody()) as Record<string, string>;
    if (form.token) {
      await revokeToken(kit.store, form.token, kit.now());
    }
    return c.body(null, 200);
  });

  app.post("/introspect", async (c) => {
    const form = (await c.req.parseBody()) as Record<string, string>;
    const token = form.token;
    if (!token) {
      return c.json({ active: false });
    }
    try {
      const actor = await verifyAccessToken(kit.store, token, kit.now(), resource);
      return c.json({
        active: true,
        token_type: "Bearer",
        client_id: actor.clientId,
        sub: actor.address,
        aud: actor.resource,
        scope: actor.scopes.join(" "),
        exp: Math.floor(actor.expiresAt / 1000),
        wallet_address: actor.address,
        ...(actor.character ? { character_id: actor.character.id } : {}),
      });
    } catch {
      return c.json({ active: false });
    }
  });

  app.get("/actions/:id", async (c) => {
    const action = await readPreparedAction(kit.store, c.req.param("id"), kit.now());
    return c.json({
      id: action.id,
      status: action.status,
      title: action.title,
      description: action.description,
      walletAddress: action.walletAddress,
      expiresAt: action.expiresAt,
      digest: action.digest,
      kind: action.kind,
    });
  });

  app.get("/approve/:id", (c) => c.html(approvePageHtml()));

  app.get("/approve/:id/details", async (c) => {
    const action = await getPreparedActionForDisplay(kit.store, c.req.param("id"), kit.now());
    return c.json({
      id: action.id,
      title: action.title,
      description: action.description,
      kind: action.kind,
      walletAddress: action.walletAddress,
      expiresAt: action.expiresAt,
      status: action.status,
      transaction: action.transaction,
    });
  });

  app.post("/approve/:id/complete", async (c) => {
    const body = await c.req.json<{ address?: string; digest?: string }>();
    if (!body.address) {
      return c.json({ error: "invalid_request", error_description: "address is required" }, 400);
    }
    const action = await completePreparedAction(
      kit.store,
      c.req.param("id"),
      body.address,
      body.digest,
      kit.now(),
    );
    return c.json({ id: action.id, status: action.status, digest: action.digest });
  });

  const webDir = resolveWebDir();
  if (webDir) {
    app.use("/assets/*", serveStatic({ root: webDir, rewriteRequestPath: (path) => path.replace(/^\/assets/, "") }));
  }

  return app;
}

function authorizationServerMetadata(issuer: string, scopes: string[]) {
  return {
    issuer,
    authorization_endpoint: new URL("/authorize", issuer).toString(),
    token_endpoint: new URL("/token", issuer).toString(),
    revocation_endpoint: new URL("/revoke", issuer).toString(),
    introspection_endpoint: new URL("/introspect", issuer).toString(),
    registration_endpoint: new URL("/register", issuer).toString(),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    revocation_endpoint_auth_methods_supported: ["none"],
    introspection_endpoint_auth_methods_supported: ["none"],
    authorization_response_iss_parameter_supported: true,
    scopes_supported: scopes,
  };
}

function protectedResourceMetadata(issuer: string, resource: string, scopes: string[]) {
  return {
    resource,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: scopes,
  };
}

function resolveWebDir(): string | undefined {
  const candidates = [
    join(here, "../../dist/web"),
    join(process.cwd(), "dist/web"),
  ];
  return candidates.find((dir) => existsSync(dir));
}

