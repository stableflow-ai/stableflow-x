import { create } from "zustand/index";
import { createJSONStorage, persist } from "zustand/middleware";

interface WalletState {
  showWallet: boolean;
  showTokenSelect: boolean;
  usdtExpand: boolean;
  evmExpand: boolean;
  selectedToken: string;
  fromToken: any;
  toToken: any;
  isTo: boolean;
  evmBalancesLoading: boolean;
  set: (params: any) => void;
}

const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      showWallet: false,
      showTokenSelect: false,
      usdtExpand: true,
      evmExpand: true,
      selectedToken: "",
      fromToken: null,
      toToken: null,
      isTo: false,
      evmBalancesLoading: false,
      set: (params) => set(() => ({ ...params })),
    }),
    {
      name: "_wallet",
      version: 0.2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        usdtExpand: state.usdtExpand,
        evmExpand: state.evmExpand,
      }),
    }
  )
);

export default useWalletStore;
