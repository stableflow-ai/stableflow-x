import Big from "big.js";
import { rheaSwapApi } from "./client";
import { buildAppFees } from "./config";
import type {
  RheaFeeItem,
  RheaNormalizedQuote,
  RheaQuoteRaw,
  RheaQuoteResponse,
} from "./types";
import { getRouterDisplayName } from "@/services/constants";

const asString = (v: unknown, fallback = "0"): string => {
  if (v == null) return fallback;
  return String(v);
};

const pickOut = (q: RheaQuoteRaw): string => {
  return asString(q.estimatedOut ?? q.amountOut ?? q.estimatedOutSmallest ?? "0");
};

const pickMinOut = (q: RheaQuoteRaw): string => {
  return asString(q.minAmountOut ?? pickOut(q));
};

const pickFee = (q: RheaQuoteRaw): RheaFeeItem[] => {
  const fee = q.fee;
  return Array.isArray(fee) ? (fee as RheaFeeItem[]) : [];
};

const formatFeeItems = (fees: RheaFeeItem[]): { fee: RheaFeeItem[]; totalFeeUsd: number } => {
  let totalFeeUsd = Big(0);
  const fee = fees.map((item) => {
    const decimals = item.token?.decimals ?? 0;
    let amountFormatted = "0";
    let amountUsd = 0;
    try {
      amountFormatted = Big(item.amount || 0).div(Big(10).pow(decimals)).toFixed();
      amountUsd = Number(Big(amountFormatted).times(item.token?.usdPrice ?? 0).toFixed(8));
      totalFeeUsd = totalFeeUsd.plus(amountUsd);
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
};

const pickPriceImpact = (
  q: RheaQuoteRaw,
  route: any,
  estimatedOutUsd?: string | number
): { priceImpactUsd?: string; priceImpactUsdPercent?: string } => {
  if (route?.priceImpactUsdPercent != null || route?.priceImpactUsd != null) {
    return {
      priceImpactUsd: route?.priceImpactUsd != null ? asString(route.priceImpactUsd) : undefined,
      priceImpactUsdPercent:
        route?.priceImpactUsdPercent != null ? asString(route.priceImpactUsdPercent) : undefined,
    };
  }

  const amountInUsd = q.amountInUsd;
  if (amountInUsd == null || estimatedOutUsd == null) {
    return {};
  }

  try {
    const inUsd = Big(asString(amountInUsd));
    if (inUsd.eq(0)) return {};
    const outUsd = Big(asString(estimatedOutUsd));
    const percent = outUsd.minus(inUsd).div(inUsd).times(100);
    const usd = outUsd.minus(inUsd);
    return {
      priceImpactUsd: usd.toFixed(6),
      priceImpactUsdPercent: percent.toFixed(4),
    };
  } catch {
    return {};
  }
};

const quoteKey = (q: RheaQuoteRaw, index: number): string => {
  const router = asString(q.router, "unknown");
  const requestId = asString(q.requestId ?? q.orderId ?? "", "");
  return requestId ? `${router}:${requestId}` : `${router}:${index}:${pickOut(q)}`;
};

export function normalizeQuote(q: RheaQuoteRaw, index: number, isBest = false): RheaNormalizedQuote {
  const router = asString(q.router, "unknown");
  const routerName = getRouterDisplayName(router, asString(q.routerName, "") || undefined);
  const estimatedOut = pickOut(q);
  const minAmountOut = pickMinOut(q);
  // Only priceImpact* / outputAmountUsd are read from raw.route (see plan decision)
  const route = (q.raw as any)?.route;
  const estimatedOutUsd =
    (q.estimatedOutUsd as string | number | undefined) ?? route?.outputAmountUsd;
  const { fee, totalFeeUsd } = formatFeeItems(pickFee(q));
  const priceImpact = pickPriceImpact(q, route, estimatedOutUsd);

  return {
    key: quoteKey(q, index),
    router,
    routerName,
    amountIn: q.amountIn != null ? asString(q.amountIn) : undefined,
    amountOut: estimatedOut,
    estimatedOut,
    estimatedOutFormatted: q.estimatedOutFormatted != null ? asString(q.estimatedOutFormatted) : undefined,
    estimatedOutUsd,
    minAmountOut,
    timeEstimate: typeof q.timeEstimate === "number" ? q.timeEstimate : undefined,
    fee,
    totalFeeUsd,
    ...priceImpact,
    executionType: q.executionType != null ? asString(q.executionType) : undefined,
    fromChain: q.fromChain != null ? asString(q.fromChain) : undefined,
    toChain: q.toChain != null ? asString(q.toChain) : undefined,
    fromAsset: q.fromAsset != null ? asString(q.fromAsset) : undefined,
    toAsset: q.toAsset != null ? asString(q.toAsset) : undefined,
    orderId: q.orderId != null ? asString(q.orderId) : undefined,
    requestId: q.requestId != null ? asString(q.requestId) : undefined,
    resultType: q.resultType != null ? asString(q.resultType) : undefined,
    isBest,
    passThrough: {
      router,
      expectedOut: estimatedOut,
      minAmountOut,
      amountOut: estimatedOut,
      quoteId: q.quoteId != null ? asString(q.quoteId) : undefined,
      preSwap: q.preSwap ?? null,
      bridge: q.bridge,
      market: q.market,
    },
  };
}

export function normalizeQuoteResponse(data: RheaQuoteResponse): {
  quotes: RheaNormalizedQuote[];
  bestKey?: string;
  meta: Pick<RheaQuoteResponse, "chainType" | "executionType" | "isCrossChain" | "errors">;
} {
  const all = Array.isArray(data.allQuotes) ? data.allQuotes : [];
  const bestRaw = data.bestQuote;
  const bestRouter = bestRaw ? asString(bestRaw.router, "") : "";
  const bestOut = bestRaw ? pickOut(bestRaw) : "";

  const quotes = all.map((q, i) => {
    const isBest =
      !!bestRaw &&
      asString(q.router, "") === bestRouter &&
      pickOut(q) === bestOut;
    return normalizeQuote(q, i, isBest);
  });

  // Ensure bestQuote is present even if missing from allQuotes
  if (bestRaw && !quotes.some((q) => q.isBest)) {
    quotes.unshift(normalizeQuote(bestRaw, -1, true));
  }

  // If still no best flag, mark first by output
  if (quotes.length && !quotes.some((q) => q.isBest)) {
    const sorted = [...quotes].sort((a, b) => {
      try {
        return BigInt(b.estimatedOut) > BigInt(a.estimatedOut) ? 1 : -1;
      } catch {
        return Number(b.estimatedOut) - Number(a.estimatedOut);
      }
    });
    const top = sorted[0];
    const idx = quotes.findIndex((q) => q.key === top.key);
    if (idx >= 0) quotes[idx] = { ...quotes[idx], isBest: true };
  }

  const best = quotes.find((q) => q.isBest);

  return {
    quotes,
    bestKey: best?.key,
    meta: {
      chainType: data.chainType,
      executionType: data.executionType,
      isCrossChain: data.isCrossChain,
      errors: data.errors,
    },
  };
}

export type QuoteParams = {
  fromChain: string;
  toChain: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippage?: number;
  sender: string;
  recipient?: string;
  fromToken?: { chainName?: string; symbol?: string };
  toToken?: { chainName?: string; symbol?: string };
};

export async function rheaQuote(params: QuoteParams) {
  const appFees = buildAppFees({
    fromToken: params.fromToken,
    toToken: params.toToken,
  });

  const data = await rheaSwapApi<RheaQuoteResponse>("/quote", {
    method: "POST",
    body: JSON.stringify({
      fromChain: params.fromChain,
      toChain: params.toChain,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn,
      slippage: params.slippage ?? 50,
      sender: params.sender,
      quoteWaitingTimeMs: 1000,
      ...(params.recipient ? { recipient: params.recipient } : {}),
      ...(appFees ? { appFees } : {}),
    }),
  });

  return normalizeQuoteResponse(data);
}
