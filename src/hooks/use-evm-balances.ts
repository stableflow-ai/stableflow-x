import useWalletsStore from "@/stores/use-wallets";
import { useEffect, useRef } from "react";
import axios from "axios";
import {
  buildEvmBalancesTokens,
  collectEvmNativeTokens,
  isValidEvmContractAddress,
  type EvmBalancesToken,
} from "@/config/tokens";
import Big from "big.js";
import useBalancesStore from "@/stores/use-balances";
import { useDebounceFn } from "ahooks";
import { DB3_API_URL } from "@/config/api";
import { numberRemoveEndZero } from "@/utils/format/number";
import { csl } from "@/utils/log";
import useWalletStore from "@/stores/use-wallet";
import { getCachedRheaTokens, fetchRheaTokens } from "@/services/rhea/tokens";
import chains from "@/config/chains";
import { ethers } from "ethers";
import erc20Abi from "@/config/abi/erc20";
import { evmRpcFallbackProvider } from "@/utils/evm-rpc-providers";
import type { TokenChain } from "@/config/chains";

type ApiTokenBalance = { address: string; balance: string };

function applyApiBalances(
  data: Record<string, ApiTokenBalance[]>,
  evmBalancesTokens: EvmBalancesToken[],
  rheaTokens: TokenChain[],
  target: Record<string, any>
) {
  let totalUsd = Number(target.totalUsd || 0);

  Object.entries(data || {}).forEach(([chainId, items]) => {
    if (!Array.isArray(items)) return;
    const currentTokenChain = evmBalancesTokens.find(
      (token) => Number(token.chain_id) === Number(chainId)
    );
    if (!target[chainId]) target[chainId] = {};

    items.forEach((sl) => {
      if (!sl?.address) return;
      const currentTokenIndex = currentTokenChain?.tokens
        ?.map((address) => address.toLowerCase())
        ?.indexOf?.(sl.address.toLowerCase());

      const tokenMeta = rheaTokens.find(
        (t) =>
          String(t.chainId) === String(chainId) &&
          t.contractAddress?.toLowerCase() === sl.address.toLowerCase()
      );

      let decimals = tokenMeta?.decimals ?? 6;
      if (
        currentTokenChain &&
        typeof currentTokenIndex === "number" &&
        currentTokenIndex > -1
      ) {
        decimals = currentTokenChain.decimals[currentTokenIndex];
      }
      const amount = numberRemoveEndZero(
        Big(sl.balance || 0)
          .div(10 ** decimals)
          .toFixed(decimals)
      );
      target[chainId][sl.address] = amount;
      target[chainId][sl.address.toLowerCase()] = amount;

      const price = Number(tokenMeta?.price || 0);
      if (price > 0) {
        try {
          totalUsd += Number(Big(amount || 0).times(price));
        } catch {
          // ignore
        }
      }
    });
  });

  target.totalUsd = totalUsd;
}

function hasPositiveBalances(bag: Record<string, any> | undefined): boolean {
  if (!bag) return false;
  for (const [key, value] of Object.entries(bag)) {
    if (key === "totalUsd") continue;
    if (!value || typeof value !== "object") continue;
    for (const amount of Object.values(value as Record<string, unknown>)) {
      try {
        if (Big(String(amount || 0)).gt(0)) return true;
      } catch {
        // ignore
      }
    }
  }
  return false;
}

