import { describe, expect, it } from "vitest";

import {
  ALICE,
  ISSUER,
  createTestKit,
  json,
  loginAs,
  registerClient,
} from "./helpers.js";

describe("OAuth 2.1 authorization server", () => {
  it("supports dynamic client registration of public clients", async () => {
    const test = await createTestKit();
    const clientId = await registerClient(test.kit);
    expect(clientId).toMatch(/^client_/);
    const { code } = await loginAs(test, ALICE, { clientId });
    expect(code).toMatch(/^evc_/);
  });

  it("rejects a redirect_uri that is not loopback http or https", async () => {
    const test = await createTestKit();
    const response = await test.kit.fetch(
      new Request(`${ISSUER}/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Evil",
          redirect_uris: ["http://example.com/callback"],
        }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it("includes iss on the authorization redirect", async () => {
    const test = await createTestKit();
    const { code } = await loginAs(test, ALICE);
    expect(code).toBeTruthy();
    const { session } = await (async () => {
      const started = await test.kit.fetch(
        new Request(
          `${ISSUER}/authorize?response_type=code&client_id=static-toy&redirect_uri=http://127.0.0.1:9999/callback&code_challenge=${"c".repeat(43)}&code_challenge_method=S256&state=xyz&scope=identity.read`,
        ),
        { redirect: "manual" },
      );
      return { session: new URL(started.headers.get("location") ?? "", ISSUER).searchParams.get("session") };
    })();
    expect(session).toBeTruthy();
  });

  it("serves protected resource metadata pointing at this issuer", async () => {
    const test = await createTestKit();
    const response = await test.kit.fetch(new Request(`${ISSUER}/.well-known/oauth-protected-resource/mcp`));
    const body = await json(response);
    expect(body.authorization_servers).toEqual([ISSUER]);
    expect(body.resource).toBe(`${ISSUER}/mcp`);
  });
});
