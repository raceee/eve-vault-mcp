import { describe, expect, it } from "vitest";

import { assertScopes } from "../src/scopes.js";
import { ScopeError } from "../src/errors.js";
import { ALICE, createTestKit, json, startLogin, tokensFor } from "./helpers.js";
import type { Actor } from "../src/types.js";

describe("scope enforcement", () => {
  it("grants only the requested scopes", async () => {
    const test = await createTestKit();
    const tokens = await tokensFor(test, ALICE, "identity.read");
    expect(tokens.scope).toBe("identity.read");
    const actor = await test.kit.verifyAccessToken(tokens.access_token);
    expect(actor.scopes).toEqual(["identity.read"]);
    expect(() => assertScopes(actor, ["identity.read"])).not.toThrow();
    expect(() => assertScopes(actor, ["actions.prepare"])).toThrow(ScopeError);
  });

  it("rejects unknown scopes at authorize time", async () => {
    const test = await createTestKit();
    const response = await test.kit.fetch(
      new Request(
        "http://127.0.0.1:8787/authorize?response_type=code&client_id=static-toy&redirect_uri=http://127.0.0.1:9999/callback&code_challenge=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&code_challenge_method=S256&scope=not.a.scope",
      ),
      { redirect: "manual" },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("invalid_scope");
  });

  it("assertScopes blocks a tool when the token is missing a required scope", async () => {
    const actor: Actor = {
      token: "x",
      clientId: "static-toy",
      address: ALICE,
      scopes: ["identity.read"],
      resource: "http://127.0.0.1:8787/mcp",
      expiresAt: Date.now() + 60_000,
    };
    expect(() => assertScopes(actor, ["actions.prepare"])).toThrow(/Missing scope/);
  });

  it("well-known metadata advertises builder-defined scopes", async () => {
    const test = await createTestKit();
    const as = await json(await test.kit.fetch(new Request("http://127.0.0.1:8787/.well-known/oauth-authorization-server")));
    const prm = await json(
      await test.kit.fetch(new Request("http://127.0.0.1:8787/.well-known/oauth-protected-resource")),
    );
    expect(as.code_challenge_methods_supported).toEqual(["S256"]);
    expect(as.registration_endpoint).toBe("http://127.0.0.1:8787/register");
    expect(prm.resource).toBe("http://127.0.0.1:8787/mcp");
    expect(prm.scopes_supported).toEqual(["identity.read", "actions.prepare"]);
    expect(startLogin).toBeTypeOf("function");
  });
});
