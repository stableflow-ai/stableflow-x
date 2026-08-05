export const BASE_API_URL = import.meta.env.VITE_BASE_API_URL || "https://api.stableflow.ai";
export const IS_PRODUCTION = import.meta.env.MODE === "production";
export const DB3_API_URL = "https://api.db3.app/api";

export const RHEA_API_URL = IS_PRODUCTION ? "https://api.rhea.finance" : "https://mainnet-indexer.ref-finance.com";
export const RHEA_CCD_API_ACCESS_TOKEN = IS_PRODUCTION ? import.meta.env.VITE_RHEA_CCD_API_ACCESS_TOKEN : import.meta.env.VITE_RHEA_CCD_API_ACCESS_TOKEN_TEST;

export const PROXY_RPC_DOMAIN = import.meta.env.VITE_PRC_PROXY_HOST || "rpcs.stableflow.ai";
