import {
  Service,
  ServiceLogoMap,
  ServiceLogoSimpleMap,
  getRouterLogo,
  getRouterDisplayName,
} from "@/services/constants";

export const TradeStatus = {
  Pending: 0,
  Success: 1,
  Failed: 2,
  Confirming: 3,
  Continue: 4,
  LayerzeroSubmitted: 5,
  Processing: 6,
} as const;

export type TradeStatus = (typeof TradeStatus)[keyof typeof TradeStatus];

export const TradeStatusMap: Record<TradeStatus, { value: TradeStatus; name: string }> = {
  [TradeStatus.Pending]: { value: TradeStatus.Pending, name: "Pending" },
  [TradeStatus.Success]: { value: TradeStatus.Success, name: "Success" },
  [TradeStatus.Failed]: { value: TradeStatus.Failed, name: "Failed" },
  [TradeStatus.Confirming]: { value: TradeStatus.Confirming, name: "Confirming" },
  [TradeStatus.Continue]: { value: TradeStatus.Continue, name: "Waiting" },
  [TradeStatus.LayerzeroSubmitted]: { value: TradeStatus.LayerzeroSubmitted, name: "LayerzeroSubmitted" },
  [TradeStatus.Processing]: { value: TradeStatus.Processing, name: "Processing" },
};

/** Legacy project ids kept for historical trade display only */
export const TradeProject = {
  OneClick: 0,
  Usdt0: 1,
  CCTP: 2,
  Usdt0OneClick: 3,
  OneClickUsdt0: 4,
  Native: 5,
  FraxZero: 6,
  FraxZeroOneClick: 7,
  OneClickFraxZero: 8,
  CCTPOneClick: 9,
  OneClickCCTP: 10,
  Rhea: 11,
} as const;

export type TradeProject = (typeof TradeProject)[keyof typeof TradeProject];

export const TradeProjectMap: Record<
  TradeProject,
  { logo: string; logoSimple: string; name: string; service: Service }
> = {
  [TradeProject.Rhea]: {
    logo: ServiceLogoMap[Service.Rhea],
    logoSimple: ServiceLogoSimpleMap[Service.Rhea],
    name: "Rhea",
    service: Service.Rhea,
  },
  // Legacy entries reuse Rhea logo as placeholder for old history rows
  [TradeProject.OneClick]: {
    logo: getRouterLogo("nearintents"),
    logoSimple: getRouterLogo("nearintents", true),
    name: "OneClick",
    service: Service.Rhea,
  },
  [TradeProject.Usdt0]: {
    logo: ServiceLogoMap[Service.Rhea],
    logoSimple: ServiceLogoSimpleMap[Service.Rhea],
    name: "USDT0",
    service: Service.Rhea,
  },
  [TradeProject.CCTP]: {
    logo: ServiceLogoMap[Service.Rhea],
    logoSimple: ServiceLogoSimpleMap[Service.Rhea],
    name: "CCTP",
    service: Service.Rhea,
  },
  [TradeProject.CCTPOneClick]: {
    logo: ServiceLogoMap[Service.Rhea],
    logoSimple: ServiceLogoSimpleMap[Service.Rhea],
    name: "CCTPOneClick",
    service: Service.Rhea,
  },
  [TradeProject.OneClickCCTP]: {
    logo: ServiceLogoMap[Service.Rhea],
    logoSimple: ServiceLogoSimpleMap[Service.Rhea],
    name: "OneClickCCTP",
    service: Service.Rhea,
  },
  [TradeProject.FraxZero]: {
    logo: ServiceLogoMap[Service.Rhea],
    logoSimple: ServiceLogoSimpleMap[Service.Rhea],
    name: "FraxZero",
    service: Service.Rhea,
  },
  [TradeProject.FraxZeroOneClick]: {
    logo: ServiceLogoMap[Service.Rhea],
    logoSimple: ServiceLogoSimpleMap[Service.Rhea],
    name: "FraxZeroOneClick",
    service: Service.Rhea,
  },
  [TradeProject.OneClickFraxZero]: {
    logo: ServiceLogoMap[Service.Rhea],
    logoSimple: ServiceLogoSimpleMap[Service.Rhea],
    name: "OneClickFraxZero",
    service: Service.Rhea,
  },
  [TradeProject.Usdt0OneClick]: {
    logo: ServiceLogoMap[Service.Rhea],
    logoSimple: ServiceLogoSimpleMap[Service.Rhea],
    name: "USDT0OneClick",
    service: Service.Rhea,
  },
  [TradeProject.OneClickUsdt0]: {
    logo: ServiceLogoMap[Service.Rhea],
    logoSimple: ServiceLogoSimpleMap[Service.Rhea],
    name: "OneClickUSDT0",
    service: Service.Rhea,
  },
  [TradeProject.Native]: {
    logo: ServiceLogoMap[Service.Rhea],
    logoSimple: ServiceLogoSimpleMap[Service.Rhea],
    name: "Native",
    service: Service.Rhea,
  },
};

export { getRouterLogo, getRouterDisplayName };
