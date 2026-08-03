import LazyImage from "@/components/lazy-image";
import useRheaTokensStore from "@/stores/use-rhea-tokens";
import { DefaultIcon } from "@/utils/format/logo";
import clsx from "clsx";
import { useMemo } from "react";

type TokenIconProps = {
  symbol?: string;
  blockchain?: string;
  width?: number;
  height?: number;
  className?: string;
  containerClassName?: string;
};

/** Token icon from Rhea tokens store; shows DefaultIcon until data is ready. */
export default function TokenIcon({
  symbol,
  blockchain,
  width,
  height,
  className,
  containerClassName,
}: TokenIconProps) {
  const tokens = useRheaTokensStore((s) => s.tokens);

  const icon = useMemo(() => {
    if (!symbol) return undefined;
    const found = tokens.find(
      (t) =>
        t.symbol === symbol &&
        (!blockchain || t.blockchain === blockchain)
    );
    return found?.icon;
  }, [tokens, symbol, blockchain]);

  return (
    <LazyImage
      src={icon || DefaultIcon}
      fallbackSrc={DefaultIcon}
      alt={symbol || ""}
      width={width}
      height={height}
      className={className}
      containerClassName={clsx(containerClassName, "shrink-0 rounded-full overflow-hidden")}
    />
  );
}
