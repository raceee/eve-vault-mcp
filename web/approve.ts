import { connectWallet, signAndExecute } from "./wallet.ts";

const app = document.getElementById("app");
if (!app) {
  throw new Error("#app missing");
}

function kitBase(): string {
  return document.documentElement.dataset.eveVaultBase?.replace(/\/$/, "") ?? "";
}

const id = window.location.pathname.split("/").pop();

void boot();

async function boot(): Promise<void> {
  if (!id) {
    app!.innerHTML = `<p class="error">Missing prepared action id.</p>`;
    return;
  }
  try {
    const details = await fetchDetails(id);
    render(details);
  } catch (error) {
    app!.innerHTML = `<p class="error">${escapeHtml(asError(error))}</p>`;
  }
}

type Details = {
  id: string;
  title: string;
  description: string;
  kind: "transaction" | "description";
  walletAddress: string;
  expiresAt: number;
  status: string;
  transaction?: { format: string; data: string };
};

async function fetchDetails(actionId: string): Promise<Details> {
  const response = await fetch(`${kitBase()}/approve/${encodeURIComponent(actionId)}/details`);
  const body = (await response.json()) as Details & { error_description?: string };
  if (!response.ok) {
    throw new Error(body.error_description ?? "This approval link is not available");
  }
  return body;
}

function render(details: Details): void {
  const expires = new Date(details.expiresAt).toLocaleString();
  app!.innerHTML = `
    <h2>${escapeHtml(details.title)}</h2>
    <p>${escapeHtml(details.description)}</p>
    <p class="mono">Must be signed by ${escapeHtml(details.walletAddress)}</p>
    <p>Expires ${escapeHtml(expires)} · ${escapeHtml(details.kind)}</p>
    ${
      details.transaction
        ? `<pre class="mono">${escapeHtml(details.transaction.data)}</pre>`
        : `<p>No on-chain transaction is attached. Confirming records that you reviewed this action.</p>`
    }
    <div class="row">
      <button type="button" id="connect">Connect EVE Vault</button>
      <button type="button" id="approve" disabled>${details.kind === "transaction" ? "Sign and execute" : "Approve"}</button>
    </div>
    <p id="status"></p>
  `;
  const status = document.getElementById("status")!;
  const approve = document.getElementById("approve") as HTMLButtonElement;
  let address = "";
  document.getElementById("connect")!.addEventListener("click", () => {
    void (async () => {
      try {
        const connected = await connectWallet();
        address = connected.account.address;
        if (normalize(address) !== normalize(details.walletAddress)) {
          throw new Error("Connected wallet does not match the player this action was prepared for.");
        }
        status.textContent = `Connected ${address}`;
        approve.disabled = false;
      } catch (error) {
        status.className = "error";
        status.textContent = asError(error);
      }
    })();
  });
  approve.addEventListener("click", () => {
    void (async () => {
      approve.disabled = true;
      status.textContent = "Waiting for EVE Vault…";
      try {
        let digest: string | undefined;
        if (details.kind === "transaction" && details.transaction) {
          const executed = await signAndExecute(details.transaction.data);
          address = executed.address;
          digest = executed.digest;
        }
        const response = await fetch(`${kitBase()}/approve/${encodeURIComponent(details.id)}/complete`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address, digest }),
        });
        const body = (await response.json()) as { error_description?: string; digest?: string };
        if (!response.ok) {
          throw new Error(body.error_description ?? "Approval failed");
        }
        status.className = "ok";
        status.textContent = body.digest ? `Executed ${body.digest}` : "Approved. You can close this window.";
      } catch (error) {
        status.className = "error";
        status.textContent = asError(error);
        approve.disabled = false;
      }
    })();
  });
}

function normalize(address: string): string {
  return address.toLowerCase();
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
