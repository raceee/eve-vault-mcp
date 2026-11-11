export function isAllowedRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.hash) {
    return false;
  }
  if (parsed.protocol === "https:") {
    return true;
  }
  if (parsed.protocol !== "http:") {
    return false;
  }
  return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "[::1]";
}

export function exactRedirectMatch(registered: string[], candidate: string): boolean {
  return registered.includes(candidate);
}

export function isLocalIssuer(issuer: string): boolean {
  try {
    const url = new URL(issuer);
    return (
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]")
    );
  } catch {
    return false;
  }
}
