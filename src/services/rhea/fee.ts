import Big from "big.js";
import type { RheaFeeItem, RheaQuoteRaw, RheaTokenMeta } from "./types";
import { getCachedRheaTokens, getRheaNativePrice } from "./tokens";
import {
  RHEA_NATIVE_TOKEN_IDS,
  getRheaChainByAlias,
  type TokenChain,
} from "@/config/chains";
import useEvmGasFeesStore from "@/stores/use-evm-gas-fees";
import {
  DEFAULT_EVM_AGGREGATOR_GAS_UNITS,
  HEURISTIC_EVM_FEE_ROUTERS,
} from "./config";

const DEFAULT_GAS_PRICE_WEI = 20n * 10n ** 9n; // 20 gwei

export type FeeContext = {
  fromToken?: TokenChain | null;
  toToken?: TokenChain | null;
};

const asString = (v: unknown, fallback = ""): string => {
  if (v == null) return fallback;
  return String(v);
};

const parsePositiveIntString = (v: unknown): string | null => {
  const s = asString(v, "").trim();
  if (!s || !/^\d+$/.test(s) || BigInt(s) <= 0n) return null;
  return s;
};

const resolveAlias = (token?: TokenChain | null, chainHint?: string | number): string => {
  if (token?.rheaAlias) return token.rheaAlias;
  const fromBlockchain = (token?.blockchain || "").toLowerCase();
  if (fromBlockchain) {
    return getRheaChainByAlias(fromBlockchain)?.alias || fromBlockchain;
  }
  const hint = asString(chainHint, "").toLowerCase();
  if (!hint) return "";
  // HTTP chain id like "56" or alias like "bsc"
  if (/^\d+$/.test(hint)) {
    // Prefer token.chainId match already handled; map common numeric via token if present
    return token?.rheaAlias || "";
  }
  return getRheaChainByAlias(hint)?.alias || hint;
};

const resolveTokenUsdPrice = (opts: {
  address?: string | null;
  alias?: string;
  symbol?: string;
  fallback?: number;
}): number => {
  if (opts.fallback != null && Number(opts.fallback) > 0) return Number(opts.fallback);
  const tokens = getCachedRheaTokens();
  const alias = opts.alias || "";
  const addr = (opts.address || "").toLowerCase();
  if (alias && addr) {
    const byAddr = tokens.find(
      (t) =>
        t.rheaAlias === alias &&
        (t.contractAddress?.toLowerCase?.() === addr || t.assetId?.toLowerCase?.() === addr)
    );
    if (byAddr?.price != null && Number(byAddr.price) > 0) return Number(byAddr.price);
  }
  if (alias && opts.symbol) {
    const bySymbol = tokens.find(
      (t) =>
        t.rheaAlias === alias && t.symbol?.toLowerCase() === opts.symbol?.toLowerCase()
    );
    if (bySymbol?.price != null && Number(bySymbol.price) > 0) return Number(bySymbol.price);
  }
  return 0;
};

const getEvmGasPriceWei = (chainId?: number | string): bigint => {
  if (chainId == null || chainId === "") return DEFAULT_GAS_PRICE_WEI;
  const entry = useEvmGasFeesStore.getState().byChainId[String(chainId)];
  if (!entry?.gasPrice) return DEFAULT_GAS_PRICE_WEI;
  try {
    const gp = BigInt(entry.gasPrice);
    return gp > 0n ? gp : DEFAULT_GAS_PRICE_WEI;
  } catch {
    return DEFAULT_GAS_PRICE_WEI;
  }
};

const buildNativeTokenMeta = (ctx: FeeContext, chainHint?: string | number): RheaTokenMeta | null => {
  const from = ctx.fromToken;
  if (!from) return null;
  const alias = resolveAlias(from, chainHint);
  const nativeId = alias ? RHEA_NATIVE_TOKEN_IDS[alias] : undefined;
  const usdPrice = getRheaNativePrice(from);
  return {
    address: nativeId ?? null,
    symbol: from.nativeToken?.symbol,
    decimals: from.nativeToken?.decimals ?? 18,
    chainId: from.chainId ?? chainHint,
    usdPrice: usdPrice > 0 ? usdPrice : undefined,
  };
};

