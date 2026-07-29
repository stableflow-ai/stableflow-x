import { getNoirWallet, isNoirWalletInstalled } from "@noir-wallet/sdk";
import type { Balance, SignMessageResult, ZcashConnectResult } from "@noir-wallet/sdk";

export { isNoirWalletInstalled };

export function getZcashWallet() {
  const wallet = getNoirWallet();
  if (!wallet) {
    throw new Error("Noir Wallet not installed");
  }
  return wallet.zcash;
}

export async function connect_zcash(): Promise<ZcashConnectResult> {
  return await getZcashWallet().connect();
}

export async function get_accounts_zcash(): Promise<ZcashConnectResult | null> {
  return await getZcashWallet().getAccounts();
}

export async function get_balance_zcash(): Promise<Balance> {
  return await getZcashWallet().getBalance();
}

export async function sign_message_zcash(message: string): Promise<SignMessageResult> {
  return await getZcashWallet().signMessage(message);
}

export async function transfer_zcash({
  to,
  amount,
}: {
  to: string;
  amount: string;
}): Promise<string> {
  return await getZcashWallet().sendTransaction({ to, amount });
}

export async function disconnect_zcash(): Promise<void> {
  try {
    await getZcashWallet().disconnect();
  } catch {
    // ignore disconnect errors when extension is unavailable
  }
}
