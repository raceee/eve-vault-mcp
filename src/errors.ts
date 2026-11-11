export class KitError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "KitError";
    this.code = code;
    this.status = status;
  }
}

export class InvalidSignatureError extends KitError {
  constructor(message = "Invalid sign-in signature") {
    super("invalid_signature", message, 401);
    this.name = "InvalidSignatureError";
  }
}

export class NonceError extends KitError {
  constructor(message: string) {
    super("invalid_nonce", message, 401);
    this.name = "NonceError";
  }
}

export class ScopeError extends KitError {
  constructor(message: string) {
    super("insufficient_scope", message, 403);
    this.name = "ScopeError";
  }
}

export class TokenError extends KitError {
  constructor(code: string, message: string, status = 401) {
    super(code, message, status);
    this.name = "TokenError";
  }
}

export function isKitError(error: unknown): error is KitError {
  return error instanceof KitError;
}
