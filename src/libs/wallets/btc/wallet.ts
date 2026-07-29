import { getBtcGasPrice } from "btc-wallet";
import { csl } from "@/utils/log";

const ESPLORA_UTXO_URL = "https://blockstream.info/api/address";
const DEFAULT_FEE_RATE = 5;

type SendBitcoinFn = (
  toAddress: string,
  satoshis: number,
  options?: { feeRate: number }
) => Promise<string>;

type SignMessageFn = (message: string) => Promise<string>;

export default class BtcWallet {
  private account: string | null;
  private sendBitcoin: SendBitcoinFn;
  private signMessage: SignMessageFn;

  constructor(options: {
    account: string | null;
    sendBitcoin: SendBitcoinFn;
    signMessage: SignMessageFn;
  }) {
    this.account = options.account;
    this.sendBitcoin = options.sendBitcoin;
    this.signMessage = options.signMessage;
  }

  private async resolveFeeRate(preferred?: number | string | null): Promise<number> {
    if (preferred != null && preferred !== "") {
      const n = Number(preferred);
      if (Number.isFinite(n) && n > 0) return n;
    }
    try {
      const rate = await getBtcGasPrice("halfHour");
      if (Number.isFinite(rate) && rate > 0) return rate;
    } catch (error) {
      csl("BTC resolveFeeRate", "yellow-600", "getBtcGasPrice failed: %o", error);
    }
    return DEFAULT_FEE_RATE;
  }

  async balanceOf(
    _token: any,
    account: string,
    options?: { isCatchError?: boolean }
  ): Promise<string> {
    try {
      const res = await fetch(`${ESPLORA_UTXO_URL}/${account}/utxo`);
      if (!res.ok) {
        throw new Error(`Esplora utxo request failed: ${res.status}`);
      }
      const utxos = (await res.json()) as Array<{
        value: number;
        status?: { confirmed?: boolean };
      }>;
      const sats = utxos
        .filter((u) => u?.status?.confirmed !== false)
        .reduce((sum, u) => sum + (Number(u.value) || 0), 0);
      return String(sats);
    } catch (error) {
      csl("BTC balanceOf", "red-500", "Get BTC balance failed: %o", error);
      if (options?.isCatchError) throw error;
      return "0";
    }
  }

  async sendRheaTx(tx: any): Promise<string> {
    if (!this.account) {
      throw new Error("Bitcoin wallet not connected");
    }

    const kind = String(tx?.kind || "").toLowerCase();
    if (kind !== "utxo_transfer" && kind !== "btc_transfer") {
      throw new Error(`Unsupported BTC Rhea tx kind: ${tx?.kind}`);
    }

    const to = tx.depositAddress || tx.to;
    if (!to) {
      throw new Error("Invalid Rhea BTC tx: missing depositAddress");
    }

    const satoshis = Number(tx.amount);
    if (!Number.isFinite(satoshis) || satoshis <= 0) {
      throw new Error(`Invalid Rhea BTC amount: ${tx.amount}`);
    }

    const feeRate = await this.resolveFeeRate(tx.feeRate);
    return await this.sendBitcoin(to, satoshis, { feeRate });
  }

  async transfer(data: {
    token?: any;
    amount?: string;
    recipient?: string;
    originAsset?: string;
    depositAddress?: string;
    memo?: string;
  }): Promise<string> {
    if (!this.account) {
      throw new Error("Bitcoin wallet not connected");
    }

    const to = data.recipient || data.depositAddress;
    if (!to) {
      throw new Error("Missing recipient address");
    }

    const amountRaw = data.amount;
    if (amountRaw == null || amountRaw === "") {
      throw new Error("Missing transfer amount");
    }

    // amount from deposit flow is wei/satoshi integer string
    const satoshis = Number(amountRaw);
    if (!Number.isFinite(satoshis) || satoshis <= 0) {
      throw new Error(`Invalid BTC transfer amount: ${amountRaw}`);
    }

    const feeRate = await this.resolveFeeRate(null);
    return await this.sendBitcoin(to, satoshis, { feeRate });
  }

  async signRheaRequest(req: any): Promise<Record<string, unknown>> {
    const message =
      typeof req === "string"
        ? req
        : req?.message || req?.payload || JSON.stringify(req);
    const signature = await this.signMessage(String(message));
    return {
      ...(typeof req === "object" && req ? req : {}),
      signature,
      message,
    };
  }
}
