import { describe, expect, it } from "vitest";

import {
  ALICE,
  createTestKit,
  exchangeCode,
  json,
  loginAs,
  tokensFor,
} from "./helpers.js";

describe("access tokens", () => {
  it("expire after the configured TTL", async () => {
    const test = await createTestKit({ ttl: { accessTokenMs: 1_000 } });
    const tokens = await tokensFor(test, ALICE);
    const actor = await test.kit.verifyAccessToken(tokens.access_token);
    expect(actor.address).toBe(ALICE);
    expect(actor.scopes).toEqual(["identity.read", "actions.prepare"]);

    test.clock.advance(1_001);
    await expect(test.kit.verifyAccessToken(tokens.access_token)).rejects.toMatchObject({
      code: "invalid_token",
      message: expect.stringMatching(/expired/),
    });
  });

  it("revocation rejects the access token and its refresh family", async () => {
    const test = await createTestKit();
    const tokens = await tokensFor(test, ALICE);
    await test.kit.revokeToken(tokens.access_token);
    await expect(test.kit.verifyAccessToken(tokens.access_token)).rejects.toMatchObject({
      code: "invalid_token",
      message: expect.stringMatching(/revoked/),
    });

    const refresh = await test.kit.fetch(
      new Request("http://127.0.0.1:8787/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: "static-toy",
        }),
      }),
    );
    expect(refresh.status).toBe(400);
  });

  it("POST /revoke is idempotent", async () => {
    const test = await createTestKit();
    const tokens = await tokensFor(test, ALICE);
    for (let i = 0; i < 2; i += 1) {
      const response = await test.kit.fetch(
        new Request("http://127.0.0.1:8787/revoke", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: tokens.access_token }),
        }),
      );
      expect(response.status).toBe(200);
    }
  });

  it("authorization codes are single-use", async () => {
    const test = await createTestKit();
    const { code, verifier } = await loginAs(test, ALICE);
    const first = await exchangeCode(test.kit, code, verifier);
    expect(first.status).toBe(200);
    const second = await exchangeCode(test.kit, code, verifier);
    expect(second.status).toBe(400);
    expect((await json(second)).error).toBe("invalid_grant");
  });

  it("binds the token to the wallet address and optional character", async () => {
    const test = await createTestKit({
      character: { id: "char-1", name: "Pilot" },
    });
    const tokens = await tokensFor(test, ALICE);
    const actor = await test.kit.verifyAccessToken(tokens.access_token);
    expect(actor.address).toBe(ALICE);
    expect(actor.character).toEqual({ id: "char-1", name: "Pilot" });
    expect(actor.resource).toBe("http://127.0.0.1:8787/mcp");
  });
});
