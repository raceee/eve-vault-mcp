import { noopCharacterResolver, type CharacterResolver } from "./character.js";
import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import { seedStaticClients, type StaticClientConfig } from "./clients.js";
import { KitError } from "./errors.js";
import { createHttpApp } from "./http/app.js";
import { MemoryStore } from "./memory-store.js";
import { isLocalIssuer } from "./redirect.js";
import {
  prepareAction,
  readPreparedAction,
  type PrepareActionInput,
  type PrepareActionResult,
  type GasSponsor,
} from "./prepare.js";
import type { KitStore } from "./store.js";
import { revokeToken, verifyAccessToken } from "./tokens.js";
import { DEFAULT_TTL, type Actor, type PreparedAction, type TtlConfig } from "./types.js";
import type { SignatureVerifier } from "./verify.js";

export type KitConfig = {
  /** Authorization server issuer (no query/fragment). Use http only on loopback. */
  issuer: string;
  /** RFC 8707 resource identifier for the MCP server, e.g. http://127.0.0.1:8787/mcp */
  resource: string;
  /** Shown in the login message. */
  serverName: string;
  /** Builder-defined scope strings this server can grant. */
  scopes: string[];
  /** Granted when the client omits `scope`. Defaults to all `scopes`. */
  defaultScopes?: string[];
  /** Optional pre-registered public clients. DCR still works alongside these. */
  staticClients?: StaticClientConfig[];
  store?: KitStore;
  verifier: SignatureVerifier;
  characterResolver?: CharacterResolver;
  gasSponsor?: GasSponsor;
  clock?: Clock;
  ttl?: Partial<TtlConfig>;
};

export type ResolvedKitConfig = {
  issuer: string;
  resource: string;
  serverName: string;
  scopes: string[];
  defaultScopes: string[];
  ttl: TtlConfig;
};

export type EveVaultMcpKit = {
  config: ResolvedKitConfig;
  store: KitStore;
  verifier: SignatureVerifier;
  characterResolver: CharacterResolver;
  gasSponsor?: GasSponsor;
  now(): number;
  fetch: ReturnType<typeof createHttpApp>["fetch"];
  app: ReturnType<typeof createHttpApp>;
  verifyAccessToken(token: string): Promise<Actor>;
  revokeToken(token: string): Promise<void>;
  prepareAction(input: PrepareActionInput): Promise<PrepareActionResult>;
  getActionStatus(id: string): Promise<PreparedAction>;
  resourceMetadataUrl(): string;
};

export async function createEveVaultMcpKit(config: KitConfig): Promise<EveVaultMcpKit> {
  validateIssuer(config.issuer);
  if (config.scopes.length === 0) {
    throw new KitError("invalid_request", "At least one scope is required");
  }
  const ttl: TtlConfig = { ...DEFAULT_TTL, ...config.ttl };
  const store = config.store ?? new MemoryStore();
  const clock = config.clock ?? systemClock;
  const resolved: ResolvedKitConfig = {
    issuer: trimSlash(config.issuer),
    resource: trimSlash(config.resource),
    serverName: config.serverName,
    scopes: config.scopes,
    defaultScopes: config.defaultScopes ?? [...config.scopes],
    ttl,
  };
  if (config.staticClients) {
    await seedStaticClients(store, config.staticClients, clock.now());
  }

  const kit: EveVaultMcpKit = {
    config: resolved,
    store,
    verifier: config.verifier,
    characterResolver: config.characterResolver ?? noopCharacterResolver,
    ...(config.gasSponsor ? { gasSponsor: config.gasSponsor } : {}),
    now: () => clock.now(),
    app: null as unknown as ReturnType<typeof createHttpApp>,
    fetch: async () => new Response("uninitialized"),
    async verifyAccessToken(token: string) {
      return verifyAccessToken(store, token, clock.now(), resolved.resource);
    },
    async revokeToken(token: string) {
      await revokeToken(store, token, clock.now());
    },
    async prepareAction(input: PrepareActionInput) {
      return prepareAction(store, resolved.issuer, input, ttl, clock.now());
    },
    async getActionStatus(id: string) {
      return readPreparedAction(store, id, clock.now());
    },
    resourceMetadataUrl() {
      return new URL("/.well-known/oauth-protected-resource", resolved.issuer).toString();
    },
  };

  kit.app = createHttpApp(kit);
  kit.fetch = kit.app.fetch;
  return kit;
}

function trimSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function validateIssuer(issuer: string): void {
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    throw new KitError("invalid_request", "issuer must be an absolute URL");
  }
  if (url.search || url.hash) {
    throw new KitError("invalid_request", "issuer must not include a query or fragment");
  }
  if (url.protocol === "https:") {
    return;
  }
  if (url.protocol === "http:" && isLocalIssuer(issuer)) {
    return;
  }
  throw new KitError("invalid_request", "issuer must be https (http is allowed only on loopback)");
}
