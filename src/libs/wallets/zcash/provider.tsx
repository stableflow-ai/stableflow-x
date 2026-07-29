import React, { useEffect, useMemo, useState } from "react";
import { useDebounceFn } from "ahooks";
import useWalletsStore from "@/stores/use-wallets";
import useBalancesStore from "@/stores/use-balances";
import { useWalletSelector } from "../hooks/use-wallet-selector";
import WalletSelector from "../components/wallet-selector";
import ZcashWallet from "./wallet";
import {
  connect_zcash,
  disconnect_zcash,
  get_accounts_zcash,
  getZcashWallet,
  isNoirWalletInstalled,
} from "./sdk";

const NOIR_DOWNLOAD_URL =
  "https://chromewebstore.google.com/detail/noir-wallet/mfoghjbpfanobmnoemoepenjjcmfpmdn";

const NOIR_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="8" fill="#F4B728"/>
      <text x="20" y="26" text-anchor="middle" font-size="16" font-family="Arial,sans-serif" font-weight="700" fill="#1A1A1A">N</text>
    </svg>`
  );

export default function ZcashProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Content />
    </>
  );
}

const Content = () => {
  const [mounted, setMounted] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const setWallets = useWalletsStore((state) => state.set);
  const setBalancesStore = useBalancesStore((state) => state.set);

  const installed = mounted ? isNoirWalletInstalled() : false;

  const wallets = useMemo(
    () => [
      {
        name: "Noir Wallet",
        icon: NOIR_ICON,
        url: NOIR_DOWNLOAD_URL,
        readyState: installed ? "Installed" : "NotDetected",
      },
    ],
    [installed]
  );

  const clearStore = (connectFn: () => void) => {
    setAccount(null);
    setBalancesStore({ zcashBalances: {} });
    setWallets({
      zcash: {
        account: null,
        wallet: null,
        walletIcon: null,
        walletName: null,
        connect: connectFn,
        disconnect: () => {},
      },
    });
  };

  const {
    open,
    onClose,
    onOpen,
    onConnect,
    isConnecting,
  } = useWalletSelector({
    connect: async () => {
      if (!isNoirWalletInstalled()) {
        window.open(NOIR_DOWNLOAD_URL, "_blank");
        return;
      }
      const result = await connect_zcash();
      const nextAccount = result.transparent || null;
      setAccount(nextAccount);
    },
  });

  const { run: syncWallet } = useDebounceFn(
    () => {
      if (!mounted) return;

      const zcashWallet = new ZcashWallet({ account });
      const connect = () => onOpen();

      setWallets({
        zcash: {
          account,
          wallet: zcashWallet,
          walletIcon: NOIR_ICON,
          walletName: account ? "Noir Wallet" : null,
          connect,
          disconnect: async () => {
            await disconnect_zcash();
            clearStore(connect);
          },
        },
      });
    },
    { wait: 300 }
  );

  useEffect(() => {
    syncWallet();
  }, [account, mounted]);

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;

    const silentReconnect = async () => {
      if (!isNoirWalletInstalled()) return;
      try {
        const accounts = await get_accounts_zcash();
        if (cancelled) return;
        if (accounts?.transparent) {
          setAccount(accounts.transparent);
        }
      } catch {
        // not connected
      }
    };

    silentReconnect();

    let onAccountsChanged: ((data?: any) => void) | null = null;
    try {
      const zcash = getZcashWallet();
      onAccountsChanged = (data?: any) => {
        const next =
          (Array.isArray(data) ? data[0] : data?.transparent) || null;
        if (!next) {
          clearStore(() => onOpen());
          return;
        }
        setAccount(typeof next === "string" ? next : next.transparent || null);
      };
      zcash.on("accountsChanged", onAccountsChanged);
    } catch {
      // extension not available
    }

    return () => {
      cancelled = true;
      if (onAccountsChanged) {
        try {
          getZcashWallet().removeListener("accountsChanged", onAccountsChanged);
        } catch {
          // ignore
        }
      }
    };
  }, [mounted]);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <WalletSelector
      open={open}
      onClose={onClose}
      onConnect={onConnect}
      isConnecting={isConnecting}
      wallets={wallets}
      readyState={{ key: "readyState", value: "Installed" }}
      title="Select Zcash Wallet"
    />
  );
};
