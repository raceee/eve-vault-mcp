import { serve } from "@hono/node-server";
import { Hono } from "hono";

import {
  APPROVAL_CARD_RESOURCE_URI,
  approvalCardToolResult,
  createEveVaultMcpKit,
  createMcpHandler,
  createMystenVerifier,
  createWorldApiCharacterResolver,
  prepareToolMeta,
  toApprovalCardModel,
  type BuilderTool,
} from "../src/index.js";

const port = Number(process.env.PORT ?? 8787);
const issuer = process.env.ISSUER ?? `http://127.0.0.1:${port}`;
const scopes = ["identity.read", "actions.prepare", "actions.status"];

const kit = await createEveVaultMcpKit({
  issuer,
  resource: `${issuer}/mcp`,
  serverName: process.env.SERVER_NAME ?? "Example Frontier dApp",
  scopes,
  verifier: createMystenVerifier({
    network: (process.env.SUI_NETWORK as "mainnet" | "testnet" | "devnet" | "localnet") ?? "mainnet",
  }),
  ...(process.env.WORLD_API_BASE
    ? { characterResolver: createWorldApiCharacterResolver({ baseUrl: process.env.WORLD_API_BASE }) }
    : {}),
});

const tools: BuilderTool[] = [
  {
    name: "whoami",
    description: "Return the connected wallet address and character, if known.",
    scopes: ["identity.read"],
    handler: async (_args, actor) => ({
      address: actor.address,
      character: actor.character ?? null,
      scopes: actor.scopes,
    }),
  },
  {
    name: "prepare_wave",
    description:
      "Prepare a toy action the player must approve in EVE Vault. Returns an approval card and a plain link.",
    scopes: ["actions.prepare"],
    uiResourceUri: APPROVAL_CARD_RESOURCE_URI,
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "Optional text to show on the approval card" },
      },
    },
    handler: async (args, actor) => {
      const prepared = await kit.prepareAction({
        walletAddress: actor.address,
        title: "Wave",
        description:
          typeof args.message === "string" && args.message.trim()
            ? args.message.trim()
            : "A toy prepared action. Nothing is submitted on-chain.",
      });
      const action = await kit.getActionStatus(prepared.id);
      const result = approvalCardToolResult(toApprovalCardModel(action, prepared.approvalUrl));
      return {
        ...result,
        _meta: { ...result._meta, ...prepareToolMeta() },
      };
    },
  },
  {
    name: "get_action_status",
    description: "Poll a prepared action after the player opens the approval link.",
    scopes: ["actions.status"],
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
      },
    },
    handler: async (args, actor) => {
      const id = String(args.id ?? "");
      const action = await kit.getActionStatus(id);
      if (action.walletAddress !== actor.address) {
        throw new Error("This action belongs to a different wallet");
      }
      return {
        id: action.id,
        status: action.status,
        title: action.title,
        expiresAt: action.expiresAt,
        digest: action.digest ?? null,
      };
    },
  },
];

const mcp = createMcpHandler({
  kit,
  serverName: kit.config.serverName,
  tools,
});

const app = new Hono();
app.route("/", kit.app);
app.all("/mcp", (c) => mcp(c.req.raw));

serve({ fetch: app.fetch, port }, () => {
  console.log(`${kit.config.serverName} listening on ${issuer}`);
  console.log(`MCP: ${issuer}/mcp`);
  console.log("The agent cannot sign. Players approve in EVE Vault via the returned link or card.");
});
