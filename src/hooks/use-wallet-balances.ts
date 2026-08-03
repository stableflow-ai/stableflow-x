import useWalletStore from "@/stores/use-wallet";
import useEvmBalances from "@/hooks/use-evm-balances";
import useNonEvmBalances from "@/hooks/use-non-evm-balances";

/** Fetch balances while My Wallets drawer or token-select modal is open (mutually exclusive). */
export default function useWalletBalances() {
  const showWallet = useWalletStore((s) => s.showWallet);
  const showTokenSelect = useWalletStore((s) => s.showTokenSelect);
  const enabled = !!(showWallet || showTokenSelect);

  useEvmBalances(enabled);
  useNonEvmBalances(enabled);
}
