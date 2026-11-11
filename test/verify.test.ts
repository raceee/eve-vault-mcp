import { describe, expect, it } from "vitest";

import { InvalidSignatureError } from "../src/errors.js";
import { encodeLoginMessage } from "../src/login-message.js";
import { createMystenVerifier, FakeVerifier } from "../src/verify.js";
import {
  ALICE,
  BOB,
  challengeMessage,
  completeWithSignature,
  createTestKit,
  json,
  startLogin,
} from "./helpers.js";

describe("zkLogin personal-message verification", () => {
  it("rejects a forged signature", async () => {
    const test = await createTestKit();
    const { session } = await startLogin(test.kit);
    const forged = await completeWithSignature(test.kit, session, ALICE, "forged-signature");
    const body = await json(forged);
    expect(forged.status).toBe(401);
    expect(body.error).toBe("invalid_signature");
  });

  it("rejects a signature that is valid for a different address", async () => {
    const test = await createTestKit();
    const { session } = await startLogin(test.kit);
    const message = await challengeMessage(test.kit, session);
    const aliceSignature = test.verifier.enroll(ALICE, message);

    const stolen = await completeWithSignature(test.kit, session, BOB, aliceSignature);
    const body = await json(stolen);
    expect(stolen.status).toBe(401);
    expect(String(body.error_description).toLowerCase()).toMatch(/address|signature/);
  });

  it("ignores client-supplied message bytes and verifies the rebuilt challenge", async () => {
    const test = await createTestKit();
    const { session } = await startLogin(test.kit);
    const message = await challengeMessage(test.kit, session);
    const other = test.verifier.enroll(ALICE, "some other message the wallet once signed");
    const wrongMessage = await completeWithSignature(test.kit, session, ALICE, other);
    expect(wrongMessage.status).toBe(401);

    const signature = test.verifier.enroll(ALICE, message);
    const ok = await completeWithSignature(test.kit, session, ALICE, signature);
    expect(ok.status).toBe(200);
  });

  it("FakeVerifier distinguishes forged, wrong-address, and wrong-message signatures", async () => {
    const verifier = new FakeVerifier();
    const message = encodeLoginMessage({
      serverName: "Toy",
      issuer: "http://127.0.0.1:8787",
      clientName: "c",
      clientId: "id",
      scopes: ["identity.read"],
      nonce: "abc",
    });
    const text = new TextDecoder().decode(message);
    const signature = verifier.enroll(ALICE, text);

    await expect(
      verifier.verifyPersonalMessage({ message, signature: "nope", address: ALICE }),
    ).rejects.toBeInstanceOf(InvalidSignatureError);

    await expect(
      verifier.verifyPersonalMessage({ message, signature, address: BOB }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/address/) });

    await expect(
      verifier.verifyPersonalMessage({
        message: new TextEncoder().encode("tampered"),
        signature,
        address: ALICE,
      }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/message/) });

    await expect(
      verifier.verifyPersonalMessage({ message, signature, address: ALICE }),
    ).resolves.toBeUndefined();
  });

  it("Mysten verifier is constructed with a Sui client (zkLogin cannot be verified offline)", () => {
    const verifier = createMystenVerifier({
      client: { kind: "mock-sui-client" } as never,
    });
    expect(typeof verifier.verifyPersonalMessage).toBe("function");
  });
});
