export { createEveVaultMcpKit } from "./kit.js";
export type { KitConfig, EveVaultMcpKit, ResolvedKitConfig } from "./kit.js";

export { MemoryStore } from "./memory-store.js";
export type { KitStore } from "./store.js";
export { createPostgresStore, POSTGRES_SCHEMA } from "./stores/postgres.js";
export type { SqlQueryClient } from "./stores/postgres.js";
export { createRedisStore } from "./stores/redis.js";
export type { RedisLike } from "./stores/redis.js";

export { FakeVerifier, createMystenVerifier } from "./verify.js";
export type { SignatureVerifier, MystenNetwork } from "./verify.js";

export {
  createWorldApiCharacterResolver,
  noopCharacterResolver,
} from "./character.js";
export type { CharacterResolver } from "./character.js";

export { ManualClock, systemClock } from "./clock.js";
export type { Clock } from "./clock.js";

export { buildLoginMessage, encodeLoginMessage } from "./login-message.js";
export { assertScopes, hasScope } from "./scopes.js";
export {
  authenticateActor,
  bearerTokenFromHeader,
  requireActorScopes,
  scopedTool,
  wwwAuthenticate,
} from "./mcp.js";
export { createMcpHandler } from "./mcp-http.js";
export type { BuilderTool } from "./mcp-http.js";

export {
  APPROVAL_CARD_RESOURCE_URI,
  MCP_APP_MIME_TYPE,
  OPENAI_WIDGET_MIME_TYPE,
  approvalCardToolResult,
  buildApprovalCardHtml,
  prepareToolMeta,
  toApprovalCardModel,
} from "./approval-card.js";
export type { ApprovalCardModel, McpToolResult } from "./approval-card.js";

export {
  STRUCTURED_CARD_RESOURCE_URI,
  LOCKED_DOWN_WIDGET_CSP,
  buildStructuredCardHtml,
  htmlCardToolResult,
  lockedDownWidgetMeta,
  structuredCardResourceContents,
  structuredCardToolResult,
} from "./html-card.js";
export type {
  HtmlCardOptions,
  StructuredCardItem,
  StructuredCardModel,
  StructuredCardRow,
  UiResource,
} from "./html-card.js";

export type { KitAppearance } from "./appearance.js";
export { issueStandaloneNonce, consumeLiveNonce, publicNonce } from "./nonce.js";
export type { IssueNonceInput } from "./nonce.js";
export {
  joinIssuerPath,
  issuerMountPath,
  issuerOrigin,
  rewriteRequestForMount,
  wellKnownAuthorizationServerUrl,
  wellKnownProtectedResourceUrl,
} from "./urls.js";

export { isKitError, KitError, InvalidSignatureError, NonceError, ScopeError, TokenError } from "./errors.js";

export type {
  Actor,
  CharacterIdentity,
  NonceRecord,
  PreparedAction,
  PreparedTransaction,
  AccessTokenRecord,
  TtlConfig,
} from "./types.js";
export type { PrepareActionInput, PrepareActionResult, GasSponsor } from "./prepare.js";
export type { StaticClientConfig } from "./clients.js";
export { createNextRouteHandlers, createWellKnownHandlers } from "./next.js";
export type { NextRouteHandlerOptions } from "./next.js";
