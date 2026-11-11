import { describe, expect, it } from "vitest";

import { createEveVaultMcpKit } from "../src/kit.js";
import { FakeVerifier } from "../src/verify.js";
import { json } from "./helpers.js";

describe("appearance", () => {
  it("injects CSS variables and issuer base into the login page", async () => {
    const kit = await createEveVaultMcpKit({
      issuer: "http://127.0.0.1:8787",
      resource: "http://127.0.0.1:8787/mcp",
      serverName: "Themed dApp",
      scopes: ["identity.read"],
      verifier: new FakeVerifier(),
      appearance: {
        colorScheme: "light",
        cssVariables: {
          "--bg": "#3a4a6b",
          "--accent": "#0015ff",
        },
      },
    });
    const response = await kit.fetch(new Request("http://127.0.0.1:8787/login"));
    const html = await response.text();
    expect(html).toContain('data-eve-vault-base="http://127.0.0.1:8787"');
    expect(html).toContain("color-scheme: light");
    expect(html).toContain("--accent: #0015ff");
    expect(html).toContain('src="http://127.0.0.1:8787/assets/login.js"');
  });

  it("health still works without appearance", async () => {
    const kit = await createEveVaultMcpKit({
      issuer: "http://127.0.0.1:8787",
      resource: "http://127.0.0.1:8787/mcp",
      serverName: "Plain",
      scopes: ["identity.read"],
      verifier: new FakeVerifier(),
    });
    const body = await json(await kit.fetch(new Request("http://127.0.0.1:8787/health")));
    expect(body.ok).toBe(true);
  });
});
