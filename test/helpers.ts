import { ManualClock } from "../src/clock.js";
import { createEveVaultMcpKit, type EveVaultMcpKit } from "../src/kit.js";
import { s256Challenge } from "../src/pkce.js";
import type { TtlConfig } from "../src/types.js";
import { FakeVerifier } from "../src/verify.js";

export const ALICE = `0x${"a".repeat(64)}`;
export const BOB = `0x${"b".repeat(64)}`;

export const ISSUER = "http://127.0.0.1:8787";
export const RESOURCE = "http://127.0.0.1:8787/mcp";
export const REDIRECT = "http://127.0.0.1:9999/callback";

export const SCOPES = ["identity.read", "actions.prepare"] as const;

export type TestKit = {
  kit: EveVaultMcpKit;
  verifier: FakeVerifier;
  clock: ManualClock;
};

export async function createTestKit(overrides?: {
  character?: { id: string; name?: string };
  ttl?: Partial<TtlConfig>;
}): Promise<TestKit> {
  const verifier = new FakeVerifier();
  const clock = new ManualClock(1_700_000_000_000);
  const kit = await createEveVaultMcpKit({
    issuer: ISSUER,
    resource: RESOURCE,
    serverName: "Toy dApp",
    scopes: [...SCOPES],
    verifier,
    clock,
    ...(overrides?.ttl ? { ttl: overrides.ttl } : {}),
    ...(overrides?.character
      ? {
          characterResolver: {
            async resolve() {
              return overrides.character;
            },
          },
        }
      : {}),
    staticClients: [
      {
        clientId: "static-toy",
        clientName: "Toy MCP client",
        redirectUris: [REDIRECT],
      },
    ],
  });
  return { kit, verifier, clock };
}

export function pkce(): { verifier: string; challenge: string } {
  const verifier = "a".repeat(64);
  return { verifier, challenge: s256Challenge(verifier) };
}

export async function registerClient(kit: EveVaultMcpKit, redirectUri = REDIRECT): Promise<string> {
  const response = await kit.fetch(
    new Request(`${ISSUER}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Dynamic Test Client",
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
      }),
    }),
  );
  const body = (await response.json()) as { client_id: string };
  if (!response.ok) {
    throw new Error(`DCR failed: ${JSON.stringify(body)}`);
  }
  return body.client_id;
}

export async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

export async function startLogin(
  kit: EveVaultMcpKit,
  options?: { clientId?: string; scope?: string; challenge?: string; state?: string },
): Promise<{ session: string; location: string }> {
  const { challenge } = pkce();
  const url = new URL("/authorize", ISSUER);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", options?.clientId ?? "static-toy");
  url.searchParams.set("redirect_uri", REDIRECT);
  url.searchParams.set("code_challenge", options?.challenge ?? challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", RESOURCE);
  url.searchParams.set("state", options?.state ?? "state-1");
  url.searchParams.set("scope", options?.scope ?? "identity.read actions.prepare");
  const response = await kit.fetch(new Request(url), { redirect: "manual" });
  const location = response.headers.get("location") ?? "";
  const session = new URL(location, ISSUER).searchParams.get("session");
  if (!session) {
    throw new Error(`authorize did not redirect to login: ${response.status} ${location}`);
  }
  return { session, location };
}

export async function challengeMessage(kit: EveVaultMcpKit, session: string): Promise<string> {
  const response = await kit.fetch(new Request(`${ISSUER}/login/challenge?session=${session}`));
  const body = await json(response);
  return String(body.message);
}

export async function completeWithSignature(
  kit: EveVaultMcpKit,
  session: string,
  address: string,
  signature: string,
): Promise<Response> {
  return kit.fetch(
    new Request(`${ISSUER}/login/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session,
        address,
        signature,
        bytes: "client-supplied-bytes-must-be-ignored",
      }),
    }),
  );
}

export async function loginAs(
  test: TestKit,
  address: string,
  options?: { clientId?: string; scope?: string; verifier?: string; challenge?: string },
): Promise<{ code: string; verifier: string }> {
  const pair = options?.verifier
    ? { verifier: options.verifier, challenge: options.challenge ?? s256Challenge(options.verifier) }
    : pkce();
  const { session } = await startLogin(test.kit, {
    ...(options?.clientId ? { clientId: options.clientId } : {}),
    ...(options?.scope ? { scope: options.scope } : {}),
    challenge: pair.challenge,
  });
  const message = await challengeMessage(test.kit, session);
  const signature = test.verifier.enroll(address, message);
  const completed = await completeWithSignature(test.kit, session, address, signature);
  const body = await json(completed);
  if (!completed.ok) {
    throw new Error(`login failed: ${JSON.stringify(body)}`);
  }
  const redirectUrl = new URL(String(body.redirectUrl));
  const code = redirectUrl.searchParams.get("code");
  if (!code) {
    throw new Error("login did not return a code");
  }
  return { code, verifier: pair.verifier };
}

export async function exchangeCode(
  kit: EveVaultMcpKit,
  code: string,
  verifier: string,
  clientId = "static-toy",
): Promise<Response> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT,
    client_id: clientId,
    code_verifier: verifier,
    resource: RESOURCE,
  });
  return kit.fetch(
    new Request(`${ISSUER}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
}

export async function tokensFor(
  test: TestKit,
  address: string,
  scope = "identity.read actions.prepare",
): Promise<{ access_token: string; refresh_token: string; expires_in: number; scope: string }> {
  const { code, verifier } = await loginAs(test, address, { scope });
  const response = await exchangeCode(test.kit, code, verifier);
  const body = await json(response);
  if (!response.ok) {
    throw new Error(`token exchange failed: ${JSON.stringify(body)}`);
  }
  return body as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };
}
