export function layout(options: { title: string; entry: "login" | "approve"; body: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0e1116;
      --panel: #171b22;
      --ink: #e8edf5;
      --muted: #9aa6b8;
      --line: #2a3140;
      --accent: #7ae0c3;
      --danger: #f08a8a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font: 15px/1.45 ui-sans-serif, system-ui, sans-serif;
      background: radial-gradient(1200px 500px at 50% -10%, #1c2433, var(--bg));
      color: var(--ink);
    }
    main {
      max-width: 40rem;
      margin: 0 auto;
      padding: 3rem 1.25rem 4rem;
    }
    h1 { font-size: 1.35rem; font-weight: 650; margin: 0 0 0.35rem; }
    p, li { color: var(--muted); }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 1.25rem;
      margin-top: 1.25rem;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: #0c0f14;
      border-radius: 10px;
      padding: 0.9rem;
      color: var(--ink);
      font-size: 0.85rem;
    }
    button {
      appearance: none;
      border: 0;
      border-radius: 10px;
      padding: 0.7rem 1rem;
      background: var(--accent);
      color: #08221a;
      font-weight: 650;
      cursor: pointer;
    }
    button[disabled] { opacity: 0.5; cursor: not-allowed; }
    button.secondary { background: transparent; color: var(--ink); border: 1px solid var(--line); }
    .row { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 1rem; }
    .error { color: var(--danger); }
    .ok { color: var(--accent); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    a { color: var(--accent); }
  </style>
</head>
<body>
  <main>
    ${options.body}
  </main>
  <script type="module" src="/assets/${options.entry}.js"></script>
</body>
</html>`;
}

export function loginPageHtml(): string {
  return layout({
    title: "Sign in with EVE Vault",
    entry: "login",
    body: `
      <p class="mono">Sign in with EVE Vault for MCP</p>
      <h1>Authorize an AI agent</h1>
      <p>The agent receives a short-lived, scoped token. It cannot sign with your wallet. Any on-chain action comes back here as an approval link that you sign yourself.</p>
      <div class="panel" id="app">
        <p>Loading challenge…</p>
      </div>
    `,
  });
}

export function approvePageHtml(): string {
  return layout({
    title: "Approve with EVE Vault",
    entry: "approve",
    body: `
      <p class="mono">Prepared action</p>
      <h1>Sign this in EVE Vault</h1>
      <p>Review what the agent prepared. Your wallet signs and executes; the agent never holds your key.</p>
      <div class="panel" id="app">
        <p>Loading…</p>
      </div>
    `,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
