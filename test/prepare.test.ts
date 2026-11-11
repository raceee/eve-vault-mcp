import { describe, expect, it } from "vitest";

import { ALICE, BOB, createTestKit, json } from "./helpers.js";

describe("prepared action approval links", () => {
  it("returns an approval URL bound to the player wallet", async () => {
    const test = await createTestKit();
    const prepared = await test.kit.prepareAction({
      walletAddress: ALICE,
      title: "Wave",
      description: "A toy action that does not move value.",
    });
    expect(prepared.approvalUrl).toBe(`http://127.0.0.1:8787/approve/${prepared.id}`);
    const response = await test.kit.fetch(new Request(`http://127.0.0.1:8787/approve/${prepared.id}/details`));
    const body = await json(response);
    expect(response.status).toBe(200);
    expect(body.walletAddress).toBe(ALICE);
    expect(body.title).toBe("Wave");
    expect(body.kind).toBe("description");
  });

  it("rejects an expired approval link", async () => {
    const test = await createTestKit({ ttl: { preparedActionMs: 1_000 } });
    const prepared = await test.kit.prepareAction({
      walletAddress: ALICE,
      title: "Wave",
      description: "A toy action that does not move value.",
    });
    test.clock.advance(1_001);
    const response = await test.kit.fetch(new Request(`http://127.0.0.1:8787/approve/${prepared.id}/details`));
    expect(response.status).toBe(410);
    const body = await json(response);
    expect(body.error).toBe("expired");
  });

  it("rejects completion from the wrong wallet", async () => {
    const test = await createTestKit();
    const prepared = await test.kit.prepareAction({
      walletAddress: ALICE,
      title: "Wave",
      description: "A toy action that does not move value.",
    });
    const response = await test.kit.fetch(
      new Request(`http://127.0.0.1:8787/approve/${prepared.id}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: BOB }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("marks a matching wallet completion as executed", async () => {
    const test = await createTestKit();
    const prepared = await test.kit.prepareAction({
      walletAddress: ALICE,
      title: "Wave",
      description: "A toy action that does not move value.",
      transaction: { format: "bcs-base64", data: "AAAA" },
    });
    const response = await test.kit.fetch(
      new Request(`http://127.0.0.1:8787/approve/${prepared.id}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: ALICE, digest: "0xdigest" }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.status).toBe("executed");
    expect(body.digest).toBe("0xdigest");
  });
});
