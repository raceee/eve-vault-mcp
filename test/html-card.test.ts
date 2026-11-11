import { describe, expect, it } from "vitest";

import { createMcpHandler } from "../src/mcp-http.js";
import {
  STRUCTURED_CARD_RESOURCE_URI,
  buildStructuredCardHtml,
  structuredCardToolResult,
} from "../src/html-card.js";
import { ALICE, createTestKit, json, tokensFor } from "./helpers.js";

describe("locked-down structured cards", () => {
  it("renders only structuredContent and opens approval URLs in a new tab", () => {
    const html = buildStructuredCardHtml({
      title: "Open jobs",
      items: [{ title: "PELU-PV-1", rows: [{ label: "Status", value: "open" }] }],
      approvalUrl: "http://127.0.0.1:8787/approve/abc",
    });
    expect(html).toContain("window.open");
    expect(html).not.toMatch(/https?:\/\/[^"']+\.(js|css)/);
    expect(html).not.toContain("<script src");
    expect(html).not.toContain("fetch(");
    expect(html).not.toContain("signAndExecute");
    expect(html).toContain("noopener");
  });

  it("tool result includes MCP Apps resource, ChatGPT outputTemplate, and empty CSP", () => {
    const result = structuredCardToolResult({
      title: "Job",
      rows: [{ label: "Flight", value: "PELU-1" }],
    });
    expect(result._meta["openai/outputTemplate"]).toBe(STRUCTURED_CARD_RESOURCE_URI);
    expect(result._meta.ui).toMatchObject({
      resourceUri: STRUCTURED_CARD_RESOURCE_URI,
      csp: { connectDomains: [], resourceDomains: [] },
    });
    expect(result.content.some((block) => block.type === "text")).toBe(true);
    expect(result.content.some((block) => block.type === "resource")).toBe(true);
  });

  it("MCP handler lists the structured card resource and serves it", async () => {
    const test = await createTestKit();
    const tokens = await tokensFor(test, ALICE, "identity.read");
    const mcp = createMcpHandler({
      kit: test.kit,
      serverName: "Example dApp",
      tools: [
        {
          name: "list_jobs",
          description: "List jobs",
          scopes: ["identity.read"],
          uiResourceUri: STRUCTURED_CARD_RESOURCE_URI,
          handler: async () =>
            structuredCardToolResult({
              title: "Jobs",
              items: [{ title: "One" }],
            }),
        },
      ],
    });
    const listed = await mcp(
      new Request("http://127.0.0.1:8787/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "resources/list" }),
      }),
    );
    const listBody = await json(listed);
    const uris = (listBody.result as { resources: Array<{ uri: string }> }).resources.map((row) => row.uri);
    expect(uris).toContain(STRUCTURED_CARD_RESOURCE_URI);
    expect(uris).toContain("ui://eve-vault-mcp/approval-card.html");

    const called = await mcp(
      new Request("http://127.0.0.1:8787/mcp", {
        method: "POST",
        headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "list_jobs", arguments: {} },
        }),
      }),
    );
    const callBody = await json(called);
    const result = callBody.result as {
      structuredContent: { title: string };
      _meta: { "openai/outputTemplate": string };
    };
    expect(result.structuredContent.title).toBe("Jobs");
    expect(result._meta["openai/outputTemplate"]).toBe(STRUCTURED_CARD_RESOURCE_URI);
  });
});
