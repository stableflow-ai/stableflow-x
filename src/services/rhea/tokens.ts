import { rheaFetch } from "./client";
import type { RheaLendingToken } from "./types";
import chains, {
  type TokenChain,
  RHEA_TOKEN_QUERY_CHAINS,
  RHEA_NATIVE_TOKEN_IDS,
  getRheaChainByAlias,
  aliasToHttpChainId,
} from "@/config/chains";
import { Service } from "@/services/constants";

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { tokens: TokenChain[]; fetchedAt: number } | null = null;
let inflight: Promise<TokenChain[]> | null = null;

const resolveLocalChain = (alias: string) => {
  const cfg = getRheaChainByAlias(alias);
  const key = cfg?.localKey || alias;
  // chains keys: eth, arb, bsc, polygon (not pol), etc.
  const local =
    (chains as Record<string, (typeof chains)[keyof typeof chains]>)[key] ||
    (chains as Record<string, (typeof chains)[keyof typeof chains]>)[alias];
  return { cfg, local, key };
};

export const mapLendingTokenToTokenChain = (item: RheaLendingToken): TokenChain | null => {
  const alias = (item.blockchain || "").toLowerCase();
  if (!alias) return null;

  const symbol = item.symbol || "UNKNOWN";
  if (/DEPRECATED/i.test(symbol)) return null;

  const rheaCfg = getRheaChainByAlias(alias);
  if (!rheaCfg?.tradeEnabled) return null;

  const { local } = resolveLocalChain(alias);
  if (!local) return null;

  const contractAddress =
    item.contractAddress ||
    item.assetId ||
    "";

  const decimals = Number(item.decimals ?? local.nativeToken.decimals);
  const icon = item.icon || local.chainIcon;

  return {
    symbol,
    decimals,
    icon,
    assetId: item.assetId,
    contractAddress,
    services: [Service.Rhea],
    price: item.price != null ? Number(item.price) : undefined,
    chainName: local.chainName,
    blockchain: local.blockchain,
    chainIcon: local.chainIcon,
    chainIconGray: local.chainIconGray,
    chainType: local.chainType,
    chainId: local.chainId,
    blockExplorerUrl: local.blockExplorerUrl,
    primaryColor: local.primaryColor,
    nativeToken: local.nativeToken,
    rpcUrls: local.rpcUrls,
    rpcUrl: local.rpcUrl,
    rheaAlias: alias,
    rheaHttpChainId: aliasToHttpChainId(alias),
  };
};

export async function fetchRheaTokens(force = false): Promise<TokenChain[]> {
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.tokens;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const path = `/get_multichain_lending_tokens_data?chains=${encodeURIComponent(RHEA_TOKEN_QUERY_CHAINS)}`;
    const raw = await rheaFetch<RheaLendingToken[]>(path, { method: "GET" });
    const list = Array.isArray(raw) ? raw : [];
    const tokens = list
      .map(mapLendingTokenToTokenChain)
      .filter((t): t is TokenChain => !!t);

    cache = { tokens, fetchedAt: Date.now() };
    inflight = null;
    return tokens;
  })().catch((err) => {
    inflight = null;
    throw err;
  });

  return inflight;
}

export function getCachedRheaTokens(): TokenChain[] {
  return cache?.tokens ?? [];
}

/** Native gas token USD price from Rhea lending tokens cache. */
export function getRheaNativePrice(fromToken: {
  rheaAlias?: string;
  blockchain?: string;
  nativeToken?: { symbol?: string; price?: number };
}): number {
  if (fromToken?.nativeToken?.price != null && Number(fromToken.nativeToken.price) > 0) {
    return Number(fromToken.nativeToken.price);
  }

  const alias =
    fromToken?.rheaAlias ||
    getRheaChainByAlias((fromToken?.blockchain || "").toLowerCase())?.alias ||
    (fromToken?.blockchain || "").toLowerCase();

  const nativeId = RHEA_NATIVE_TOKEN_IDS[alias];
  const tokens = getCachedRheaTokens();

  if (nativeId) {
    const byId = tokens.find(
      (t) =>
        t.rheaAlias === alias &&
        (t.contractAddress === nativeId ||
          t.assetId === nativeId ||
          t.contractAddress?.toLowerCase?.() === nativeId.toLowerCase())
    );
    if (byId?.price != null && Number(byId.price) > 0) return Number(byId.price);
  }

  const bySymbol = tokens.find(
    (t) =>
      t.rheaAlias === alias &&
      t.symbol?.toLowerCase() === fromToken?.nativeToken?.symbol?.toLowerCase()
  );
  if (bySymbol?.price != null && Number(bySymbol.price) > 0) return Number(bySymbol.price);

  return 0;
}

function resolveTokenAlias(token: TokenChain): string {
  return (
    token.rheaAlias ||
    getRheaChainByAlias((token.blockchain || "").toLowerCase())?.alias ||
    (token.blockchain || "").toLowerCase()
  );
}

export function isRheaNativeToken(token: TokenChain, nativeId: string): boolean {
  const addr = (token.contractAddress || "").toLowerCase();
  const asset = (token.assetId || "").toLowerCase();
  const native = nativeId.toLowerCase();
  if (addr === native || asset === native) return true;

  const isNativeSymbol =
    !!token.symbol &&
    !!token.nativeToken?.symbol &&
    token.symbol.toLowerCase() === token.nativeToken.symbol.toLowerCase();
  if (!isNativeSymbol) return false;

  // Lending often fills contractAddress with assetId for natives
  if (!token.contractAddress || token.contractAddress === token.assetId) return true;
  return false;
}

/** True when token is the EVM chain native gas token (may use nep141/nep245 as contractAddress). */
export function isEvmNativeBalanceToken(token: TokenChain): boolean {
  if (token.chainType !== "evm" || token.chainId == null) return false;
  const alias = resolveTokenAlias(token);
  const nativeId = alias ? RHEA_NATIVE_TOKEN_IDS[alias] : undefined;
  if (!nativeId) return false;
  return isRheaNativeToken(token, nativeId);
}

/** On-chain token ID for Rhea quote/swap/report. Natives use RHEA_NATIVE_TOKEN_IDS. */
export function tokenAddressForQuote(token: TokenChain): string {
  const alias = resolveTokenAlias(token);
  const nativeId = alias ? RHEA_NATIVE_TOKEN_IDS[alias] : undefined;
  if (nativeId && isRheaNativeToken(token, nativeId)) {
    return nativeId;
  }
  return token.contractAddress || token.assetId || "";
}

export function tokenHttpChainId(token: TokenChain): string {
  return token.rheaHttpChainId || aliasToHttpChainId(token.blockchain) || String(token.chainId ?? "");
}
