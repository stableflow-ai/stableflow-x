import { getStableflowRouteLogo } from "@/utils/format/logo";

export const Service = {
  Rhea: "rhea",
} as const;
export type Service = (typeof Service)[keyof typeof Service];

export const ServiceBackend: Record<Service, string> = {
  [Service.Rhea]: "rhea",
};

export const getRouteStatus = (_service?: Service): { disabled: boolean } => {
  return { disabled: false };
};

export const ServiceLogoMap: Record<Service, string> = {
  [Service.Rhea]: getStableflowRouteLogo("logo-near-intents.svg"),
};

export const ServiceLogoSimpleMap: Record<Service, string> = {
  [Service.Rhea]: getStableflowRouteLogo("logo-near-intents-simple.svg"),
};

/** Router logos for Rhea allQuotes entries. Empty string = placeholder (manual fill later). */
export const RouterLogoMap: Record<string, string> = {
  rango: getStableflowRouteLogo("logo-rango.svg"),
  nearintents: getStableflowRouteLogo("logo-near-intents.svg"),
  "near-intents": getStableflowRouteLogo("logo-near-intents.svg"),
  okx: "",
  binance: "",
  bitget: "",
  paraswap: "",
  cow: "",
  jupiter: "",
  titan: "",
  dflow: "",
};

export const RouterLogoSimpleMap: Record<string, string> = {
  rango: getStableflowRouteLogo("logo-rango-simple.svg"),
  nearintents: getStableflowRouteLogo("logo-near-intents-simple.svg"),
  "near-intents": getStableflowRouteLogo("logo-near-intents-simple.svg"),
  okx: "",
  binance: "",
  bitget: "",
  paraswap: "",
  cow: "",
  jupiter: "",
  titan: "",
  dflow: "",
};

/** Returns logo URL, or empty string when unconfigured / placeholder. */
export const getRouterLogo = (router?: string, simple = false): string => {
  const key = (router || "").toLowerCase();
  if (!key) return "";
  const map = simple ? RouterLogoSimpleMap : RouterLogoMap;
  return map[key] ?? "";
};

export const getRouterDisplayName = (router?: string, routerName?: string): string => {
  if (routerName) return routerName;
  if (!router) return "";
  const known: Record<string, string> = {
    rango: "Rango",
    nearintents: "Near Intents",
    "near-intents": "Near Intents",
    okx: "OKX",
    binance: "Binance",
    bitget: "Bitget",
    paraswap: "ParaSwap",
    cow: "CoW Protocol",
    jupiter: "Jupiter",
    titan: "Titan",
    dflow: "DFlow",
  };
  return known[router.toLowerCase()] || router;
};
