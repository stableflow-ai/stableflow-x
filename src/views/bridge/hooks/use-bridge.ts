import { useState, useEffect, useMemo, useRef } from "react";
import { rheaService } from "@/services";
import type { RheaNormalizedQuote } from "@/services";
import {
  validateAddress,
  type AddressValidationResult,
} from "@/utils/address-validation";
import useWalletsStore, { type WalletType } from "@/stores/use-wallets";
import Big from "big.js";
import { useDebounceFn } from "ahooks";
import { useHistoryStore } from "@/stores/use-history";
import { useConfigStore } from "@/stores/use-config";
import useWalletStore from "@/stores/use-wallet";
import useBridgeStore from "@/stores/use-bridge";
import useTokenBalance from "@/hooks/use-token-balance";
import useToast from "@/hooks/use-toast";
import { BridgeDefaultWallets, PRICE_IMPACT_THRESHOLD } from "@/config";
import { formatNumber } from "@/utils/format/number";
import { Service, ServiceBackend } from "@/services/constants";
import { useAccount, useSwitchChain } from "wagmi";
import { usePendingHistory } from "@/views/history/hooks/use-pending-history";
import { csl } from "@/utils/log";
import { addTradeReport } from "@/stores/use-trade-report";
import { formatBridgeError, formatBridgeRpcErrorMessage, isReQuoteError, isUserRejectedError, sortQuoteData } from "../utils";
import { useTrack } from "@/hooks/use-track";
import { TradeProject } from "@/config/trade";
import { tokenAddressForQuote, tokenHttpChainId, fetchRheaTokens } from "@/services/rhea/tokens";
import { executeRheaTx } from "@/libs/wallets/execute-rhea-tx";
import { rheaReport, pollRheaOrderStatus } from "@/services/rhea/status";
import { ZCASH_MANUAL_WALLET_NAME } from "@/libs/wallets/zcash/wallet";

const TRANSFER_MIN_AMOUNT = import.meta.env.VITE_TRANSFER_MIN_AMOUNT || 0.0001;

const toBaseUnits = (amount: string, decimals: number) => {
  try {
    return Big(amount || 0).times(Big(10).pow(decimals)).toFixed(0, 0);
  } catch {
    return "0";
  }
};

const fromBaseUnits = (amount: string, decimals: number) => {
  try {
    return Big(amount || 0).div(Big(10).pow(decimals)).toFixed();
  } catch {
    return "0";
  }
};

