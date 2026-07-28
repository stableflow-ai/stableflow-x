import type chains from "@/config/chains";
import { Service } from "@/services/constants";

type ChainKey = keyof typeof chains;

export const ECOSYSTEM_STABLECOINS = [
  {
    symbol: "USDT",
    tokenLogo: "USDT",
    gradient: "radial-gradient(44.36% 43.69% at 50% 0%, rgba(41,252,189,0.2) 0%, rgba(255,255,255,0.2) 100%)",
  },
  {
    symbol: "USDC",
    tokenLogo: "USDC",
    gradient: "radial-gradient(44.36% 43.69% at 50% 0%, rgba(106,177,255,0.2) 0%, rgba(255,255,255,0.2) 100%)",
  },
] as const;

export const ECOSYSTEM_NETWORK_ORDER: ChainKey[] = [
  "eth",
  "arb",
  "bsc",
  "op",
  "base",
  "pol",
  "xlayer",
  "bera",
  "plasma",
  "monad",
  "sol",
  "near",
  "tron",
  "aptos",
  "sui",
  "ton",
];

export const ECOSYSTEM_RAILS: Service[] = [Service.Rhea];
