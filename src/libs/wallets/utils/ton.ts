import { csl } from "@/utils/log";
import { Address, beginCell, Cell } from "@ton/ton";

const TONCENTER_API = "https://toncenter.com/api/v3";

export interface PollTransactionByBocOptions {
  maxPollCount?: number;
  pollInterval?: number;
}

export interface PollTransactionByBocResult {
  hexHash: string;
  txHash: string;
  transaction: Record<string, unknown>;
}

/**
 * Poll TON transaction by boc, returns tx hash when confirmed on-chain
 */
export async function pollTransactionByBoc(
  boc: string,
  options: PollTransactionByBocOptions = {}
): Promise<PollTransactionByBocResult> {
  const { maxPollCount = 60, pollInterval = 3000 } = options;

  const bocCell = Cell.fromBoc(Buffer.from(boc, "base64"))[0];
  const messageHash = bocCell.hash().toString("hex");
  const url = `${TONCENTER_API}/transactionsByMessage?msg_hash=${messageHash}&direction=in&limit=1`;

  for (let i = 0; i < maxPollCount; i++) {
    csl("TON pollTransactionByBoc", "rose-600", "polling transaction status (%s), %d times", messageHash, i + 1);
    const response = await fetch(url);
    const data = (await response.json()) as { transactions?: Array<{ hash: string }> };
    csl("TON pollTransactionByBoc", "rose-600", "polling transaction response: %o", data);

    if (data.transactions && data.transactions.length > 0) {
      const txHash = data.transactions[0].hash;
      const hexHash = Buffer.from(txHash, "base64").toString("hex");
      return {
        hexHash,
        txHash,
        transaction: data.transactions[0] as Record<string, unknown>,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    "Query timeout, transaction hash not found. Please check if the wallet transaction was successful."
  );
}

export const buildJettonWalletTransferBody = (params: {
  memo?: string;
  amount: string;
  recipient: string;
  refundTo: string;
  forwardTonAmount?: bigint;
  forwardPayload?: Cell;
}) => {
  const {
    memo,
    amount,
    recipient,
    refundTo,
    forwardTonAmount,
    forwardPayload,
  } = params;

  let _forwardPayload = forwardPayload;
  if (!_forwardPayload && memo) {
    _forwardPayload = beginCell().storeUint(0, 32).storeStringTail(memo).endCell();
  }

  return beginCell()
    .storeUint(0xf8a7ea5, 32)
    .storeUint(0, 64)
    .storeCoins(BigInt(amount))
    .storeAddress(Address.parse(recipient))
    .storeAddress(Address.parse(refundTo))
    .storeBit(false)
    .storeCoins(forwardTonAmount ?? 1n)
    .storeBit(!!_forwardPayload)
    .storeMaybeRef(_forwardPayload)
    .endCell();
};
