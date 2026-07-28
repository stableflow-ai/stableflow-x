export const BridgeFee = [
  {
    includeChains: ["BNB Chain", "Tron"],
    recipient: "reffer.near",
    // No bridge fee will be charged temporarily
    fee: 1, // 100=1% 1=0.01%
  },
];

export const checkIsBridgeFee = (params?: {
  fromToken?: { chainName?: string; symbol?: string };
  toToken?: { chainName?: string; symbol?: string };
}) => {
  const currentBridgeFee = BridgeFee[0];
  const { fromToken, toToken } = params ?? {};

  if (!fromToken || !toToken) {
    return false;
  }

  const fromTokenSymbol = fromToken?.symbol === "USD₮0" ? "USDT" : fromToken?.symbol;
  const toTokenSymbol = toToken?.symbol === "USD₮0" ? "USDT" : toToken?.symbol;

  if (
    currentBridgeFee.includeChains.includes(fromToken?.chainName || "") ||
    currentBridgeFee.includeChains.includes(toToken?.chainName || "") ||
    fromTokenSymbol !== toTokenSymbol
  ) {
    return true;
  }

  return false;
};

export const buildAppFees = (params?: {
  fromToken?: { chainName?: string; symbol?: string };
  toToken?: { chainName?: string; symbol?: string };
}) => {
  if (!checkIsBridgeFee(params)) return undefined;
  return BridgeFee.map((it) => ({ recipient: it.recipient, fee: it.fee }));
};
