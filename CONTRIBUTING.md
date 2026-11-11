# Contributing

This repository is a small TypeScript kit. Keep named third-party dApps and personal names out of code, examples, and docs.

## Setup

```bash
npm install
npm test
npm run lint
npm run typecheck
```

Node 22+. Do not publish the package to npm from a contribution.

## Tests that must stay meaningful

Do not weaken these cases:

- nonce single-use and expiry
- forged and wrong-address signatures
- PKCE S256
- scope enforcement
- token expiry and revocation
- approval-link expiry
- approval card always includes a plain URL

## Pull requests

Open against `main`. Do not push to `main`. Do not merge your own PR unless a maintainer asks.
