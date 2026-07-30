import { create } from "zustand/index";

export type WalletType = "near" | "sol" | "evm" | "tron" | "aptos" | "ton" | "sui" | "btc" | "zcash";

type WalletEntry = {
  account: string | null;
  wallet: any;
  connect: () => void;
  disconnect: () => void;
  walletIcon: string | null;
  walletName: string | null;
};

interface WalletsState {
  near: WalletEntry;
  sol: WalletEntry;
  evm: WalletEntry & { chainId: number | null };
  tron: WalletEntry;
  aptos: WalletEntry;
  ton: WalletEntry;
  sui: WalletEntry;
  btc: WalletEntry;
  zcash: WalletEntry;
  set: (params: any) => void;
}

const emptyWallet = (): WalletEntry => ({
  account: null,
  wallet: null,
  connect: () => { },
  disconnect: () => { },
  walletIcon: null,
  walletName: null,
});

const useWalletsStore = create<WalletsState>((set) => ({
  near: emptyWallet(),
  sol: emptyWallet(),
  evm: {
    ...emptyWallet(),
    chainId: null,
  },
  tron: emptyWallet(),
  aptos: emptyWallet(),
  ton: emptyWallet(),
  sui: emptyWallet(),
  btc: emptyWallet(),
  zcash: emptyWallet(),
  set: (params) => set(() => ({ ...params }))
}));

export default useWalletsStore;
