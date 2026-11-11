import {
  APPROVAL_CARD_RESOURCE_URI,
  approvalCardResourceContents,
  type McpToolResult,
} from "./approval-card.js";
import { isKitError } from "./errors.js";
import type { EveVaultMcpKit } from "./kit.js";
import { authenticateActor, wwwAuthenticate } from "./mcp.js";
import { assertScopes } from "./scopes.js";
import type { Actor } from "./types.js";

export type BuilderTool = {
  name: string;
  description: string;
  scopes: string[];
  inputSchema?: Record<string, unknown>;
  /** When set, hosts that support MCP Apps can render this tool as a widget. */
  uiResourceUri?: string;
  handler: (args: Record<string, unknown>, actor: Actor) => Promise<McpToolResult | Record<string, unknown>>;
};

type JsonRpc = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

export function createMcpHandler(options: {
  kit: EveVaultMcpKit;
  serverName: string;
  serverVersion?: string;
  tools: BuilderTool[];
}): (request: Request) => Promise<Response> {
  const tools = new Map(options.tools.map((tool) => [tool.name, tool]));
  const resourceMetadataUrl = options.kit.resourceMetadataUrl();

  return async (request: Request) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204 });
    }
    if (request.method !== "POST") {
      return jsonRpcError(null, -32600, "MCP is POST-only in this template", 405);
    }

    let actor: Actor;
    try {
      actor = await authenticateActor(options.kit, request.headers.get("Authorization"));
    } catch (error) {
      const description = isKitError(error) ? error.message : "invalid token";
      return new Response(JSON.stringify({ error: "invalid_token", error_description: description }), {
        status: 401,
        headers: {
          "content-type": "application/json",
          "www-authenticate": wwwAuthenticate(resourceMetadataUrl, "invalid_token"),
        },
      });
    }

    let message: JsonRpc;
    try {
      message = (await request.json()) as JsonRpc;
    } catch {
      return jsonRpcError(null, -32700, "Parse error", 400);
    }

    const id = message.id ?? null;
    try {
      const result = await dispatch(message, {
        actor,
        tools,
        serverName: options.serverName,
        serverVersion: options.serverVersion ?? "0.1.0",
      });
      if (message.id === undefined) {
        return new Response(null, { status: 202 });
      }
      return Response.json({ jsonrpc: "2.0", id, result });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Internal error";
      const code = isKitError(error) && error.status === 403 ? -32001 : -32000;
      return jsonRpcError(id, code, messageText, isKitError(error) ? error.status : 200);
    }
  };
}

async function dispatch(
  message: JsonRpc,
  ctx: {
    actor: Actor;
    tools: Map<string, BuilderTool>;
    serverName: string;
    serverVersion: string;
  },
): Promise<unknown> {
  switch (message.method) {
    case "initialize":
      return {
        protocolVersion: "2025-06-18",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: ctx.serverName, version: ctx.serverVersion },
      };
    case "notifications/initialized":
    case "notifications/cancelled":
      return {};
    case "ping":
      return {};
    case "tools/list":
      return {
        tools: [...ctx.tools.values()].map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
          ...(tool.uiResourceUri
            ? {
                _meta: {
                  ui: { resourceUri: tool.uiResourceUri },
                  "openai/outputTemplate": tool.uiResourceUri,
                },
              }
            : {}),
        })),
      };
    case "tools/call": {
      const name = String(message.params?.name ?? "");
      const tool = ctx.tools.get(name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }
      assertScopes(ctx.actor, tool.scopes);
      const args = (message.params?.arguments as Record<string, unknown> | undefined) ?? {};
      const output = await tool.handler(args, ctx.actor);
      if (isToolResult(output)) {
        return output;
      }
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
    case "resources/list":
      return {
        resources: [
          {
            uri: APPROVAL_CARD_RESOURCE_URI,
            name: "EVE Vault approval card",
            mimeType: approvalCardResourceContents().mimeType,
          },
        ],
      };
    case "resources/read": {
      const uri = String(message.params?.uri ?? "");
      if (uri !== APPROVAL_CARD_RESOURCE_URI) {
        throw new Error(`Unknown resource: ${uri}`);
      }
      return { contents: [approvalCardResourceContents()] };
    }
    default:
      throw new Error(`Unsupported method: ${message.method ?? "(missing)"}`);
  }
}

function isToolResult(value: unknown): value is McpToolResult {
  return Boolean(value && typeof value === "object" && "content" in value);
}

function jsonRpcError(id: string | number | null, code: number, message: string, httpStatus: number) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: httpStatus });
}
