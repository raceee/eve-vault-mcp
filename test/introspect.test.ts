import { describe, expect, it } from "vitest";

import { ALICE, createTestKit, json, tokensFor } from "./helpers.js";

describe("token introspection", () => {
  it("reports an active token and then inactive after revoke", async () => {
    const test = await createTestKit();
    const tokens = await tokensFor(test, ALICE);
    const active = await test.kit.fetch(
      new Request("http://127.0.0.1:8787/introspect", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: tokens.access_token }),
      }),
    );
    const body = await json(active);
    expect(body.active).toBe(true);
    expect(body.wallet_address).toBe(ALICE);
    expect(body.aud).toBe("http://127.0.0.1:8787/mcp");

    await test.kit.revokeToken(tokens.access_token);
    const inactive = await json(
      await test.kit.fetch(
        new Request("http://127.0.0.1:8787/introspect", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: tokens.access_token }),
        }),
      ),
    );
    expect(inactive.active).toBe(false);
  });
});
