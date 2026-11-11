import { describe, expect, it } from "vitest";

import { createTestKit, json } from "./helpers.js";

describe("standalone sign-in nonces", () => {
  it("issues a nonce that can be consumed once", async () => {
    const test = await createTestKit();
    const issued = await test.kit.issueNonce({
      purpose: "wallet-proof",
      metadata: { action: "profile.save" },
    });
    expect(issued.sessionId).toBeUndefined();
    expect(issued.purpose).toBe("wallet-proof");
    expect(issued.metadata).toEqual({ action: "profile.save" });

    const first = await test.kit.consumeNonce(issued.id);
    expect(first.value).toBe(issued.value);
    await expect(test.kit.consumeNonce(issued.id)).rejects.toThrow(/already been used/i);
  });

  it("rejects an expired standalone nonce", async () => {
    const test = await createTestKit({ ttl: { nonceMs: 1_000 } });
    const issued = await test.kit.issueNonce();
    test.clock.advance(1_001);
    await expect(test.kit.consumeNonce(issued.id)).rejects.toThrow(/expired/i);
  });

  it("exposes issue and consume over HTTP", async () => {
    const test = await createTestKit();
    const created = await test.kit.fetch(
      new Request("http://127.0.0.1:8787/nonces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "wallet-proof", metadata: { action: "profile.save" } }),
      }),
    );
    expect(created.status).toBe(201);
    const body = await json(created);
    expect(body.id).toBeTruthy();
    expect(body.value).toBeTruthy();
    expect(body.purpose).toBe("wallet-proof");

    const consumed = await test.kit.fetch(
      new Request(`http://127.0.0.1:8787/nonces/${body.id}/consume`, { method: "POST" }),
    );
    expect(consumed.status).toBe(200);
    expect((await json(consumed)).value).toBe(body.value);

    const replay = await test.kit.fetch(
      new Request(`http://127.0.0.1:8787/nonces/${body.id}/consume`, { method: "POST" }),
    );
    expect(replay.status).toBe(401);
  });
});
