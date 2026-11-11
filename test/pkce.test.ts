import { describe, expect, it } from "vitest";

import { s256Challenge, verifyS256 } from "../src/pkce.js";
import {
  ALICE,
  createTestKit,
  exchangeCode,
  json,
  loginAs,
  startLogin,
} from "./helpers.js";

describe("PKCE", () => {
  it("accepts the matching S256 verifier", async () => {
    const test = await createTestKit();
    const { code, verifier } = await loginAs(test, ALICE);
    const response = await exchangeCode(test.kit, code, verifier);
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.token_type).toBe("Bearer");
    expect(body.access_token).toMatch(/^eva_/);
  });

  it("rejects a wrong code_verifier", async () => {
    const test = await createTestKit();
    const { code } = await loginAs(test, ALICE);
    const response = await exchangeCode(test.kit, code, "b".repeat(64));
    const body = await json(response);
    expect(response.status).toBe(400);
    expect(body.error).toBe("invalid_grant");
    expect(String(body.error_description).toLowerCase()).toMatch(/pkce/);
  });

  it("rejects authorization requests without S256 PKCE", async () => {
    const test = await createTestKit();
    const url = new URL("http://127.0.0.1:8787/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "static-toy");
    url.searchParams.set("redirect_uri", "http://127.0.0.1:9999/callback");
    url.searchParams.set("code_challenge_method", "plain");
    url.searchParams.set("code_challenge", "a".repeat(64));
    const response = await test.kit.fetch(new Request(url), { redirect: "manual" });
    expect(response.status).toBe(302);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("error=");
    expect(location).toContain("S256");
  });

  it("does not start login when code_challenge is missing", async () => {
    const test = await createTestKit();
    await expect(startLogin(test.kit, { challenge: "" })).rejects.toThrow();
  });

  it("S256 helper matches the RFC 7636 vector shape", () => {
    const verifier = "a".repeat(43);
    const challenge = s256Challenge(verifier);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifyS256(verifier, challenge)).toBe(true);
    expect(verifyS256(verifier, `${challenge}x`)).toBe(false);
  });
});
