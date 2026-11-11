import type { KitAppearance } from "./appearance.js";
import {
  htmlCardToolResult,
  lockedDownWidgetMeta,
  MCP_APP_MIME_TYPE,
  OPENAI_WIDGET_MIME_TYPE,
  type McpToolResult,
  type UiResource,
} from "./html-card.js";
import type { PreparedAction } from "./types.js";

export const APPROVAL_CARD_RESOURCE_URI = "ui://eve-vault-mcp/approval-card.html";
export { MCP_APP_MIME_TYPE, OPENAI_WIDGET_MIME_TYPE };
export type { McpToolResult };

export type ApprovalCardModel = {
  id: string;
  title: string;
  description: string;
  approvalUrl: string;
  walletAddress: string;
  expiresAt: number;
  kind: string;
  status: string;
};

export function toApprovalCardModel(
  action: PreparedAction,
  approvalUrl: string,
): ApprovalCardModel {
  return {
    id: action.id,
    title: action.title,
    description: action.description,
    approvalUrl,
    walletAddress: action.walletAddress,
    expiresAt: action.expiresAt,
    kind: action.kind,
    status: action.status,
  };
}

/**
 * Self-contained MCP Apps / ChatGPT Apps widget. The Approve button opens
 * the approval URL in a new tab. EVE Vault's content script does not set
 * `allFrames: true` and MCP hosts sandbox widgets in a cross-origin iframe,
 * so the extension is not expected to appear inside the card.
 */
export function buildApprovalCardHtml(model: ApprovalCardModel, appearance?: KitAppearance): string {
  const payload = JSON.stringify(model).replace(/</g, "\\u003c");
  const extraHead = appearance?.extraHeadHtml ?? "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Approve in EVE Vault</title>
  ${extraHead}
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font: 14px/1.45 ui-sans-serif, system-ui, sans-serif; background: #12161d; color: #e8edf5; }
    .card { padding: 1rem 1.1rem 1.15rem; }
    h1 { font-size: 1.05rem; margin: 0 0 0.4rem; }
    p { margin: 0.35rem 0; color: #9aa6b8; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; }
    a.button, button {
      display: inline-block; margin-top: 0.8rem; padding: 0.65rem 0.9rem;
      border: 0; border-radius: 10px; background: #7ae0c3; color: #08221a;
      font-weight: 700; text-decoration: none; cursor: pointer;
    }
    .note { font-size: 12px; margin-top: 0.75rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1 id="title"></h1>
    <p id="description"></p>
    <p class="mono" id="wallet"></p>
    <p class="mono" id="expiry"></p>
    <a class="button" id="approve" target="_blank" rel="noopener noreferrer">Approve in EVE Vault</a>
    <p class="note">EVE Vault will open in a new tab. This chat card cannot reach the browser extension.</p>
    <p class="mono" id="link"></p>
  </div>
  <script>
    const embedded = ${payload};
    function readHost() {
      try {
        if (window.openai && window.openai.toolOutput) return window.openai.toolOutput;
      } catch (e) {}
      return null;
    }
    const data = Object.assign({}, embedded, readHost() || {});
    document.getElementById('title').textContent = data.title || 'Prepared action';
    document.getElementById('description').textContent = data.description || '';
    document.getElementById('wallet').textContent = 'Wallet ' + (data.walletAddress || '');
    document.getElementById('expiry').textContent = data.expiresAt ? ('Expires ' + new Date(data.expiresAt).toISOString()) : '';
    const url = data.approvalUrl || '';
    const approve = document.getElementById('approve');
    approve.setAttribute('href', url);
    approve.addEventListener('click', function (event) {
      event.preventDefault();
      window.open(url, '_blank', 'noopener,noreferrer');
    });
    document.getElementById('link').textContent = url;
  </script>
</body>
</html>`;
}

export function approvalCardToolResult(
  model: ApprovalCardModel,
  appearance?: KitAppearance,
): McpToolResult {
  const html = buildApprovalCardHtml(model, appearance);
  const text = [
    `The agent cannot sign this for you.`,
    `Approve in EVE Vault: ${model.approvalUrl}`,
    `Action: ${model.title}`,
    model.description,
    `Wallet: ${model.walletAddress}`,
    `Status: ${model.status}`,
    `Expires: ${new Date(model.expiresAt).toISOString()}`,
    `After you approve, ask the agent to call get_action_status with id ${model.id}.`,
  ].join("\n");

  return htmlCardToolResult({
    uri: APPROVAL_CARD_RESOURCE_URI,
    name: "EVE Vault approval card",
    html,
    text,
    structuredContent: model,
  });
}

export function approvalCardResourceContents(appearance?: KitAppearance): UiResource {
  return {
    uri: APPROVAL_CARD_RESOURCE_URI,
    name: "EVE Vault approval card",
    mimeType: MCP_APP_MIME_TYPE,
    text: buildApprovalCardHtml(
      {
        id: "",
        title: "Prepared action",
        description: "Waiting for tool output from the host.",
        approvalUrl: "",
        walletAddress: "",
        expiresAt: 0,
        kind: "description",
        status: "pending",
      },
      appearance,
    ),
    _meta: {
      ui: { prefersBorder: true },
    },
  };
}

export function prepareToolMeta(): Record<string, unknown> {
  return lockedDownWidgetMeta(APPROVAL_CARD_RESOURCE_URI);
}
