import { getWallets } from "@wallet-standard/app";

type WalletAccount = {
  address: string;
};

type Wallet = {
  name: string;
  accounts: readonly WalletAccount[];
  features: Record<string, unknown>;
};

type SignPersonalMessageFeature = {
  signPersonalMessage: (input: {
    account: WalletAccount;
    message: Uint8Array;
  }) => Promise<{ signature: string }>;
};

type SignAndExecuteFeature = {
  signAndExecuteTransaction: (input: {
    account: WalletAccount;
    transaction: Uint8Array | string;
  }) => Promise<{ digest?: string }>;
};

const CONNECT = "standard:connect";
const SIGN_MESSAGE = "sui:signPersonalMessage";
const SIGN_AND_EXECUTE = "sui:signAndExecuteTransaction";

export function findEveVault(): Wallet | undefined {
  const wallets = getWallets().get() as unknown as Wallet[];
  const named = wallets.find((wallet) => /eve vault/i.test(wallet.name));
  if (named) {
    return named;
  }
  return wallets.find((wallet) => Boolean(wallet.features[SIGN_MESSAGE]));
}

export async function connectWallet(): Promise<{ wallet: Wallet; account: WalletAccount }> {
  const wallet = findEveVault();
  if (!wallet) {
    throw new Error("EVE Vault was not found. Install the EVE Vault browser extension and unlock it.");
  }
  const connect = wallet.features[CONNECT] as { connect: () => Promise<{ accounts?: WalletAccount[] }> } | undefined;
  if (connect?.connect) {
    await connect.connect();
  }
  const account = wallet.accounts[0];
  if (!account) {
    throw new Error("EVE Vault is installed but no account is connected.");
  }
  return { wallet, account };
}

export async function signLoginMessage(message: string): Promise<{ address: string; signature: string }> {
  const { wallet, account } = await connectWallet();
  const feature = wallet.features[SIGN_MESSAGE] as SignPersonalMessageFeature | undefined;
  if (!feature?.signPersonalMessage) {
    throw new Error(`${wallet.name} cannot sign personal messages.`);
  }
  const result = await feature.signPersonalMessage({
    account,
    message: new TextEncoder().encode(message),
  });
  return { address: account.address, signature: result.signature };
}

export async function signAndExecute(transaction: string): Promise<{ address: string; digest?: string }> {
  const { wallet, account } = await connectWallet();
  const feature = wallet.features[SIGN_AND_EXECUTE] as SignAndExecuteFeature | undefined;
  if (!feature?.signAndExecuteTransaction) {
    throw new Error(`${wallet.name} cannot sign and execute transactions.`);
  }
  const result = await feature.signAndExecuteTransaction({
    account,
    transaction,
  });
  return { address: account.address, digest: result.digest };
}
