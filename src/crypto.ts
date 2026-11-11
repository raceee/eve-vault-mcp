import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;

export function randomId(bytes = TOKEN_BYTES): string {
  return base64UrlEncode(randomBytes(bytes));
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Bytes(value: string | Uint8Array): Buffer {
  return createHash("sha256").update(value).digest();
}

export function base64UrlEncode(data: Buffer | Uint8Array): string {
  return Buffer.from(data).toString("base64url");
}

export function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function newAccessToken(): string {
  return `eva_${randomId()}`;
}

export function newRefreshToken(): string {
  return `evr_${randomId()}`;
}

export function newAuthorizationCode(): string {
  return `evc_${randomId()}`;
}
