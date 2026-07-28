import { useEffect, useMemo, useState } from "react";
import useWalletStore from "@/stores/use-wallet";
import useBalancesStore, { type BalancesState } from "@/stores/use-balances";
import { fetchRheaTokens, getCachedRheaTokens } from "@/services/rhea/tokens";
import type { TokenChain } from "@/config/chains";
import useIsMobile from "@/hooks/use-is-mobile";
import Drawer from "@/components/drawer";
import ChainPane from "./chain-pane";
import TokenPane from "./token-pane";
import { getTokenBalance, isSameToken, sortTokensByUsd } from "./utils";

export default function TokenSelectModal() {
  const walletStore = useWalletStore();
  const balancesStore = useBalancesStore();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [chainFilter, setChainFilter] = useState<string>("evm");
  const [tokens, setTokens] = useState<TokenChain[]>(getCachedRheaTokens());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!walletStore.showTokenSelect) return;
    setSearch("");
    setChainFilter("evm");
    const cached = getCachedRheaTokens();
    if (cached.length) {
      setTokens(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    fetchRheaTokens()
      .then((list) => setTokens(list))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [walletStore.showTokenSelect]);

  const getBalance = (token: TokenChain) => {
    const key = `${token.chainType}Balances` as keyof BalancesState;
    return getTokenBalance(token, balancesStore[key] as any);
  };

  const filteredTokens = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = tokens.filter((t) => {
      if (chainFilter === "evm") {
        if (t.chainType !== "evm") return false;
      } else if (t.rheaAlias !== chainFilter && t.blockchain !== chainFilter) {
        return false;
      }
      if (!q) return true;
      return (
        t.symbol?.toLowerCase().includes(q) ||
        t.chainName?.toLowerCase().includes(q) ||
        t.contractAddress?.toLowerCase().includes(q)
      );
    });
    return sortTokensByUsd(list, getBalance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tokens,
    search,
    chainFilter,
    balancesStore.evmBalances,
    balancesStore.solBalances,
    balancesStore.nearBalances,
    balancesStore.tronBalances,
    balancesStore.aptosBalances,
    balancesStore.suiBalances,
    balancesStore.tonBalances,
  ]);

  const onClose = () => walletStore.set({ showTokenSelect: false });

  const onSelectToken = (token: TokenChain) => {
    const field = walletStore.isTo ? "toToken" : "fromToken";
    const other = walletStore.isTo ? "fromToken" : "toToken";
    const otherToken = walletStore[other];
    const conflict = isSameToken(otherToken, token);
    walletStore.set({
      [field]: token,
      ...(conflict ? { [other]: null } : {}),
      showTokenSelect: false,
    });
  };

  const chainPane = (
    <ChainPane
      chainFilter={chainFilter}
      onSelectFilter={setChainFilter}
      tokens={tokens}
    />
  );

  const tokenPane = (
    <TokenPane
      search={search}
      onSearchChange={setSearch}
      tokens={filteredTokens}
      getBalance={getBalance}
      loading={loading}
      showClose={!isMobile}
      showTitle={!isMobile}
      onClose={onClose}
      onSelectToken={onSelectToken}
    />
  );

  if (isMobile) {
    return (
      <Drawer
        title="Select Token"
        open={walletStore.showTokenSelect}
        onClose={onClose}
        className="bg-[#EDF0F7] flex flex-col"
        titleClassName="shrink-0"
      >
        <div className="flex-1 h-0 overflow-y-auto px-[16px] pb-[20px] flex flex-col gap-[16px]">
          {chainPane}
          <div className="bg-white rounded-[12px] p-[16px] min-h-[320px] flex flex-col">
            {tokenPane}
          </div>
        </div>
      </Drawer>
    );
  }

  if (!walletStore.showTokenSelect) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 px-3">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-[649px] h-[682px] max-h-[90vh] bg-[#EDF0F7] border border-[#F2F2F2] rounded-[12px] flex overflow-hidden">
        <div className="w-[275px] shrink-0 p-[20px] overflow-y-auto">{chainPane}</div>
        <div className="flex-1 bg-white p-[20px] flex flex-col min-w-0">{tokenPane}</div>
      </div>
    </div>
  );
}
