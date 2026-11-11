# Security

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/raceee/eve-vault-mcp/security/advisories/new) on this repository. Do not open a public issue for a signing, token, or nonce bug.

## What this kit guarantees

- The agent's access token cannot sign Sui transactions or personal messages. EVE Vault keeps the zkLogin ephemeral key and proof in the extension keeper.
- Login nonces are random, single-use, and short-lived. The server rebuilds the personal-message body; client-supplied `bytes` are ignored.
- Access tokens are hashed at rest, bound to a wallet address (and character id when resolved), scoped, expiring, and revocable.
- Prepared-action approval URLs are unguessable, expire, and must be completed by the same wallet.

## What this kit does not do

- It does not give an agent a co-owner key. Do not ask players to add an agent address as an EVE Vault **address alias** — an alias is a full co-owner of the zkLogin account.
- It does not register a CCP FusionAuth OAuth client. Third parties cannot mint their own client; a different client id would also derive a different zkLogin address.
- It does not sponsor gas. `GasSponsor` is an extension point for your backend.

## EVE Vault versions

Grounded in [evefrontier/evevault](https://github.com/evefrontier/evevault) **v0.0.18** (also checked against **v0.0.20**, the latest GitHub release as of 2026-09-29). See the README for the version table.
