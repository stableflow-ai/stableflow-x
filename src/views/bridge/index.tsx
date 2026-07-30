import { Suspense, lazy, useEffect } from "react";
import useBridge from "./hooks/use-bridge";
import { useTrack } from "@/hooks/use-track";
import { useMaintenanceStore } from "@/stores/use-maintenance";
import clsx from "clsx";

// Dynamic import components
const Networks = lazy(() => import("./components/networks"));
const BridgeButton = lazy(() => import("./components/button"));
const HistoryDrawer = lazy(() => import("../history/drawer"));
const PendingTransfer = lazy(() => import("./components/pending"));
const ZcashDepositModal = lazy(() => import("./components/zcash-deposit-modal"));

// Loading component
const LoadingSpinner = () => null;

export default function Bridge() {
  const { onTransfer, addressValidation, errorChain, onRefreshQuote } = useBridge();
  const { addOpen } = useTrack();
  const bannerVisible = useMaintenanceStore((s) => s.getBannerVisible());

  useEffect(() => {
    addOpen();
  }, []);

  return (
    <div
      className={clsx(
        "relative w-full min-h-dvh md:pt-[20dvh] pb-25 flex flex-col items-center overflow-y-auto overflow-x-hidden",
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
        <HistoryDrawer />
      </Suspense>
      <Suspense fallback={null}>
        <ZcashDepositModal />
      </Suspense>
    </div>
  );
}