const buildNetworkFeeFromGasUnits = (
  gasUnits: string,
  gasPriceWei: bigint,
  ctx: FeeContext,
  chainHint?: string | number
): RheaFeeItem | null => {
  try {
    const amount = (BigInt(gasUnits) * gasPriceWei).toString();
    if (BigInt(amount) <= 0n) return null;
    const token = buildNativeTokenMeta(ctx, chainHint);
    if (!token) return null;
    return {
      name: "Network Fee",
      amount,
      expenseType: "FROM_SOURCE_WALLET",
      token,
    };
  } catch {
    return null;
  }
};

const buildNetworkFeeFromUsd = (
  gasCostUsd: string | number,
  ctx: FeeContext,
  chainHint?: string | number
): RheaFeeItem | null => {
  try {
    const usd = Big(asString(gasCostUsd, "0"));
    if (usd.lte(0)) return null;
    const token = buildNativeTokenMeta(ctx, chainHint);
    if (!token) return null;
    const price = token.usdPrice ?? 0;
    let amount = "0";
    if (price > 0) {
      const human = usd.div(price);
      amount = human.times(Big(10).pow(token.decimals ?? 18)).round(0, Big.roundDown).toFixed(0);
    }
    return {
      name: "Network Fee",
      amount,
      expenseType: "FROM_SOURCE_WALLET",
      token,
      ...(price <= 0 || amount === "0"
        ? { amountUsd: Number(usd.toFixed(8)), amountFormatted: "0" }
        : {}),
    };
  } catch {
    return null;
  }
};

const pickTopLevelGasUnits = (q: RheaQuoteRaw): string | null => {
  return parsePositiveIntString(q.gasEstimate) || parsePositiveIntString(q.gas);
};

const buildParaswapFees = (q: RheaQuoteRaw, ctx: FeeContext): RheaFeeItem[] => {
  const fees: RheaFeeItem[] = [];
  const raw = q.raw as Record<string, unknown> | undefined;
  const priceRoute = (raw?.priceRoute || raw) as Record<string, unknown> | undefined;
  const gasCostUsd =
    priceRoute?.gasCostUSD ?? q.gasCostUSD ?? (priceRoute as any)?.gasCostUsd;
  const chainHint =
    priceRoute?.network ?? q.chainId ?? ctx.fromToken?.chainId;

  if (gasCostUsd != null && asString(gasCostUsd, "").trim() !== "") {
    const item = buildNetworkFeeFromUsd(gasCostUsd as string | number, ctx, chainHint as string | number);
    if (item) fees.push(item);
    return fees;
  }

  const gasUnits = pickTopLevelGasUnits(q) || parsePositiveIntString(priceRoute?.gasCost);
  if (gasUnits) {
    const gasPrice = getEvmGasPriceWei(ctx.fromToken?.chainId ?? (chainHint as string | number));
    const item = buildNetworkFeeFromGasUnits(gasUnits, gasPrice, ctx, chainHint as string | number);
    if (item) fees.push(item);
  }
  return fees;
};

