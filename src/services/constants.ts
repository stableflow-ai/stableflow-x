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

/** Router logos for Rhea allQuotes entries. Unknown routers use fallback. */
export const RouterLogoMap: Record<string, string> = {
  rango: getStableflowRouteLogo("logo-rango.svg"),
  nearintents: getStableflowRouteLogo("logo-near-intents.svg"),
  "near-intents": getStableflowRouteLogo("logo-near-intents.svg"),
};

export const RouterLogoSimpleMap: Record<string, string> = {
  rango: getStableflowRouteLogo("logo-rango-simple.svg"),
  nearintents: getStableflowRouteLogo("logo-near-intents-simple.svg"),
  "near-intents": getStableflowRouteLogo("logo-near-intents-simple.svg"),
};

export const getRouterLogo = (router?: string, simple = false): string => {
  const key = (router || "").toLowerCase();
  const map = simple ? RouterLogoSimpleMap : RouterLogoMap;
  return map[key] || (simple ? ServiceLogoSimpleMap[Service.Rhea] : ServiceLogoMap[Service.Rhea]);
};

export const getRouterDisplayName = (router?: string, routerName?: string): string => {
  if (routerName) return routerName;
  if (!router) return "";
  const known: Record<string, string> = {
    rango: "Rango",
    nearintents: "Near Intents",
    "near-intents": "Near Intents",
  };
  return known[router.toLowerCase()] || router;
};
