import { appearanceStyleBlock, type KitAppearance } from "./appearance.js";

export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
export const OPENAI_WIDGET_MIME_TYPE = "text/html+skybridge";
export const STRUCTURED_CARD_RESOURCE_URI = "ui://eve-vault-mcp/structured-card.html";

export type McpContentBlock =
  | { type: "text"; text: string }
  | {
      type: "resource";
      resource: {
        uri: string;
        mimeType: string;
        text: string;
        _meta?: Record<string, unknown>;
      };
    }
  | {
      type: "resource_link";
      uri: string;
      name: string;
      mimeType?: string;
    };

export type McpToolResult = {
  content: McpContentBlock[];
  structuredContent: Record<string, unknown>;
  _meta: Record<string, unknown>;
};

export type UiResource = {
  uri: string;
  name: string;
  mimeType?: string;
  text: string;
  _meta?: Record<string, unknown>;
};

export type HtmlCardOptions = {
  uri: string;
  name: string;
  html: string;
  text: string;
  structuredContent: Record<string, unknown>;
};

export type StructuredCardRow = {
  label: string;
  value: string;
};

export type StructuredCardItem = {
  title: string;
  subtitle?: string;
  rows?: StructuredCardRow[];
};

/**
 * Display-only in-chat card. All fields must already be in the tool result;
 * the widget never fetches, never talks to a wallet, and never loads
 * external scripts or styles. An optional `approvalUrl` is opened in a
 * new tab (EVE Vault cannot inject into the host iframe).
 */
export type StructuredCardModel = {
  title: string;
  subtitle?: string;
  rows?: StructuredCardRow[];
  items?: StructuredCardItem[];
  approvalUrl?: string;
  approvalLabel?: string;
  footer?: string;
};

export const LOCKED_DOWN_WIDGET_CSP = {
  connectDomains: [] as string[],
  resourceDomains: [] as string[],
};

export function lockedDownWidgetMeta(uri: string): Record<string, unknown> {
  return {
    ui: {
      resourceUri: uri,
      prefersBorder: true,
      csp: {
        connectDomains: [...LOCKED_DOWN_WIDGET_CSP.connectDomains],
        resourceDomains: [...LOCKED_DOWN_WIDGET_CSP.resourceDomains],
      },
    },
    "openai/outputTemplate": uri,
    "openai/widgetAccessible": true,
    "openai/resultCanProduceWidget": true,
    "openai/widgetCsp": { connect_domains: [], resource_domains: [] },
  };
}

export function htmlCardToolResult(options: HtmlCardOptions): McpToolResult {
  const resourceMeta = {
    ui: {
      prefersBorder: true,
      csp: {
        connectDomains: [...LOCKED_DOWN_WIDGET_CSP.connectDomains],
        resourceDomains: [...LOCKED_DOWN_WIDGET_CSP.resourceDomains],
      },
    },
    "openai/widgetCsp": { connect_domains: [], resource_domains: [] },
  };
  return {
    content: [
      { type: "text", text: options.text },
      {
        type: "resource",
        resource: {
          uri: options.uri,
          mimeType: MCP_APP_MIME_TYPE,
          text: options.html,
          _meta: resourceMeta,
        },
      },
      {
        type: "resource_link",
        uri: options.uri,
        name: options.name,
        mimeType: MCP_APP_MIME_TYPE,
      },
    ],
    structuredContent: options.structuredContent,
    _meta: lockedDownWidgetMeta(options.uri),
  };
}

