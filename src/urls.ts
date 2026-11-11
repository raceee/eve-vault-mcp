/**
 * Issuer URL helpers. `new URL("/authorize", issuer)` drops any path on
 * `issuer` (for example `https://app.example/api/eve-vault`). Every
 * endpoint that lives on the kit mount must go through `joinIssuerPath`.
 * Host-root well-known documents stay at the origin, not under the mount.
 */

export function joinIssuerPath(issuer: string, path: string): string {
  const base = issuer.endsWith("/") ? issuer : `${issuer}/`;
  const rel = path.replace(/^\//, "");
  return new URL(rel, base).toString();
}

export function issuerOrigin(issuer: string): string {
  return new URL(issuer).origin;
}

export function issuerMountPath(issuer: string): string {
  const path = new URL(issuer).pathname.replace(/\/$/, "");
  return path === "" ? "/" : path;
}

export function wellKnownAuthorizationServerUrl(issuer: string): string {
  return `${issuerOrigin(issuer)}/.well-known/oauth-authorization-server`;
}

export function wellKnownProtectedResourceUrl(issuer: string): string {
  return `${issuerOrigin(issuer)}/.well-known/oauth-protected-resource`;
}

/**
 * Strip a Next.js (or other) mount prefix so Hono sees `/authorize`
 * instead of `/api/eve-vault/authorize`. Leaves host-root paths alone.
 */
export function rewriteRequestForMount(request: Request, mountPath: string): Request {
  const prefix = mountPath === "/" ? "" : mountPath.replace(/\/$/, "");
  if (!prefix) {
    return request;
  }
  const url = new URL(request.url);
  if (url.pathname === prefix) {
    url.pathname = "/";
  } else if (url.pathname.startsWith(`${prefix}/`)) {
    url.pathname = url.pathname.slice(prefix.length) || "/";
  } else {
    return request;
  }
  return new Request(url, request);
}
