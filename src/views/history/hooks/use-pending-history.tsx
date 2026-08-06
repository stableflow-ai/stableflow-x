import { BASE_API_URL } from "@/config/api";
import chains from "@/config/chains";
import { TradeProject, TradeProjectMap } from "@/config/trade";
import { useHistoryStore } from "@/stores/use-history";
import useWalletsStore from "@/stores/use-wallets";
import { useDebounceFn, useRequest } from "ahooks";
import axios from "axios";
import { useEffect, useMemo, useRef, useState } from "react";

type UsePendingHistoryOptions = {
  autoPoll?: boolean;
  history?: any;
};

export function usePendingHistory(options?: UsePendingHistoryOptions | any) {
  // Support legacy call shape: usePendingHistory(history)
  const isLegacyHistoryArg =
    options != null &&
    typeof options === "object" &&
    !("autoPoll" in options) &&
    ("getList" in options || "page" in options);
  const history = isLegacyHistoryArg ? options : options?.history;
  const autoPoll = isLegacyHistoryArg ? true : options?.autoPoll !== false;

  const wallets = useWalletsStore();
  const historyStore = useHistoryStore();

  const [list, setList] = useState<any>([]);
  const [page, setPage] = useState<any>({
    current: 1,
    size: 100,
    total: 0,
    totaPage: 0,
  });

  const accounts = useMemo(() => {
    const _accounts = Object.values(wallets ?? {}).map((wallet) => wallet.account).filter((account) => !!account);
    return _accounts.join(",");
  }, [wallets]);

  const listPollingRef = useRef<any>(null);
  const { runAsync: getList, loading } = useRequest(async (params?: any) => {
    try {
      if (listPollingRef.current) {
        clearTimeout(listPollingRef.current);
        listPollingRef.current = null;
      }

      const response = await axios({
        url: `${BASE_API_URL}/v1/trades`,
        params: {
          type: 4,
          status: "pending",
          address: params?.address ?? accounts,
          page: params?.page ?? page.current,
          page_size: page.size,
        },
        method: "GET",
        timeout: 30000,
        headers: {
          "Content-Type": "application/json"
        },
      });

      if (response.status !== 200) {
        return;
      }

      if (response.data.code !== 200) {
        return;
      }

      const servicePendingNumber: any = {};
      const servicePendingNumberWithPermit: any = {};

      const _list = response.data.data.data;
      _list.forEach((item: any) => {
        const currentFromChain = Object.values(chains).find((chain) => chain.blockchain === item.from_chain);
        const currentToChain = Object.values(chains).find((chain) => chain.blockchain === item.to_chain);

        item.source_chain = currentFromChain;
        item.destination_chain = currentToChain;

        if (item.from_chain === "tron") {
          item.tx_hash = item.tx_hash?.replace(/^0x/, "");
        }
        if (item.to_chain === "tron") {
          item.to_tx_hash = item.to_tx_hash?.replace(/^0x/, "");
        }

        if (TradeProjectMap[item.project as TradeProject]) {
          const _service = TradeProjectMap[item.project as TradeProject].service;
          if (servicePendingNumber[_service]) {
            servicePendingNumber[_service] = servicePendingNumber[_service] + 1;
          } else {
            servicePendingNumber[_service] = 1;
          }

          const setServicePendingNumberWithPermit = () => {
            if (servicePendingNumberWithPermit[_service]) {
              servicePendingNumberWithPermit[_service] = servicePendingNumberWithPermit[_service] + 1;
            } else {
              servicePendingNumberWithPermit[_service] = 1;
            }
          };
          // Legacy permit-with-nonce routes removed; Rhea pending items do not use this path.
          void setServicePendingNumberWithPermit;
        }
      });

      setList((prev: any) => {
        if (_list.length < prev.length) {
          history?.getList?.({
            address: params?.address ?? accounts,
            page: history.page.current,
          });
        }
        historyStore.updatePendingNumber(_list.length);
        historyStore.updateServicePendingNumber({ services: servicePendingNumber });
        historyStore.updateServicePendingNumberWithPermit({ services: servicePendingNumberWithPermit });
        return _list;
      });
      setPage((prev: any) => {
        return {
          ...prev,
          current: params?.page ?? page.current,
          total: response.data.data.total,
          totalPage: response.data.data.total_page,
        };
      });

      if (autoPoll && _list.length > 0) {
        listPollingRef.current = setTimeout(() => {
          getList(params);
        }, 10000);
      }
    } catch (error) {
      console.error("get pending history failed: %o", error);
    }
  }, {
    manual: true,
  });

  const { run: debouncedGetList, cancel: cancelGetList } = useDebounceFn(getList, {
    wait: 1000,
  });

  const pendingRefreshNonce = useHistoryStore((s) => s.pendingRefreshNonce);
  const lastRefreshNonceRef = useRef(pendingRefreshNonce);

  useEffect(() => {
    if (!autoPoll) {
      return () => {
        cancelGetList();
        if (listPollingRef.current) {
          clearTimeout(listPollingRef.current);
          listPollingRef.current = null;
        }
      };
    }

    if (!accounts) {
      setList([]);
      historyStore.updatePendingNumber(0);
      historyStore.updateServicePendingNumber({ isClear: true });
      historyStore.updateServicePendingNumberWithPermit({ isClear: true });
      setPage(() => {
        return {
          current: 1,
          size: 10,
          total: 0,
          totaPage: 0,
        };
      });
      return () => {
        cancelGetList();
        if (listPollingRef.current) {
          clearTimeout(listPollingRef.current);
          listPollingRef.current = null;
        }
      };
    }

    // Initial request (debounced)
    debouncedGetList({
      address: accounts,
      page: 1,
    });

    return () => {
      cancelGetList();
      if (listPollingRef.current) {
        clearTimeout(listPollingRef.current);
        listPollingRef.current = null;
      }
    };
  }, [accounts, autoPoll]);

  // Bridge autoPoll instance: refetch when transfer / card terminal requests refresh
  useEffect(() => {
    if (!autoPoll || !accounts) return;
    if (lastRefreshNonceRef.current === pendingRefreshNonce) return;
    lastRefreshNonceRef.current = pendingRefreshNonce;
    if (pendingRefreshNonce <= 0) return;
    getList({
      address: accounts,
      page: 1,
    });
  }, [pendingRefreshNonce, autoPoll, accounts]);

  return {
    list,
    page,
    loading,
    getList,
    debouncedGetList,
  };
}
