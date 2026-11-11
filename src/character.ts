import { normalizeSuiAddress } from "@mysten/sui/utils";

import type { CharacterIdentity } from "./types.js";

export type CharacterResolver = {
  resolve(address: string): Promise<CharacterIdentity | undefined>;
};

export const noopCharacterResolver: CharacterResolver = {
  async resolve() {
    return undefined;
  },
};

/**
 * Best-effort lookup against the EVE Frontier World API
 * `GET /v2/smartcharacters/{wallet_address}`. Login succeeds even if
 * this fails — the access token is always bound to the wallet address.
 */
export function createWorldApiCharacterResolver(options: {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): CharacterResolver {
  const fetchFn = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 2500;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  return {
    async resolve(address: string) {
      const normalized = normalizeSuiAddress(address);
      try {
        const response = await fetchFn(`${baseUrl}/v2/smartcharacters/${normalized}`, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { accept: "application/json" },
        });
        if (!response.ok) {
          return undefined;
        }
        const body: unknown = await response.json();
        return parseCharacter(body);
      } catch {
        return undefined;
      }
    },
  };
}

function parseCharacter(body: unknown): CharacterIdentity | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }
  const record = body as Record<string, unknown>;
  const nested =
    record.smartCharacter && typeof record.smartCharacter === "object"
      ? (record.smartCharacter as Record<string, unknown>)
      : record;
  const id = asString(nested.id) ?? asString(nested.characterId) ?? asString(nested.character_id);
  if (!id) {
    return undefined;
  }
  const name = asString(nested.name) ?? asString(nested.characterName);
  const tribeId = asString(nested.tribeId) ?? asString(nested.tribe_id);
  return {
    id,
    ...(name ? { name } : {}),
    ...(tribeId ? { tribeId } : {}),
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
