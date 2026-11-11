import { connectWallet, signLoginMessage } from "./wallet.ts";

const app = document.getElementById("app");
if (!app) {
  throw new Error("#app missing");
}

const session = new URLSearchParams(window.location.search).get("session");

void boot();

async function boot(): Promise<void> {
  if (!session) {
    app!.innerHTML = `<p class="error">Missing session. Start from the MCP client's authorize URL.</p>`;
    return;
  }
  try {
    const challenge = await fetchChallenge(session);
    renderChallenge(challenge);
  } catch (error) {
    app!.innerHTML = `<p class="error">${escapeHtml(asError(error))}</p>`;
  }
}

type Challenge = {
  clientName: string;
  clientId: string;
  scopes: string[];
  issuer: string;
  message: string;
  expiresAt: number;
};

function kitBase(): string {
  return document.documentElement.dataset.eveVaultBase?.replace(/\/$/, "") ?? "";
}

async function fetchChallenge(sessionId: string): Promise<Challenge> {
  const response = await fetch(`${kitBase()}/login/challenge?session=${encodeURIComponent(sessionId)}`);
  const body = (await response.json()) as Challenge & { error_description?: string };
  if (!response.ok) {
    throw new Error(body.error_description ?? "Could not load sign-in challenge");
  }
  return body;
}

function renderChallenge(challenge: Challenge): void {
  app!.innerHTML = `
    <p><strong>${escapeHtml(challenge.clientName)}</strong> wants scoped access.</p>
    <p class="mono">Scopes: ${escapeHtml(challenge.scopes.join(" ") || "(none)")}</p>
    <p>Read this message, then sign it in EVE Vault. Signing does not move funds.</p>
    <pre class="mono">${escapeHtml(challenge.message)}</pre>
    <div class="row">
      <button type="button" id="connect">Connect EVE Vault</button>
      <button type="button" id="sign" disabled>Sign in</button>
    </div>
    <p id="status"></p>
  `;
  const status = document.getElementById("status")!;
  const sign = document.getElementById("sign") as HTMLButtonElement;
  document.getElementById("connect")!.addEventListener("click", () => {
    void (async () => {
      try {
        const { account } = await connectWallet();
        status.textContent = `Connected ${account.address}`;
        sign.disabled = false;
      } catch (error) {
        status.className = "error";
        status.textContent = asError(error);
      }
    })();
  });
  sign.addEventListener("click", () => {
    void (async () => {
      sign.disabled = true;
      status.textContent = "Waiting for EVE Vault…";
      try {
        const signed = await signLoginMessage(challenge.message);
        const response = await fetch(`${kitBase()}/login/complete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            session,
            address: signed.address,
            signature: signed.signature,
          }),
        });
        const body = (await response.json()) as { redirectUrl?: string; error_description?: string };
        if (!response.ok || !body.redirectUrl) {
          throw new Error(body.error_description ?? "Sign-in was rejected");
        }
        status.className = "ok";
        status.textContent = "Signed in. Returning to the agent…";
        window.location.assign(body.redirectUrl);
      } catch (error) {
        status.className = "error";
        status.textContent = asError(error);
        sign.disabled = false;
      }
    })();
  });
}

function asError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
