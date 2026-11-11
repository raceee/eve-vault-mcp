import { describe, expect, it } from "vitest";

import {
  ALICE,
  challengeMessage,
  completeWithSignature,
  createTestKit,
  json,
  startLogin,
} from "./helpers.js";

describe("login nonce", () => {
  it("is single-use: a second complete with the same signature is rejected", async () => {
    const test = await createTestKit();
    const { session } = await startLogin(test.kit);
    const message = await challengeMessage(test.kit, session);
    const signature = test.verifier.enroll(ALICE, message);

    const first = await completeWithSignature(test.kit, session, ALICE, signature);
    expect(first.status).toBe(200);

    const second = await completeWithSignature(test.kit, session, ALICE, signature);
    const body = await json(second);
    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(String(body.error_description).toLowerCase()).toMatch(/already|nonce|session/);
  });

  it("rejects an expired nonce", async () => {
    const test = await createTestKit();
    const { session } = await startLogin(test.kit);
    const message = await challengeMessage(test.kit, session);
    const signature = test.verifier.enroll(ALICE, message);

    test.clock.advance(6 * 60 * 1000);

    const expired = await completeWithSignature(test.kit, session, ALICE, signature);
    const body = await json(expired);
    expect(expired.status).toBeGreaterThanOrEqual(400);
    expect(String(body.error_description).toLowerCase()).toMatch(/expir/);
  });

  it("issues a new nonce per authorization session", async () => {
    const test = await createTestKit();
    const first = await startLogin(test.kit, { state: "one" });
    const second = await startLogin(test.kit, { state: "two" });
    const messageOne = await challengeMessage(test.kit, first.session);
    const messageTwo = await challengeMessage(test.kit, second.session);
    expect(first.session).not.toBe(second.session);
    expect(messageOne).not.toBe(messageTwo);
    expect(messageOne).toMatch(/^Sign in with EVE Vault for MCP/m);
    expect(messageOne).toContain("Nonce: ");
  });
});
