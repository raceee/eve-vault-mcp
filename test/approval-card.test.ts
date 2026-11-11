import { describe, expect, it } from "vitest";

import { approvalCardToolResult, buildApprovalCardHtml } from "../src/approval-card.js";
import { ALICE, createTestKit, json, tokensFor } from "./helpers.js";
import { createMcpHandler } from "../src/mcp-http.js";
import { APPROVAL_CARD_RESOURCE_URI, approvalCardToolResult as card, toApprovalCardModel } from "../src/index.js";

describe("approval cards and action status", () => {
  it("always includes a plain approval URL in the tool text", async () => {
    const model = {
      id: "abc",
      title: "Wave",
      description: "Hello",
      approvalUrl: "http://127.0.0.1:8787/approve/abc",
      walletAddress: ALICE,
      expiresAt: Date.now() + 60_000,
      kind: "description",
      status: "pending",
    };
    const result = approvalCardToolResult(model);
    const text = result.content.find((block) => block.type === "text");
    expect(text?.type === "text" && text.text).toContain("http://127.0.0.1:8787/approve/abc");
    expect(result._meta["openai/outputTemplate"]).toBe(APPROVAL_CARD_RESOURCE_URI);
    expect(buildApprovalCardHtml(model)).toContain("Approve in EVE Vault");
    expect(buildApprovalCardHtml(model)).toContain("window.open");
    expect(buildApprovalCardHtml(model)).toContain("cannot reach the browser extension");
  });

  it("get_action_status reports expiry instead of hiding the action", async () => {
    const test = await createTestKit({ ttl: { preparedActionMs: 1_000 } });
    const prepared = await test.kit.prepareAction({
      walletAddress: ALICE,
      title: "Wave",
      description: "A toy action.",
    });
    test.clock.advance(1_001);
    const status = await test.kit.getActionStatus(prepared.id);
    expect(status.status).toBe("expired");
    const response = await test.kit.fetch(new Request(`http://127.0.0.1:8787/actions/${prepared.id}`));
    expect((await json(response)).status).toBe("expired");
  });

  it("MCP prepare tool returns a widget resource plus a text link", async () => {
    const test = await createTestKit();
    const tokens = await tokensFor(test, ALICE);
    const mcp = createMcpHandler({
      kit: test.kit,
      serverName: "Example dApp",
      tools: [
        {
          name: "prepare_wave",
          description: "Prepare a toy action",
          scopes: ["actions.prepare"],
          uiResourceUri: APPROVAL_CARD_RESOURCE_URI,
          handler: async (_args, actor) => {
            const prepared = await test.kit.prepareAction({
              walletAddress: actor.address,
              title: "Wave",
              description: "A toy action.",
            });
            const action = await test.kit.getActionStatus(prepared.id);
            return card(toApprovalCardModel(action, prepared.approvalUrl));
          },
        },
      ],
    });
    const response = await mcp(
      new Request("http://127.0.0.1:8787/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "prepare_wave", arguments: {} },
        }),
      }),
    );
    const body = await json(response);
    const result = body.result as { content: Array<{ type: string; text?: string }>; structuredContent: { approvalUrl: string } };
    expect(result.structuredContent.approvalUrl).toContain("/approve/");
    expect(result.content.some((block) => block.type === "text" && block.text?.includes("/approve/"))).toBe(true);
    expect(result.content.some((block) => block.type === "resource")).toBe(true);
  });

  it("enforces scopes on MCP tools", async () => {
    const test = await createTestKit();
    const tokens = await tokensFor(test, ALICE, "identity.read");
    const mcp = createMcpHandler({
      kit: test.kit,
      serverName: "Example dApp",
      tools: [
        {
          name: "prepare_wave",
          description: "Prepare a toy action",
          scopes: ["actions.prepare"],
          handler: async () => ({ ok: true }),
        },
      ],
    });
    const response = await mcp(
      new Request("http://127.0.0.1:8787/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "prepare_wave", arguments: {} },
        }),
      }),
    );
    const body = await json(response);
    expect(body.error).toBeTruthy();
  });
});
