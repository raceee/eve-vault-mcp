import { randomId } from "./crypto.js";
import { KitError } from "./errors.js";
import { isAllowedRedirectUri } from "./redirect.js";
import type { KitStore } from "./store.js";
import type { RegisteredClient } from "./types.js";

export type StaticClientConfig = {
  clientId: string;
  clientName: string;
  redirectUris: string[];
};

export type ClientRegistrationBody = {
  client_name?: unknown;
  redirect_uris?: unknown;
  token_endpoint_auth_method?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
  application_type?: unknown;
};

export async function seedStaticClients(
  store: KitStore,
  clients: StaticClientConfig[],
  now: number,
): Promise<void> {
  for (const client of clients) {
    for (const uri of client.redirectUris) {
      if (!isAllowedRedirectUri(uri)) {
        throw new KitError("invalid_redirect_uri", `Static client redirect_uri is not allowed: ${uri}`);
      }
    }
    await store.putClient({
      clientId: client.clientId,
      clientName: client.clientName,
      redirectUris: client.redirectUris,
      tokenEndpointAuthMethod: "none",
      createdAt: now,
      static: true,
    });
  }
}

export async function registerDynamicClient(
  store: KitStore,
  body: ClientRegistrationBody,
  now: number,
): Promise<RegisteredClient> {
  const clientName =
    typeof body.client_name === "string" && body.client_name.trim() ? body.client_name.trim() : "MCP client";
  if (!Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
    throw new KitError("invalid_redirect_uri", "redirect_uris is required", 400);
  }
  const redirectUris = body.redirect_uris.map((uri) => {
    if (typeof uri !== "string" || !isAllowedRedirectUri(uri)) {
      throw new KitError(
        "invalid_redirect_uri",
        "Each redirect_uri must be https or a loopback http URL",
        400,
      );
    }
    return uri;
  });
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") {
    throw new KitError(
      "invalid_client_metadata",
      "Only public clients (token_endpoint_auth_method=none) are supported",
      400,
    );
  }

  const client: RegisteredClient = {
    clientId: `client_${randomId(16)}`,
    clientName,
    redirectUris,
    tokenEndpointAuthMethod: "none",
    createdAt: now,
  };
  await store.putClient(client);
  return client;
}

export function toDcrResponse(client: RegisteredClient): Record<string, unknown> {
  return {
    client_id: client.clientId,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: client.tokenEndpointAuthMethod,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    application_type: "native",
  };
}