const buildCowFees = (q: RheaQuoteRaw, ctx: FeeContext): RheaFeeItem[] => {
  const fees: RheaFeeItem[] = [];
  const raw = q.raw as Record<string, unknown> | undefined;
  const quote = raw?.quote as Record<string, unknown> | undefined;
  if (!quote) return fees;

  const feeAmount = parsePositiveIntString(quote.feeAmount);
  const from = ctx.fromToken;
  if (feeAmount && from) {
    const alias = resolveAlias(from);
    const sellToken = asString(quote.sellToken, from.contractAddress);
    const usdPrice = resolveTokenUsdPrice({
      address: sellToken,
      alias,
      symbol: from.symbol,
      fallback: from.price,
    });
    fees.push({
      name: "Protocol Fee",
      amount: feeAmount,
      expenseType: "FROM_SOURCE_WALLET",
      token: {
        address: sellToken,
        symbol: from.symbol,
        decimals: from.decimals,
        chainId: from.chainId,
        usdPrice: usdPrice > 0 ? usdPrice : undefined,
      },
    });
  }

  const gasAmount = parsePositiveIntString(quote.gasAmount);
  const gasPriceStr = parsePositiveIntString(quote.gasPrice);
  if (gasAmount && gasPriceStr) {
    const item = buildNetworkFeeFromGasUnits(
      gasAmount,
      BigInt(gasPriceStr),
      ctx,
      ctx.fromToken?.chainId
    );
    if (item) fees.push(item);
  }

  return fees;
};

const buildGasEstimateFees = (
  q: RheaQuoteRaw,
  ctx: FeeContext,
  fallbackGasUnits?: string | null
): RheaFeeItem[] => {
  const gasUnits = pickTopLevelGasUnits(q) || fallbackGasUnits || null;
  if (!gasUnits) return [];
  // EVM gas units × wei gasPrice only; skip non-EVM (no comparable gasPrice cache)
  const chainType = ctx.fromToken?.chainType;
  if (chainType && chainType !== "evm") return [];
  const chainId = ctx.fromToken?.chainId ?? (q.chainId as string | number | undefined);
  if (chainId == null || chainId === "") return [];
  const gasPrice = getEvmGasPriceWei(chainId);
  const item = buildNetworkFeeFromGasUnits(gasUnits, gasPrice, ctx, chainId);
  return item ? [item] : [];
};

/**
 * Resolve fee items for a quote. Prefer API fee[]; otherwise synthesize from router-specific fields.
 * Extend this function when the API adds new fee sources.
 */
export function resolveQuoteFees(q: RheaQuoteRaw, ctx: FeeContext = {}): RheaFeeItem[] {
  const existing = q.fee;
  if (Array.isArray(existing) && existing.length > 0) {
    return existing as RheaFeeItem[];
  }

  const router = asString(q.router, "").toLowerCase();

  if (router === "paraswap") {
    return buildParaswapFees(q, ctx);
  }
  if (router === "cow") {
    return buildCowFees(q, ctx);
  }

  // bitget / binance: no gasEstimate in quote — heuristic Network Fee (skip nearintents)
  const heuristicUnits = HEURISTIC_EVM_FEE_ROUTERS.has(router)
    ? DEFAULT_EVM_AGGREGATOR_GAS_UNITS
    : null;

  // Generic: gasEstimate / gas units → Network Fee; optional router heuristic fallback
  return buildGasEstimateFees(q, ctx, heuristicUnits);
}

export function formatFeeItems(fees: RheaFeeItem[]): {
  fee: RheaFeeItem[];
  totalFeeUsd: number;
} {
  let totalFeeUsd = Big(0);
  const fee = fees.map((item) => {
    const decimals = item.token?.decimals ?? 0;
    let amountFormatted = item.amountFormatted ?? "0";
    let amountUsd = item.amountUsd ?? 0;
    try {
      // Prefer recomputing from amount when present and positive
      if (item.amount != null && asString(item.amount, "0") !== "0") {
        amountFormatted = Big(item.amount || 0).div(Big(10).pow(decimals)).toFixed();
        amountUsd = Number(
          Big(amountFormatted).times(item.token?.usdPrice ?? 0).toFixed(8)
        );
      } else if (item.amountUsd != null) {
        amountUsd = Number(item.amountUsd);
        amountFormatted = item.amountFormatted ?? "0";
      }
      totalFeeUsd = totalFeeUsd.plus(amountUsd || 0);
    } catch {
      amountFormatted = "0";
      amountUsd = 0;
    }
    return {
      ...item,
      amountFormatted,
      amountUsd,
    };
  });
  return { fee, totalFeeUsd: Number(totalFeeUsd.toFixed(8)) };
}