export function buildStructuredCardHtml(
  model: StructuredCardModel,
  appearance?: KitAppearance,
): string {
  const payload = JSON.stringify(model).replace(/</g, "\\u003c");
  const extraHead = appearance?.extraHeadHtml ?? "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title></title>
  ${extraHead}
  <style>
    ${appearanceStyleBlock(appearance)}
    body {
      margin: 0;
      font: 14px/1.45 ui-sans-serif, system-ui, sans-serif;
      background: var(--bg);
      color: var(--ink);
    }
    .card { padding: 1rem 1.1rem 1.15rem; }
    h1 { font-size: 1.05rem; margin: 0 0 0.4rem; }
    h2 { font-size: 0.95rem; margin: 0 0 0.25rem; }
    p, dt, dd { margin: 0.2rem 0; color: var(--muted); }
    .item {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 0.7rem 0.8rem;
      margin-top: 0.65rem;
    }
    dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.15rem 0.75rem; margin: 0.35rem 0 0; }
    dt { font-weight: 650; color: var(--ink); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; }
    a.button, button {
      display: inline-block; margin-top: 0.8rem; padding: 0.65rem 0.9rem;
      border: 0; border-radius: 10px; background: var(--accent); color: var(--accent-ink);
      font-weight: 700; text-decoration: none; cursor: pointer;
    }
    .note { font-size: 12px; margin-top: 0.75rem; }
    #approveWrap { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1 id="title"></h1>
    <p id="subtitle"></p>
    <dl id="rows"></dl>
    <div id="items"></div>
    <div id="approveWrap">
      <a class="button" id="approve" target="_blank" rel="noopener noreferrer"></a>
      <p class="note">Signing opens in a new tab. This chat card cannot reach a browser wallet extension.</p>
      <p class="mono" id="link"></p>
    </div>
    <p class="note" id="footer"></p>
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
    document.title = data.title || '';
    document.getElementById('title').textContent = data.title || '';
    document.getElementById('subtitle').textContent = data.subtitle || '';
    document.getElementById('footer').textContent = data.footer || '';
    const rows = document.getElementById('rows');
    (data.rows || []).forEach(function (row) {
      const dt = document.createElement('dt');
      dt.textContent = row.label || '';
      const dd = document.createElement('dd');
      dd.textContent = row.value || '';
      rows.appendChild(dt);
      rows.appendChild(dd);
    });
    const items = document.getElementById('items');
    (data.items || []).forEach(function (item) {
      const wrap = document.createElement('div');
      wrap.className = 'item';
      const h = document.createElement('h2');
      h.textContent = item.title || '';
      wrap.appendChild(h);
      if (item.subtitle) {
        const sub = document.createElement('p');
        sub.textContent = item.subtitle;
        wrap.appendChild(sub);
      }
      if (item.rows && item.rows.length) {
        const dl = document.createElement('dl');
        item.rows.forEach(function (row) {
          const dt = document.createElement('dt');
          dt.textContent = row.label || '';
          const dd = document.createElement('dd');
          dd.textContent = row.value || '';
          dl.appendChild(dt);
          dl.appendChild(dd);
        });
        wrap.appendChild(dl);
      }
      items.appendChild(wrap);
    });
    const url = data.approvalUrl || '';
    if (url) {
      document.getElementById('approveWrap').style.display = 'block';
      const approve = document.getElementById('approve');
      approve.setAttribute('href', url);
      approve.textContent = data.approvalLabel || 'Approve in EVE Vault';
      approve.addEventListener('click', function (event) {
        event.preventDefault();
        window.open(url, '_blank', 'noopener,noreferrer');
      });
      document.getElementById('link').textContent = url;
    }
  </script>
</body>
</html>`;
}

export function structuredCardToolResult(
  model: StructuredCardModel,
  options?: { uri?: string; name?: string; text?: string; appearance?: KitAppearance },
): McpToolResult {
  const uri = options?.uri ?? STRUCTURED_CARD_RESOURCE_URI;
  const html = buildStructuredCardHtml(model, options?.appearance);
  const text =
    options?.text ??
    [
      model.title,
      model.subtitle,
      ...(model.rows ?? []).map((row) => `${row.label}: ${row.value}`),
      ...(model.items ?? []).map((item) => item.title),
      model.approvalUrl ? `Approve: ${model.approvalUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  return htmlCardToolResult({
    uri,
    name: options?.name ?? "Structured card",
    html,
    text,
    structuredContent: model,
  });
}

export function structuredCardResourceContents(appearance?: KitAppearance): UiResource {
  return {
    uri: STRUCTURED_CARD_RESOURCE_URI,
    name: "Structured card",
    mimeType: MCP_APP_MIME_TYPE,
    text: buildStructuredCardHtml({ title: "Waiting for tool output from the host." }, appearance),
    _meta: { ui: { prefersBorder: true } },
  };
}
