import { formatAddress } from "@/utils/format/address";
import clsx from "clsx";
import dayjs from "dayjs";
import { formatNumber } from "@/utils/format/number";
import { useMemo } from "react";
import { useHistoryStore } from "@/stores/use-history";
import { getRouterDisplayName, getRouterLogo } from "@/services/constants";
import { getStableflowIcon } from "@/utils/format/logo";
import TokenIcon from "@/components/token-icon";

export default function Pending(props: any) {
  const { className, isTitle = true, contentClassName, history } = props;

  const pendingLength = history.page.total || history.list.length;

  return (
    <div className={clsx("mt-[12px] rounded-[12px] px-[15px] md:px-[30px] pt-[20px] pb-[30px] bg-white border border-[#F2F2F2] shadow-[0_0_6px_0_rgba(0,0,0,0.10)]", className)}>
      {
        isTitle && (
          <div className="text-[16px] font-[500]">
            {pendingLength} Pending transfers
          </div>
        )
      }
      <div className={clsx("mt-[14px] grid grid-cols-1 md:grid-cols-2 gap-[18px]", contentClassName)}>
        {history.list.map((item: any, index: number) => (
          <PendingItem
            key={index}
            data={item}
          />
        ))}
      </div>
      {pendingLength === 0 && (
        <div className="text-[14px] font-[300] opacity-50 text-center">
          No Data.
        </div>
      )}
    </div>
  );
}

const PendingItem = ({ className, data }: any) => {
  const historyStore = useHistoryStore();

  const routerLogo = getRouterLogo(data.router);
  const routerName = getRouterDisplayName(data.router);

  const duration = useMemo(() => {
    const currentHistory = historyStore.history[data.deposit_address];

    if (!currentHistory) return "";

    if (currentHistory.timeEstimate <= 60) {
      return `${currentHistory.timeEstimate} sec${currentHistory.timeEstimate > 1 ? "s" : ""}`;
    }
    if (currentHistory.timeEstimate <= 3600) {
      return `${Math.floor(currentHistory.timeEstimate / 60)} min${currentHistory.timeEstimate / 60 > 1 ? "s" : ""}`;
    }
    return `${Math.floor(currentHistory.timeEstimate / 3600)} hour${currentHistory.timeEstimate / 3600 > 1 ? "s" : ""}`;
  }, [data.deposit_address, historyStore.history]);

  return (
    <div className={clsx("w-full md:w-[300px] bg-[#EDF0F7] rounded-[12px]", className)}>
      <div className="rounded-[12px] bg-white border border-[#EDF0F7] p-[12px] pt-[6px]">
        <div className="mb-2 flex justify-between items-center">
          {routerLogo ? (
            <img
              src={routerLogo}
              alt={routerName}
              title={routerName}
              className="w-[62px] h-[16px] object-center object-contain shrink-0"
            />
          ) : (
            <span
              className="max-w-[120px] truncate text-[12px] font-medium text-[#444C59]"
              title={routerName}
            >
              {routerName || "-"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-[10px]">
          <TokenIcon
            symbol={data.symbol}
            blockchain={data.from_chain}
            containerClassName="w-[28px] h-[28px] shrink-0"
            className="object-center object-contain"
          />
          <span>
            <span className="text-[16px] font-bold">
              {formatNumber(data.token_in_amount, 2, true)}
            </span>{" "}
            <span className="text-[12px] font-[500]">
              {data.symbol}
            </span>
          </span>
          <img
            src={getStableflowIcon("icon-arrow-right.svg")}
            alt=""
            className="w-[5px] h-[8px] object-center object-contain shrink-0"
          />
          <TokenIcon
            symbol={data.to_symbol}
            blockchain={data.to_chain}
            containerClassName="w-[28px] h-[28px] shrink-0"
            className="object-center object-contain"
          />
          <span>
            <span className="text-[16px] font-bold">
              {formatNumber(data.token_out_amount, 2, true)}
            </span>{" "}
            <span className="text-[12px] font-[500]">
              {data.to_symbol}
            </span>
          </span>
        </div>
        {
          !!duration ? (
            <div className="mt-[10px] text-[12px] font-[400] text-[#999]">
              Estimated ~{duration} due to settlement/queue.
            </div>
          ) : (
            <div className="mt-[10px] h-[18px]">
            </div>
          )
        }
        <div className="mt-[10px] flex items-center justify-between">
          <ChainAndAddress
            data={data.source_chain}
            address={data.address}
          />
          <img
            src={getStableflowIcon("icon-arrow-right.svg")}
            alt=""
            className="w-[5px] h-[8px] object-center object-contain shrink-0"
          />
          <ChainAndAddress
            data={data.destination_chain}
            address={data.receive_address}
          />
        </div>
      </div>
      <div className="h-[30px] text-[12px] font-[400] text-center leading-[30px] flex justify-center items-center">
        {dayjs(data.create_time).format("MMM D, YYYY h:mm A")}
      </div>
    </div>
  );
};

const ChainAndAddress = ({ className, data, address }: any) => {
  return (
    <div className={clsx("flex items-center gap-[6px]", className)}>
      <div
        className="relative w-[26px] h-[26px] bg-center bg-contain bg-no-repeat"
        style={{
          backgroundImage: `url(${data?.chainIcon})`,
        }}
      />
      <div>
        <div className="text-[12px] font-[500]">{data?.chainName}</div>
        <div className="text-[12px] font-[400]">
          {formatAddress(address, 5, 4)}
        </div>
      </div>
    </div>
  );
};
