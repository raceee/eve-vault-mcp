import { randomId } from "./crypto.js";
import { NonceError } from "./errors.js";
import type { KitStore } from "./store.js";
import type { NonceRecord, TtlConfig } from "./types.js";

export type IssueNonceInput = {
  purpose?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Issue a standalone, single-use nonce. OAuth login still creates its
 * own session-bound nonce; this is for any other EVE Vault personal-message
 * sign-in a dApp needs (server-issued, then consumed on verify).
 */
export async function issueStandaloneNonce(
  store: KitStore,
  ttl: TtlConfig,
  now: number,
  input: IssueNonceInput = {},
): Promise<NonceRecord> {
  const record: NonceRecord = {
    id: randomId(),
    value: randomId(),
    purpose: input.purpose ?? "signin",
    ...(input.metadata ? { metadata: input.metadata } : {}),
    expiresAt: now + ttl.nonceMs,
  };
  await store.putNonce(record);
  return record;
}

export async function consumeLiveNonce(store: KitStore, id: string, now: number): Promise<NonceRecord> {
  const existing = await store.getNonce(id);
  if (!existing) {
    throw new NonceError("Unknown nonce");
  }
  if (existing.consumedAt !== undefined) {
    throw new NonceError("Nonce has already been used");
  }
  if (existing.expiresAt <= now) {
    throw new NonceError("Nonce has expired");
  }
  const consumed = await store.consumeNonce(id, now);
  if (!consumed) {
    throw new NonceError("Nonce has already been used");
  }
  return consumed;
}

export function publicNonce(record: NonceRecord): {
  id: string;
  value: string;
  purpose: string;
  expiresAt: number;
  metadata?: Record<string, unknown>;
} {
  return {
    id: record.id,
    value: record.value,
    purpose: record.purpose ?? "signin",
    expiresAt: record.expiresAt,
    ...(record.metadata ? { metadata: record.metadata } : {}),
  };
}
