import { describe, expect, it } from "vitest";

import { createPostgresStore } from "../src/stores/postgres.js";

describe("postgres store claims", () => {
  it("consumes a nonce with a single UPDATE ... WHERE unconsumed", async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = [];
    const store = createPostgresStore({
      async query(text, values) {
        calls.push(values === undefined ? { text } : { text, values });
        if (text.includes("RETURNING body")) {
          return { rows: [{ body: { id: "n1", value: "v1", consumedAt: 9 } }] };
        }
        return { rows: [] };
      },
    });
    const consumed = await store.consumeNonce("n1", 9);
    expect(consumed?.consumedAt).toBe(9);
    const consumeCall = calls.find((call) => call.text.includes("eve_vault_nonces") && call.text.includes("UPDATE"));
    expect(consumeCall?.text).toMatch(/COALESCE\(body->>\$2, ''\) = ''/);
    expect(consumeCall?.values).toEqual(["n1", "consumedAt", 9]);
  });

  it("returns undefined when the claim updates no row", async () => {
    const store = createPostgresStore({
      async query() {
        return { rows: [] };
      },
    });
    await expect(store.consumeNonce("missing", 1)).resolves.toBeUndefined();
  });
});