async function fetchBalancesViaRpc(
  requestAccount: string,
  chainIds: number[],
  evmBalancesTokens: EvmBalancesToken[],
  isRequestStale: () => boolean
): Promise<Record<string, ApiTokenBalance[]>> {
  const result: Record<string, ApiTokenBalance[]> = {};
  const promises: Array<{
    chainId: number;
    promise: Promise<ApiTokenBalance>;
  }> = [];

  for (const token of evmBalancesTokens) {
    if (!chainIds.includes(token.chain_id)) continue;
    const currentChain = Object.values(chains).find(
      (chain) => chain.chainId === token.chain_id
    );
    if (!currentChain) continue;

    const provider = evmRpcFallbackProvider(currentChain as unknown as TokenChain);
    for (const address of token.tokens) {
      if (!isValidEvmContractAddress(address)) continue;
      promises.push({
        chainId: token.chain_id,
        promise: (async () => {
          try {
            const contract = new ethers.Contract(address, erc20Abi, provider);
            const balance = await contract.balanceOf(requestAccount);
            return { address, balance: balance.toString() };
          } catch {
            return { address, balance: "0" };
          }
        })(),
      });
    }
  }

  const settled = await Promise.allSettled(promises.map(({ promise }) => promise));
  for (let i = 0; i < promises.length; i++) {
    if (isRequestStale()) break;
    const { chainId } = promises[i];
    const item = settled[i];
    if (item.status !== "fulfilled") continue;
    if (!result[chainId]) result[chainId] = [];
    result[chainId].push(item.value);
  }

  return result;
}

/** Fetch native gas balances via eth_getBalance; store under each token's contractAddress key. */
async function fetchNativeBalancesViaRpc(
  requestAccount: string,
  nativeTokens: TokenChain[],
  isRequestStale: () => boolean
): Promise<Record<string, ApiTokenBalance[]>> {
  const result: Record<string, ApiTokenBalance[]> = {};
  const byChain = new Map<number, TokenChain[]>();

  for (const token of nativeTokens) {
    if (token.chainId == null || !token.contractAddress) continue;
    const list = byChain.get(token.chainId) || [];
    list.push(token);
    byChain.set(token.chainId, list);
  }

  const chainEntries = Array.from(byChain.entries());
  const settled = await Promise.allSettled(
    chainEntries.map(async ([chainId, tokens]) => {
      const currentChain = Object.values(chains).find((chain) => chain.chainId === chainId);
      if (!currentChain) return { chainId, balances: [] as ApiTokenBalance[] };

      const provider = evmRpcFallbackProvider(currentChain as unknown as TokenChain);
      try {
        const balance = (await provider.getBalance(requestAccount)).toString();
        return {
          chainId,
          balances: tokens.map((t) => ({
            address: t.contractAddress,
            balance,
          })),
        };
      } catch {
        return {
          chainId,
          balances: tokens.map((t) => ({
            address: t.contractAddress,
            balance: "0",
          })),
        };
      }
    })
  );

  for (const item of settled) {
    if (isRequestStale()) break;
    if (item.status !== "fulfilled") continue;
    const { chainId, balances } = item.value;
    if (!balances.length) continue;
    if (!result[chainId]) result[chainId] = [];
    result[chainId].push(...balances);
  }

  return result;
}