export default function useBridge(_props?: any) {
  const { debouncedGetList: getPendingList } = usePendingHistory();
  const wallets = useWalletsStore();
  const historyStore = useHistoryStore();
  const configStore = useConfigStore();
  const walletStore = useWalletStore();
  const bridgeStore = useBridgeStore();
  const { getBalance } = useTokenBalance(walletStore.fromToken, false);
  const evmAccount = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [errorChain, setErrorChain] = useState<number>(0);
  const toast = useToast();
  const { addQuote: addQuoteTrack, addTransfer: addTransferTrack } = useTrack();
  const requestIdRef = useRef(0);
  const tokensLoadedRef = useRef(false);

  const [fromWalletAddress, toWalletAddress] = useMemo(() => {
    const _fromChainType: WalletType = walletStore.fromToken?.chainType;
    const _toChainType: WalletType = walletStore.toToken?.chainType;
    if (!_fromChainType || !_toChainType) return [];
    const _fromWallet = wallets[_fromChainType];
    const _toWallet = wallets[_toChainType];
    const _fromWalletAddress =
      _fromWallet?.account || BridgeDefaultWallets[_fromChainType];
    const _toWalletAddress =
      bridgeStore.recipientAddress || _toWallet?.account || BridgeDefaultWallets[_toChainType];
    return [_fromWalletAddress, _toWalletAddress];
  }, [wallets, walletStore, bridgeStore.recipientAddress]);

  const [addressValidation, setAddressValidation] =
    useState<AddressValidationResult>({ isValid: false });
  const [amountError, setAmountError] = useState<string>("");

  useEffect(() => {
    if (tokensLoadedRef.current) return;
    tokensLoadedRef.current = true;
    fetchRheaTokens().catch((err) => {
      csl("useBridge", "red-500", "failed to load Rhea tokens: %o", err);
      tokensLoadedRef.current = false;
    });
  }, []);

  const selectedQuote: RheaNormalizedQuote | null = useMemo(() => {
    const key = bridgeStore.quoteDataService;
    if (!key) return null;
    const entry = bridgeStore.quoteDataMap.get(key);
    return entry?.normalized || null;
  }, [bridgeStore.quoteDataService, bridgeStore.quoteDataMap]);

  const quoteData = useMemo(() => {
    const key = bridgeStore.quoteDataService;
    if (!key) return null;
    return bridgeStore.quoteDataMap.get(key) || null;
  }, [bridgeStore.quoteDataService, bridgeStore.quoteDataMap]);

  const outputAmount = useMemo(() => {
    if (!selectedQuote || !walletStore.toToken) return "";
    return fromBaseUnits(selectedQuote.estimatedOut, walletStore.toToken.decimals);
  }, [selectedQuote, walletStore.toToken]);

  const priceImpact = useMemo(() => {
    if (!selectedQuote?.priceImpactUsdPercent) return 0;
    return Math.abs(Number(selectedQuote.priceImpactUsdPercent));
  }, [selectedQuote]);

  const runQuote = async (
    requestId: number,
    options?: { preferLastSelected?: boolean }
  ) => {
    const fromToken = walletStore.fromToken;
    const toToken = walletStore.toToken;
    if (!fromToken || !toToken) return;
    if (!bridgeStore.amount || Big(bridgeStore.amount).lte(0)) {
      bridgeStore.clearQuoteData();
      return;
    }

    const amountWei = toBaseUnits(bridgeStore.amount, fromToken.decimals);
    if (Big(amountWei).lte(0)) return;

    const quoteKey = Service.Rhea;
    bridgeStore.setQuoting(quoteKey, requestId, true);

    try {
      const sender = fromWalletAddress || "";
      const recipient = bridgeStore.recipientAddress || toWalletAddress || "";
      const slippageBps = Math.round(Number(configStore.slippage || 0.5) * 100);

      addQuoteTrack({
        quoteData: {
          quoteParam: {
            fromToken,
            toToken,
            amount: bridgeStore.amount,
            amountWei,
          },
          outputAmount: "0",
          router: Service.Rhea,
        },
        service: Service.Rhea,
      });

      const result = await rheaService.quote({
        fromChain: tokenHttpChainId(fromToken),
        toChain: tokenHttpChainId(toToken),
        tokenIn: tokenAddressForQuote(fromToken),
        tokenOut: tokenAddressForQuote(toToken),
        amountIn: amountWei,
        slippage: slippageBps,
        sender,
        recipient,
        fromToken,
        toToken,
      });

      if (requestId !== requestIdRef.current) return;

      bridgeStore.clearQuoteData();
      const nextMapEntries: Array<[string, any]> = [];

      for (const q of result.quotes) {
        const humanOut = fromBaseUnits(q.estimatedOut, toToken.decimals);
        nextMapEntries.push([
          q.key,
          {
            type: Service.Rhea,
            router: q.router,
            routerName: q.routerName,
            isBest: q.isBest,
            outputAmount: humanOut,
            estimatedOut: q.estimatedOut,
            minAmountOut: q.minAmountOut,
            timeEstimate: q.timeEstimate,
            fee: q.fee,
            totalFeeUsd: q.totalFeeUsd,
            priceImpactUsd: q.priceImpactUsd,
            priceImpactUsdPercent: q.priceImpactUsdPercent,
            normalized: q,
            quoteParam: {
              fromToken,
              toToken,
              amount: bridgeStore.amount,
              amountWei,
              sender,
              recipient,
            },
          },
        ]);
      }

      for (const [key, value] of nextMapEntries) {
        bridgeStore.setQuoteData(key, value);
      }

      const sorted = sortQuoteData(new Map(nextMapEntries));
      const preferredRouter = options?.preferLastSelected
        ? useBridgeStore.getState().lastSelectedRouter
        : "";
      const preferredKey = preferredRouter
        ? nextMapEntries.find(([, v]) => v.router === preferredRouter)?.[0]
        : undefined;
      const autoKey =
        preferredKey ||
        result.bestKey ||
        sorted[0]?.[0] ||
        "";

      if (autoKey) {
        bridgeStore.set({ quoteDataService: autoKey, shouldAutoSelect: false });
      }
    } catch (error: any) {
      if (requestId !== requestIdRef.current) return;
      csl("useBridge", "red-500", "quote failed: %o", error);
      bridgeStore.clearQuoteData();
      bridgeStore.set({
        errorTips: formatBridgeRpcErrorMessage(error?.message || "Quote failed"),
      });
    } finally {
      if (requestId === requestIdRef.current) {
        bridgeStore.setQuoting(quoteKey, requestId, false);
      }
    }
  };

  const triggerQuote = (options?: { preferLastSelected?: boolean }) => {
    requestIdRef.current += 1;
    void runQuote(requestIdRef.current, options);
  };

  const { run: debouncedQuote } = useDebounceFn(
    () => {
      triggerQuote();
    },
    { wait: 1000 }
  );

  const onRefreshQuote = () => {
    if (bridgeStore.getQuoting()) return;
    bridgeStore.set({ errorTips: "" });
    bridgeStore.clearQuoteData();
    triggerQuote({ preferLastSelected: true });
  };

  useEffect(() => {
    bridgeStore.set({ errorTips: "" });
    bridgeStore.clearQuoteData();
    debouncedQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bridgeStore.amount,
    walletStore.fromToken?.contractAddress,
    walletStore.fromToken?.blockchain,
    walletStore.toToken?.contractAddress,
    walletStore.toToken?.blockchain,
    fromWalletAddress,
    toWalletAddress,
    bridgeStore.recipientAddress,
    configStore.slippage,
  ]);

  useEffect(() => {
    bridgeStore.set({ lastSelectedRouter: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    walletStore.fromToken?.contractAddress,
    walletStore.fromToken?.blockchain,
    walletStore.toToken?.contractAddress,
    walletStore.toToken?.blockchain,
  ]);

  useEffect(() => {
    if (!walletStore.toToken) return;
    const result = validateAddress(
      bridgeStore.recipientAddress || toWalletAddress || "",
      walletStore.toToken.chainType
    );
    setAddressValidation(result);
  }, [bridgeStore.recipientAddress, toWalletAddress, walletStore.toToken]);

  useEffect(() => {
    if (!bridgeStore.amount || !walletStore.fromToken) {
      setAmountError("");
      return;
    }
    try {
      if (Big(bridgeStore.amount).lt(TRANSFER_MIN_AMOUNT)) {
        setAmountError(`Minimum amount is ${TRANSFER_MIN_AMOUNT}`);
        return;
      }
      setAmountError("");
    } catch {
      setAmountError("Invalid amount");
    }
  }, [bridgeStore.amount, walletStore.fromToken]);

  const getWalletForChain = (chainType: WalletType) => {
    return wallets[chainType];
  };

  const onTransfer = async () => {
    const fromToken = walletStore.fromToken;
    const toToken = walletStore.toToken;
    if (!fromToken || !toToken || !selectedQuote) {
      toast.fail({ title: "No route selected" });
      return;
    }

    const fromChainType: WalletType = fromToken.chainType;
    const walletEntry = getWalletForChain(fromChainType);
    if (!walletEntry?.account || !walletEntry?.wallet) {
      toast.fail({ title: "Connect wallet first" });
      return;
    }

    if (fromChainType === "evm" && fromToken.chainId && evmAccount.chainId !== fromToken.chainId) {
      try {
        await switchChainAsync({ chainId: fromToken.chainId });
      } catch {
        setErrorChain(fromToken.chainId);
        toast.fail({ title: "Please switch network" });
        return;
      }
    }

    if (priceImpact > PRICE_IMPACT_THRESHOLD * 100 && !bridgeStore.acceptPriceImpact) {
      toast.fail({ title: "Please accept price impact" });
      return;
    }

    bridgeStore.set({ transferring: true, errorTips: "", depositInfo: null });

    const sender = walletEntry.account;
    const recipient = bridgeStore.recipientAddress || toWalletAddress || "";
    const amountWei = toBaseUnits(bridgeStore.amount, fromToken.decimals);

    const reportBase = {
      project: TradeProject.Rhea,
      route: ServiceBackend[Service.Rhea],
      sub_route: selectedQuote.router || "",
      address: sender,
      amount: bridgeStore.amount,
      out_amount: outputAmount,
      deposit_address: "",
      receive_address: recipient,
      from_chain: fromToken.blockchain,
      symbol: fromToken.symbol,
      to_chain: toToken.blockchain,
      to_symbol: toToken.symbol,
      tx_hash: "",
    };

    try {
      const swap = await rheaService.swap(
        {
          fromChain: tokenHttpChainId(fromToken),
          toChain: tokenHttpChainId(toToken),
          tokenIn: tokenAddressForQuote(fromToken),
          tokenOut: tokenAddressForQuote(toToken),
          amountIn: amountWei,
          slippage: Math.round(Number(configStore.slippage || 0.5) * 100),
          sender,
          recipient,
        },
        selectedQuote
      );

      // Mobile Zcash manual: show QR deposit even when swap.tx is present
      const isZcashManual =
        fromToken.chainType === "zcash" &&
        walletEntry?.walletName === ZCASH_MANUAL_WALLET_NAME;

      if (isZcashManual && swap.deposit?.depositAddress) {
        bridgeStore.set({
          depositInfo: {
            ...swap.deposit,
            manual: true,
            amount: amountWei,
            decimals: fromToken.decimals,
            symbol: fromToken.symbol,
            sender,
            recipient,
            router: swap.router || selectedQuote.router,
            orderId: swap.deposit.orderId || swap.orderId,
            estimatedOut: swap.estimatedOut || selectedQuote.estimatedOut,
            minAmountOut: swap.minAmountOut || selectedQuote.minAmountOut,
            fromTokenAddress: tokenAddressForQuote(fromToken),
            toTokenAddress: tokenAddressForQuote(toToken),
            fromChain: tokenHttpChainId(fromToken),
            toChain: tokenHttpChainId(toToken),
            amountDisplay: bridgeStore.amount,
            outputAmount,
            reportBase,
            selectedQuote,
          },
          transferring: false,
        });
        return;
      }

      // Deposit-address flow: transfer token to deposit address
      if (swap.deposit?.depositAddress && !swap.tx) {
        bridgeStore.set({ depositInfo: swap.deposit });
        const hash = await walletEntry.wallet.transfer({
          token: fromToken,
          amount: amountWei,
          recipient: swap.deposit.depositAddress,
          memo: swap.deposit.depositMemo || "",
        });

        const reportData = {
          ...reportBase,
          deposit_address: swap.deposit.depositAddress,
          tx_hash: hash,
          status: 0,
        };
        addTradeReport(reportData);
        getPendingList();
        addTransferTrack({
          type: "transfer_button",
          service: Service.Rhea,
          quoteData: selectedQuote,
          txHash: hash,
        });

        try {
          await rheaReport({
            sender,
            recipient,
            from_hash: hash,
            from_token: tokenAddressForQuote(fromToken),
            to_token: tokenAddressForQuote(toToken),
            from_chain: tokenHttpChainId(fromToken),
            to_chain: tokenHttpChainId(toToken),
            amount_in: amountWei,
            router: swap.router || selectedQuote.router,
            estimated_out: swap.estimatedOut || selectedQuote.estimatedOut,
            min_amount_out: swap.minAmountOut || selectedQuote.minAmountOut,
            order_id: swap.deposit.orderId || swap.orderId,
          });
          const orderId = swap.deposit.orderId || swap.orderId;
          const router = swap.router || selectedQuote.router;
          if (orderId && router) {
            void pollRheaOrderStatus({ orderId, router });
          }
        } catch (reportErr) {
          csl("useBridge", "yellow-600", "rhea report failed: %o", reportErr);
        }

        toast.success({ title: "Transfer submitted" });
        bridgeStore.set({ transferring: false, amount: "" });
        bridgeStore.clearQuoteData();
        getBalance();
        return;
      }

      const execResult = await rheaService.execute(swap, {
        executeTx: async ({ chainType, fromChain, tx }) => {
          return executeRheaTx({
            chainType,
            fromChain,
            tx,
            wallet: walletEntry.wallet,
            account: sender,
            fromToken,
            switchChainAsync,
          });
        },
        signRequest: walletEntry.wallet?.signRheaRequest
          ? (req) => walletEntry.wallet.signRheaRequest(req)
          : undefined,
      });

      const txHash = execResult.txHash || "";
      const reportData = {
        ...reportBase,
        tx_hash: txHash,
        status: 0,
      };
      addTradeReport(reportData);
      getPendingList();
      addTransferTrack({
        type: "transfer_button",
        service: Service.Rhea,
        quoteData: selectedQuote,
        txHash,
      });

      if (txHash || execResult.orderId) {
        try {
          await rheaReport({
            sender,
            recipient,
            from_hash: txHash || String(execResult.orderId),
            from_token: tokenAddressForQuote(fromToken),
            to_token: tokenAddressForQuote(toToken),
            from_chain: tokenHttpChainId(fromToken),
            to_chain: tokenHttpChainId(toToken),
            amount_in: amountWei,
            router: swap.router || selectedQuote.router,
            estimated_out: swap.estimatedOut || selectedQuote.estimatedOut,
            min_amount_out: swap.minAmountOut || selectedQuote.minAmountOut,
            order_id: execResult.orderId || swap.orderId || swap.deposit?.orderId,
          });
          const orderId = execResult.orderId || swap.orderId || swap.deposit?.orderId;
          const router = swap.statusRouter || swap.router || selectedQuote.router;
          if (orderId && router) {
            void pollRheaOrderStatus({ orderId, router });
          }
        } catch (reportErr) {
          csl("useBridge", "yellow-600", "rhea report failed: %o", reportErr);
        }
      }

      toast.success({ title: "Transfer submitted" });
      bridgeStore.set({ transferring: false, amount: "" });
      bridgeStore.clearQuoteData();
      getBalance();
    } catch (error: any) {
      csl("useBridge", "red-500", "transfer failed: %o", error);
      const message = formatBridgeError(error, "Transfer failed");
      toast.fail({ title: message });
      bridgeStore.set({ transferring: false, errorTips: "" });

      if (isReQuoteError(error) || isUserRejectedError(error)) {
        bridgeStore.clearQuoteData();
        triggerQuote({ preferLastSelected: true });
      }
    }
  };

  const onSelectQuote = (key: string) => {
    const entry = bridgeStore.quoteDataMap.get(key);
    bridgeStore.set({
      quoteDataService: key,
      ...(entry?.router ? { lastSelectedRouter: entry.router } : {}),
    });
  };

  return {
    amountError,
    addressValidation,
    fromWalletAddress,
    toWalletAddress,
    outputAmount,
    quoteData,
    selectedQuote,
    priceImpact,
    onTransfer,
    onSelectQuote,
    onRefreshQuote,
    errorChain,
    setErrorChain,
    formatNumber,
  };
}
