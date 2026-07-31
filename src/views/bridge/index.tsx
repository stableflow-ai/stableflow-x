import { Suspense, lazy, useEffect, useState } from "react";
import useBridge from "./hooks/use-bridge";
import { usePendingHistory } from "@/views/history/hooks/use-pending-history";
import { useTrack } from "@/hooks/use-track";
import { useMaintenanceStore } from "@/stores/use-maintenance";
import clsx from "clsx";

// Dynamic import components
const Networks = lazy(() => import("./components/networks"));
const BridgeButton = lazy(() => import("./components/button"));
const HistoryDrawer = lazy(() => import("../history/drawer"));
const PendingTransfer = lazy(() => import("./components/pending"));
const ZcashDepositModal = lazy(() => import("./components/zcash-deposit-modal"));
const TransferStablecoinsLink = lazy(() => import("@/layouts/transfer-stablecoins-link"));

// Loading component
const LoadingSpinner = () => null;

export default function Bridge() {
  // Single auto-poller for pending badge; useBridge/ZcashDepositModal use autoPoll: false
  usePendingHistory();
  const { onTransfer, addressValidation, errorChain, onRefreshQuote } = useBridge();
  const { addOpen } = useTrack();
  const bannerVisible = useMaintenanceStore((s) => s.getBannerVisible());
  const [isRoutes, setIsRoutes] = useState(false);

  useEffect(() => {
    addOpen();
  }, []);

  return (
    <div
      className={clsx(
        "relative w-full min-h-dvh md:pt-[20dvh] pb-[140px] md:pb-25 flex flex-col items-center overflow-x-hidden",
        bannerVisible ? "pt-[20dvh]" : "pt-[10dvh]",
      )}
    >
      <div className="w-full flex items-stretch gap-[10px] justify-center mt-[20px] md:min-h-[490px]">
        <div className="md:w-150 w-full mx-auto shrink-0 relative">
          <Suspense fallback={<LoadingSpinner />}>
            <PendingTransfer className="block" />
          </Suspense>
          <Suspense fallback={<LoadingSpinner />}>
            <Networks
              addressValidation={addressValidation}
              onRefreshQuote={onRefreshQuote}
              isRoutes={isRoutes}
              onToggleRoutes={() => setIsRoutes((prev) => !prev)}
            />
          </Suspense>
          <div className="px-[10px] md:px-0 w-full">
            <Suspense fallback={<LoadingSpinner />}>
              <BridgeButton
                onClick={onTransfer}
                errorChain={errorChain}
              />
            </Suspense>
          </div>
        </div>
      </div>
      <Suspense fallback={null}>
        <TransferStablecoinsLink isRoutes={isRoutes} />
      </Suspense>
      <Suspense fallback={null}>
        <HistoryDrawer />
      </Suspense>
      <Suspense fallback={null}>
        <ZcashDepositModal />
      </Suspense>
    </div>
  );
}
