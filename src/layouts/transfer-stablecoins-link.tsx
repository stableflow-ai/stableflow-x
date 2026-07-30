import { IS_PRODUCTION } from "@/config/api";
import { getStableflowIcon } from "@/utils/format/logo";

const APP_URL = IS_PRODUCTION
  ? "https://app.stableflow.ai"
  : "https://test.stableflow.ai";

const TransferStablecoinsLink = () => {
  return (
    <a
      href={APP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="hidden md:flex fixed left-1/2 -translate-x-1/2 bottom-[20px] z-11 items-center gap-1 text-[#444C59] text-sm font-normal leading-none underline hover:opacity-80 duration-150"
    >
      Transfer stablecoins
      <img
        src={getStableflowIcon("icon-arrow-right-up.svg")}
        alt=""
        className="w-[7px] h-[7px] object-contain shrink-0"
      />
    </a>
  );
};

export default TransferStablecoinsLink;