export default function useEvmBalances(enabled = false) {
  const wallets = useWalletsStore();
  const balancesStore = useBalancesStore();
  const wallet = wallets.evm;
  const updateEvmBalancesTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const walletStore = useWalletStore();
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const setLoading = (loading: boolean) => {
    walletStore.set({ evmBalancesLoading: loading });
  };

  const cancel = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    requestIdRef.current += 1;
    if (updateEvmBalancesTimer.current) {
      clearInterval(updateEvmBalancesTimer.current);
      updateEvmBalancesTimer.current = null;
    }
  };

  const getBalances = async (params?: { from?: string }) => {
    csl("useEvmBalances", "pink-700", "request balances from: %o", params?.from);

    if (!wallet || !wallet.account) return;

    const requestAccount = wallet.account;
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const currentRequestId = ++requestIdRef.current;

    let tokens = getCachedRheaTokens();
    if (!tokens.length) {
      try {
        tokens = await fetchRheaTokens();
      } catch {
        csl("useEvmBalances", "yellow-600", "failed to fetch Rhea tokens");
        return;
      }
    }
    const _evmBalancesTokens: EvmBalancesToken[] = buildEvmBalancesTokens(tokens);
    const _nativeTokens = collectEvmNativeTokens(tokens);
    if (!_evmBalancesTokens.length && !_nativeTokens.length) {
      csl("useEvmBalances", "yellow-600", "no Rhea EVM tokens cached yet");
      return;
    }

    if (abortController.signal.aborted || currentRequestId !== requestIdRef.current) return;

    const isRequestStale = () => {
      if (abortController.signal.aborted || currentRequestId !== requestIdRef.current) return true;
      const currentAccount = useWalletsStore.getState().evm.account;
      return !currentAccount || currentAccount !== requestAccount;
    };

    const next: Record<string, any> = { totalUsd: 0 };
    let apiData: Record<string, ApiTokenBalance[]> = {};

    const commitBalances = () => {
      if (isRequestStale()) return;
      const prev = useBalancesStore.getState().evmBalances;
      // Keep previous holdings when a refresh yields no positive balances
      if (!hasPositiveBalances(next) && hasPositiveBalances(prev)) {
        csl("useEvmBalances", "yellow-600", "skip empty overwrite, keep previous balances");
        return;
      }
      balancesStore.set({ evmBalances: { ...next } });
    };

    try {
      setLoading(true);
      if (_evmBalancesTokens.length > 0) {
        try {
          const res = await axios.post(
            `${DB3_API_URL}/balance/tokens`,
            {
              address: requestAccount,
              tokens: _evmBalancesTokens,
            },
            { signal: abortController.signal }
          );

          if (isRequestStale()) return;
          apiData = res.data?.data || {};
          applyApiBalances(apiData, _evmBalancesTokens, tokens, next);
        } catch (error: any) {
          if (error?.name === "CanceledError" || error?.code === "ERR_CANCELED") return;
          csl("useEvmBalances", "red-500", "api failed, fallback to rpc: %o", error);
          apiData = {};
        }

        if (isRequestStale()) return;

        const missingChainIds = _evmBalancesTokens
          .map((token) =>
            Object.keys(apiData).includes(String(token.chain_id)) ? null : token.chain_id
          )
          .filter((id): id is number => id != null);

        const rpcChainIds =
          missingChainIds.length > 0
            ? missingChainIds
            : Object.keys(apiData).length === 0
              ? _evmBalancesTokens.map((t) => t.chain_id)
              : [];

        if (rpcChainIds.length > 0) {
          csl("useEvmBalances", "pink-700", "rpc fallback chainIds: %o", rpcChainIds);
          try {
            const rpcData = await fetchBalancesViaRpc(
              requestAccount,
              rpcChainIds,
              _evmBalancesTokens,
              isRequestStale
            );
            if (isRequestStale()) return;
            applyApiBalances(rpcData, _evmBalancesTokens, tokens, next);
          } catch (error) {
            csl("useEvmBalances", "red-500", "rpc fallback failed: %o", error);
          }
        }
      }

      if (_nativeTokens.length > 0 && !isRequestStale()) {
        csl("useEvmBalances", "pink-700", "native rpc for %o tokens", _nativeTokens.length);
        try {
          const nativeData = await fetchNativeBalancesViaRpc(
            requestAccount,
            _nativeTokens,
            isRequestStale
          );
          if (isRequestStale()) return;
          applyApiBalances(nativeData, _evmBalancesTokens, tokens, next);
        } catch (error) {
          csl("useEvmBalances", "red-500", "native rpc failed: %o", error);
        }
      }

      commitBalances();
    } finally {
      if (!isRequestStale()) setLoading(false);
    }
  };

  const { run: debouncedGetBalances } = useDebounceFn(getBalances, { wait: 400 });

  useEffect(() => {
    if (!enabled) {
      cancel();
      return;
    }
    if (!wallet?.account) {
      balancesStore.set({ evmBalances: {} });
      cancel();
      return;
    }

    getBalances({ from: "connect" });
    updateEvmBalancesTimer.current = setInterval(() => {
      debouncedGetBalances({ from: "interval" });
    }, 30000);

    return () => {
      cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, wallet?.account]);

  return { getBalances: debouncedGetBalances, cancel };
}
