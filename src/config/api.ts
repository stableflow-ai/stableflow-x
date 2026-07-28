export const BASE_API_URL = import.meta.env.VITE_BASE_API_URL || "https://api.stableflow.ai";
export const IS_PRODUCTION = import.meta.env.VITE_BASE_API_URL === "https://api.stableflow.ai";
export const DB3_API_URL = "https://api.db3.app/api";

export const RHEA_API_URL = "https://api.rhea.finance";
export const RHEA_CCD_API_ACCESS_TOKEN = import.meta.env.VITE_RHEA_CCD_API_ACCESS_TOKEN || "";

export const PROXY_RPC_DOMAIN = import.meta.env.VITE_PRC_PROXY_HOST || "rpcs.stableflow.ai";
