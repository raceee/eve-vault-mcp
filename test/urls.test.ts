import { describe, expect, it } from "vitest";

import { createNextRouteHandlers } from "../src/next.js";
import {
  issuerMountPath,
  joinIssuerPath,
  rewriteRequestForMount,
  wellKnownProtectedResourceUrl,
} from "../src/urls.js";
import { createTestKit, json } from "./helpers.js";

const MOUNT_ISSUER = "http://127.0.0.1:3000/api/eve-vault";
const MOUNT_RESOURCE = "http://127.0.0.1:3000/mcp";

describe("issuer URL joining", () => {
  it("keeps the issuer path when joining endpoints", () => {
    expect(joinIssuerPath(MOUNT_ISSUER, "/authorize")).toBe(
      "http://127.0.0.1:3000/api/eve-vault/authorize",
    );
    expect(joinIssuerPath(MOUNT_ISSUER, "/login?session=abc")).toBe(
      "http://127.0.0.1:3000/api/eve-vault/login?session=abc",
    );
    expect(issuerMountPath(MOUNT_ISSUER)).toBe("/api/eve-vault");
  });

  it("keeps well-known documents on the host origin", () => {
    expect(wellKnownProtectedResourceUrl(MOUNT_ISSUER)).toBe(
      "http://127.0.0.1:3000/.well-known/oauth-protected-resource",
    );
  });

  it("strips the Next.js mount prefix before kit.fetch", () => {
    const incoming = new Request("http://127.0.0.1:3000/api/eve-vault/authorize?x=1");
    const rewritten = rewriteRequestForMount(incoming, "/api/eve-vault");
    expect(new URL(rewritten.url).pathname).toBe("/authorize");
    expect(new URL(rewritten.url).searchParams.get("x")).toBe("1");
    const wellKnown = rewriteRequestForMount(
      new Request("http://127.0.0.1:3000/.well-known/oauth-authorization-server"),
      "/api/eve-vault",
    );
    expect(new URL(wellKnown.url).pathname).toBe("/.well-known/oauth-authorization-server");
  });

  it("serves authorize and login under a subpath issuer", async () => {
    const test = await createTestKit({ issuer: MOUNT_ISSUER, resource: MOUNT_RESOURCE });
    // Hono routes are `/authorize`. The Next adapter strips the mount first.
    const started = await test.kit.fetch(
      new Request(
        `http://127.0.0.1:3000/authorize?response_type=code&client_id=static-toy&redirect_uri=http://127.0.0.1:9999/callback&code_challenge=${"c".repeat(43)}&code_challenge_method=S256&state=xyz&scope=identity.read`,
      ),
      { redirect: "manual" },
    );
    const location = started.headers.get("location") ?? "";
    expect(location.startsWith(`${MOUNT_ISSUER}/login?`)).toBe(true);
    const metadata = await json(
      await test.kit.fetch(new Request("http://127.0.0.1:3000/.well-known/oauth-authorization-server")),
    );
    expect(metadata.authorization_endpoint).toBe(`${MOUNT_ISSUER}/authorize`);
    expect(metadata.introspection_endpoint).toBe(`${MOUNT_ISSUER}/introspect`);
    expect(test.kit.resourceMetadataUrl()).toBe(
      "http://127.0.0.1:3000/.well-known/oauth-protected-resource",
    );
  });

  it("createNextRouteHandlers rewrites mounted Next requests", async () => {
    const test = await createTestKit({ issuer: MOUNT_ISSUER, resource: MOUNT_RESOURCE });
    const { GET } = createNextRouteHandlers(test.kit);
    const response = await GET(
      new Request("http://127.0.0.1:3000/api/eve-vault/health"),
    );
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ ok: true, name: "Toy dApp" });
  });
});
