# eve-vault-mcp

**Sign in with EVE Vault for MCP.** A drop-in kit so an AI agent (ChatGPT, Claude, Cursor, and other MCP clients) can use an EVE Frontier dApp *for a player* without ever holding the player's key.

Apache-2.0. Not published to npm; install from git. This repository is generic — it has no knowledge of any particular dApp.

## What it is

EVE Vault keeps the player's zkLogin ephemeral key and proof inside the browser extension. The agent therefore **cannot sign**. This kit gives the agent:

- Short-lived, scoped, revocable access tokens bound to the wallet address (and character id when you can resolve one).
- **Prepare** helpers that store an unsigned transaction or a description and return an approval URL.
- An approval page that connects EVE Vault, shows what will be signed, and lets the **player** sign.
- An MCP tool template, including a chat **approval card** (MCP Apps / ChatGPT Apps widget) whose button opens that URL in a new tab.

Login is an EVE Vault personal-message signature, not CCP FusionAuth. Third parties cannot register their own OAuth client, and a different client id would derive a different zkLogin address.

## Security model

1. The MCP client does OAuth 2.1 authorization-code + PKCE against this kit.
2. `/authorize` creates a stored, single-use, short-expiry **nonce** and sends the player to `/login`.
3. The player signs a personal message that **contains that nonce** with EVE Vault (`sui:signPersonalMessage`).
4. The server **rebuilds** the message from the stored nonce (it never verifies wallet-returned `bytes`), checks the zkLogin signature for the claimed Sui address, consumes the nonce, and issues codes/tokens.
5. Tools that would move value call `prepareAction` and return an approval link + card. The player signs in a **top-level tab**. Replay of the login nonce is impossible after consume or expiry.

Do **not** ask a player to add an agent key as an EVE Vault address alias. As of Vault v0.0.18+, aliasing is a co-owner relationship; v0.0.19 also blocks dApps from driving alias calls.

## Quickstart

```bash
git clone https://github.com/raceee/eve-vault-mcp.git
cd eve-vault-mcp
npm install
npm test
npm run build
npm run example
```

Open the printed origin. MCP clients discover `/.well-known/oauth-protected-resource` on `/mcp`.

Drop-in for an existing app: see [INTEGRATING.md](./INTEGRATING.md).

## Package surface

| Import | Role |
| --- | --- |
| `eve-vault-mcp` | Kit factory, memory store, verifiers, MCP helpers, approval + structured cards, standalone nonces |
| `eve-vault-mcp/next` | Next.js App Router `GET`/`POST` handlers (strips the issuer mount path) |
| `eve-vault-mcp/stores/postgres` | `createPostgresStore` + `POSTGRES_SCHEMA` |
| `eve-vault-mcp/stores/redis` | `createRedisStore` |

Peer dependency: `@mysten/sui`. You supply scopes, tools, and storage.

## Approval cards vs the approval page

Chat hosts render MCP Apps in a **sandboxed iframe**. EVE Vault's content script (v0.0.18 and v0.0.20) matches `<all_urls>` at `document_start` but does **not** set `allFrames: true`. The page-world injector also requires `event.origin === window.location.origin` and drops `origin === "null"`. Wallet Standard therefore does not show up inside the widget.

The card always includes the plain URL and a button that opens it with `window.open(..., '_blank', 'noopener')`. Signing happens on that tab, where the extension injects. The agent learns the outcome through `get_action_status` / `GET /actions/:id`.

## EVE Vault versions

Inspected source: [v0.0.18](https://github.com/evefrontier/evevault/releases/tag/v0.0.18). Latest GitHub release at time of writing: **v0.0.20** (2026-09-29).

This kit supports **v0.0.18–v0.0.20** (and should work on later builds that still expose the Sui Wallet Standard features below).

| Topic | v0.0.18 | v0.0.19 / v0.0.20 |
| --- | --- | --- |
| Wallet Standard features | `standard:connect`, `standard:disconnect`, `standard:events`, `sui:signPersonalMessage` 1.1.0, `sui:signTransaction` 2.0.0, `sui:signAndExecuteTransaction` 2.0.0, `evefrontier:signSponsoredTransaction`, `evefrontier:vaultVersion` | Same in `content.ts` / `SuiWallet` |
| Personal-message result | `{ bytes, signature }`. Verify against a **server-rebuilt** message, never `bytes` | Unchanged; README documents this |
| zkLogin signature | Keeper applies zkProof then `signPersonalMessage`; scheme is Mysten zkLogin (needs a Sui client / epoch) | Unchanged |
| Iframe injection | Content script has no `allFrames` | Unchanged in v0.0.20 |
| Auto-lock | `VAULT_UNLOCK_MS` = **10 minutes** after PIN; keeper locks proactively; signing while locked shows the PIN screen (v0.0.18) | Unchanged |
| Address aliases | Aliasing enforced as a first-class co-owner path | **v0.0.19** guards alias calls from dApps — another reason not to use aliases for agents |
| Other | Nonce bound to rotating ephemeral key | v0.0.20 is a wallet-core / MVR bump only |

Wallet name advertised to dApps: `Eve Vault`.

## Design decisions

- **TypeScript + Hono**, because `@mysten/sui`, Wallet Standard, and MCP HTTP are all fetch/TS-native. Next.js handlers wrap `kit.fetch`.
- **Opaque access tokens** hashed in the store, not JWTs, so revocation is a delete. Other languages call `POST /introspect` (RFC 7662). JWKS is intentionally absent in this mode.
- **Builder-defined scopes.** The kit only checks membership.
- **Pluggable `KitStore`.** Memory is the default; Postgres/Redis adapters take *your* client so this package does not hard-depend on `pg` or `redis`.
- **On-chain delegated permissions** (a Move package the player opts into) are a later phase. This MVP stays off-chain: scoped tokens + player-signed prepared actions.

## Tests

`npm test` covers nonce single-use/expiry (OAuth and standalone), forged and wrong-address signatures, PKCE, scope checks, token expiry/revocation, approval-link expiry, introspection, subpath issuer URLs, Next.js mount rewriting, locked-down structured cards, and approval-card text+widget payload.

Python resource-server helpers (introspect + nonce consume): `python -m unittest discover -s python -t python`.

## License

Apache-2.0
