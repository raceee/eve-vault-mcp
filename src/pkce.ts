import { base64UrlEncode, sha256Bytes, timingSafeEqualString } from "./crypto.js";

const VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;

export function isValidCodeVerifier(verifier: string): boolean {
  return VERIFIER_PATTERN.test(verifier);
}

export function isValidCodeChallenge(challenge: string): boolean {
  return VERIFIER_PATTERN.test(challenge);
}

export function s256Challenge(verifier: string): string {
  return base64UrlEncode(sha256Bytes(verifier));
}

export function verifyS256(verifier: string, challenge: string): boolean {
  if (!isValidCodeVerifier(verifier) || !isValidCodeChallenge(challenge)) {
    return false;
  }
  return timingSafeEqualString(s256Challenge(verifier), challenge);
}
