export type LoginMessageInput = {
  serverName: string;
  issuer: string;
  clientName: string;
  clientId: string;
  scopes: string[];
  nonce: string;
};

/**
 * Canonical personal-message body. The browser displays this exact text;
 * the server rebuilds it from stored session fields and NEVER verifies
 * client-supplied message bytes.
 */
export function buildLoginMessage(input: LoginMessageInput): string {
  return [
    `Sign in with EVE Vault for MCP`,
    ``,
    `Application: ${input.clientName}`,
    `Client ID: ${input.clientId}`,
    `URI: ${input.issuer}`,
    `Scopes: ${input.scopes.join(" ") || "(none)"}`,
    `Nonce: ${input.nonce}`,
    ``,
    `This signature proves you control this wallet and authorizes the application`,
    `to use the listed scopes. It cannot move funds or sign transactions for you.`,
    `The agent never receives your EVE Vault key.`,
  ].join("\n");
}

export function encodeLoginMessage(input: LoginMessageInput): Uint8Array {
  return new TextEncoder().encode(buildLoginMessage(input));
}
