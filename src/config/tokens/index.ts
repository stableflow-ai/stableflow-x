import type { TokenChain } from "../chains";
import { getStableflowTokenLogo } from "@/utils/format/logo";
import { getCachedRheaTokens } from "@/services/rhea/tokens";

export interface EvmBalancesToken {
  chain_id: number;
  tokens: string[];
  decimals: number[];
  symbols: string[];
}

/** Build EVM balance query payload from current Rhea token cache */
export const buildEvmBalancesTokens = (tokenList?: TokenChain[]): EvmBalancesToken[] => {
  const tokens = (tokenList ?? getCachedRheaTokens()).filter(
    (t) => t.chainType === "evm" && t.chainId != null && t.contractAddress
  );
  const map: Record<string, EvmBalancesToken> = {};
  for (const chain of tokens) {
    const key = String(chain.chainId);
    if (!map[key]) {
      map[key] = {
        chain_id: chain.chainId!,
        tokens: [],
        decimals: [],
        symbols: [],
      };
    }
    const addr = chain.contractAddress;
    if (!map[key].tokens.includes(addr)) {
      map[key].tokens.push(addr);
      map[key].decimals.push(chain.decimals);
      map[key].symbols.push(chain.symbol);
    }
  }
  return Object.values(map);
};

export const evmBalancesTokens: EvmBalancesToken[] = [];

export const stablecoinLogoMap: Record<string, string> = {
  USDT: getStableflowTokenLogo("usdt"),
  USDC: getStableflowTokenLogo("usdc"),
  "USD₮0": getStableflowTokenLogo("usdt0"),
  USDT0: getStableflowTokenLogo("usdt0"),
  "USD₮": getStableflowTokenLogo("usdt0"),
  frxUSD: getStableflowTokenLogo("frxusd"),
  EURe: getStableflowTokenLogo("eure"),
};

export const getTokenLogo = (symbol: string, fallback?: string) => {
  return stablecoinLogoMap[symbol] || fallback || getStableflowTokenLogo("usdt");
};

/** Dynamic token list accessor (populated after Rhea fetch) */
export const getTokens = (): TokenChain[] => getCachedRheaTokens();

/** @deprecated use getTokens() — kept for history UI fallback */
export const tokens: TokenChain[] = [];

export const allUsdtChains: Record<string, TokenChain> = {};

export const isStableToken = (_token: TokenChain) => true;

/** Empty placeholder — wallet UI no longer groups by fixed stablecoins */
export const stablecoinWithChains: Record<string, Record<string, unknown>> = {
  evm: {},
  sol: {},
  near: {},
  tron: {},
  aptos: {},
  ton: {},
  sui: {},
};
