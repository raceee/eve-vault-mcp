import { normalizeSuiAddress } from "@mysten/sui/utils";

import { randomId } from "./crypto.js";
import { KitError } from "./errors.js";
import type { KitStore } from "./store.js";
import type { PreparedAction, PreparedTransaction, TtlConfig } from "./types.js";

export type PrepareActionInput = {
  walletAddress: string;
  title: string;
  description: string;
  transaction?: PreparedTransaction;
};

export type PrepareActionResult = {
  id: string;
  approvalUrl: string;
  expiresAt: number;
};

export type GasSponsor = {
  /**
   * Optional extension point. The kit does not sponsor gas itself.
   * Builders can wrap unsigned bytes before the player signs.
   */
  sponsor(transaction: PreparedTransaction): Promise<PreparedTransaction>;
};

export async function prepareAction(
  store: KitStore,
  issuer: string,
  input: PrepareActionInput,
  ttl: TtlConfig,
  now: number,
): Promise<PrepareActionResult> {
  if (!input.title.trim() || !input.description.trim()) {
    throw new KitError("invalid_request", "Prepared actions need a title and description");
  }
  const action: PreparedAction = {
    id: randomId(),
    walletAddress: normalizeSuiAddress(input.walletAddress),
    title: input.title.trim(),
    description: input.description.trim(),
    kind: input.transaction ? "transaction" : "description",
    ...(input.transaction ? { transaction: input.transaction } : {}),
    expiresAt: now + ttl.preparedActionMs,
    createdAt: now,
    status: "pending",
  };
  await store.putPreparedAction(action);
  return {
    id: action.id,
    approvalUrl: new URL(`/approve/${action.id}`, issuer).toString(),
    expiresAt: action.expiresAt,
  };
}

export async function readPreparedAction(
  store: KitStore,
  id: string,
  now: number,
): Promise<PreparedAction> {
  const action = await store.getPreparedAction(id);
  if (!action) {
    throw new KitError("not_found", "Prepared action not found", 404);
  }
  if (action.status === "pending" && action.expiresAt <= now) {
    return (await store.updatePreparedAction(id, { status: "expired" })) ?? { ...action, status: "expired" };
  }
  return action;
}

export async function getPreparedActionForDisplay(
  store: KitStore,
  id: string,
  now: number,
): Promise<PreparedAction> {
  const action = await readPreparedAction(store, id, now);
  if (action.status === "expired" || (action.status === "pending" && action.expiresAt <= now)) {
    throw new KitError("expired", "This approval link has expired", 410);
  }
  return action;
}

export async function completePreparedAction(
  store: KitStore,
  id: string,
  walletAddress: string,
  digest: string | undefined,
  now: number,
): Promise<PreparedAction> {
  const action = await getPreparedActionForDisplay(store, id, now);
  if (action.status !== "pending") {
    throw new KitError("invalid_request", `Prepared action is ${action.status}`, 409);
  }
  if (normalizeSuiAddress(walletAddress) !== action.walletAddress) {
    throw new KitError("invalid_request", "Connected wallet does not match this prepared action", 403);
  }
  const updated = await store.updatePreparedAction(id, {
    status: "executed",
    ...(digest ? { digest } : {}),
  });
  if (!updated) {
    throw new KitError("not_found", "Prepared action not found", 404);
  }
  return updated;
}
