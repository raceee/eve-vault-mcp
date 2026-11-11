import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";

import { InvalidSignatureError } from "./errors.js";

export type VerifyPersonalMessageInput = {
  message: Uint8Array;
  signature: string;
  address: string;
};

export type SignatureVerifier = {
  verifyPersonalMessage(input: VerifyPersonalMessageInput): Promise<void>;
};

export type MystenNetwork = "mainnet" | "testnet" | "devnet" | "localnet";

/**
 * zkLogin signatures (EVE Vault) cannot be verified offline. Mysten's
 * verifier needs a Sui client so it can check the proof against the
 * current epoch. See https://docs.evefrontier.com/dapps/verifying-sign-in
 */
export function createMystenVerifier(options?: {
  client?: SuiClient;
  network?: MystenNetwork;
}): SignatureVerifier {
  const client =
    options?.client ??
    new SuiClient({ url: getFullnodeUrl(options?.network ?? "mainnet") });

  return {
    async verifyPersonalMessage(input) {
      const address = normalizeSuiAddress(input.address);
      try {
        await verifyPersonalMessageSignature(input.message, input.signature, {
          client,
          address,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "invalid signature";
        throw new InvalidSignatureError(detail);
      }
    },
  };
}

/**
 * Deterministic verifier for tests. A signature is valid only for the
 * (address, message) pair it was enrolled against. Forged values and
 * signatures from a different address are rejected.
 */
export class FakeVerifier implements SignatureVerifier {
  private readonly enrolled = new Map<string, { address: string; message: string }>();

  enroll(address: string, message: string): string {
    const normalized = normalizeSuiAddress(address);
    const signature = `fake.${normalized}.${hashSnippet(message)}`;
    this.enrolled.set(signature, { address: normalized, message });
    return signature;
  }

  async verifyPersonalMessage(input: VerifyPersonalMessageInput): Promise<void> {
    const claimed = normalizeSuiAddress(input.address);
    const message = new TextDecoder().decode(input.message);
    const match = this.enrolled.get(input.signature);
    if (!match) {
      throw new InvalidSignatureError("forged or unknown signature");
    }
    if (match.address !== claimed) {
      throw new InvalidSignatureError("signature is not valid for this address");
    }
    if (match.message !== message) {
      throw new InvalidSignatureError("signature does not cover the rebuilt message");
    }
  }
}

function hashSnippet(message: string): string {
  let hash = 0;
  for (let i = 0; i < message.length; i += 1) {
    hash = (hash * 31 + message.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
