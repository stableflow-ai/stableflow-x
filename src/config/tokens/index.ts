import type { TokenChain } from "../chains";
import { getStableflowTokenLogo } from "@/utils/format/logo";
import { getCachedRheaTokens, isEvmNativeBalanceToken } from "@/services/rhea/tokens";

export interface EvmBalancesToken {
  chain_id: number;
  tokens: string[];
  decimals: number[];
  symbols: string[];
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** Valid non-native EVM ERC20 address for DB3 balance/tokens API. */
export function isValidEvmContractAddress(addr?: string): boolean {
  if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) return false;
  return addr.toLowerCase() !== ZERO_ADDRESS;
}

/** Build EVM balance query payload from current Rhea token cache (ERC20 only). */
export const buildEvmBalancesTokens = (tokenList?: TokenChain[]): EvmBalancesToken[] => {
  const tokens = (tokenList ?? getCachedRheaTokens()).filter(
    (t) =>
      t.chainType === "evm" &&
      t.chainId != null &&
      isValidEvmContractAddress(t.contractAddress)
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

/** Native gas tokens excluded from DB3 API; balances fetched via eth_getBalance. */
export function collectEvmNativeTokens(tokenList?: TokenChain[]): TokenChain[] {
  const tokens = tokenList ?? getCachedRheaTokens();
  const seen = new Set<string>();
  const result: TokenChain[] = [];
  for (const t of tokens) {
    if (!isEvmNativeBalanceToken(t)) continue;
    const key = `${t.chainId}:${t.contractAddress}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(t);
  }
  return result;
}

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
