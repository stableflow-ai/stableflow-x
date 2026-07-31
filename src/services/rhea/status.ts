import { rheaSwapApi } from "./client";

export type RheaReportPayload = {
  sender: string;
  recipient?: string;
  from_hash: string;
  from_token: string;
  to_token: string;
  deposit_address: string;
  from_chain: string;
  to_chain: string;
  amount_in: string;
  router?: string;
  estimated_out?: string;
  min_amount_out?: string;
  swap_id?: string;
  /** CamelCase alias accepted by Rhea API (same as swap_id) */
  swapId?: string;
  is_cross_chain?: boolean;
};

export async function rheaReport(payload: RheaReportPayload) {
  return rheaSwapApi<unknown>("/report", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type RheaOrderStatus = {
  status?: string;
  [key: string]: unknown;
};

export async function rheaOrderStatus(params: {
  orderId: string;
  router: string;
  chainId?: string;
}) {
  const search = new URLSearchParams({
    orderId: params.orderId,
    router: params.router,
  });
  if (params.chainId) search.set("chainId", params.chainId);

  return rheaSwapApi<RheaOrderStatus>(`/order-status?${search.toString()}`, {
    method: "GET",
  });
}

export async function pollRheaOrderStatus(
  params: { orderId: string; router: string; chainId?: string },
  options?: { intervalMs?: number; maxAttempts?: number; isDone?: (s: RheaOrderStatus) => boolean }
) {
  const intervalMs = options?.intervalMs ?? 5000;
  const maxAttempts = options?.maxAttempts ?? 60;
  const isDone =
    options?.isDone ??
    ((s) => {
      const status = String(s.status || s.state || "").toLowerCase();
      return ["success", "completed", "failed", "error", "refunded"].includes(status);
    });

  for (let i = 0; i < maxAttempts; i++) {
    const status = await rheaOrderStatus(params);
    if (isDone(status)) return status;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return rheaOrderStatus(params);
}
