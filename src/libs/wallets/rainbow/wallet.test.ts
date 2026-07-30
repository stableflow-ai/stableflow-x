import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/views/bridge/utils", () => ({
  formatBridgeError: (error: any, fallback: string) => error?.message || fallback,
}));

vi.mock("@/services/rhea/tokens", () => ({
  getRheaNativePrice: () => 1,
}));

vi.mock("@/utils/log", () => ({
  csl: vi.fn(),
}));

vi.mock("@/utils/multicall3", () => ({
  createMulticall3: vi.fn(),
}));

vi.mock("@/utils/evm-rpc-providers", () => ({
  evmRpcFallbackProvider: vi.fn(),
}));

vi.mock("@/utils/format/number", () => ({
  numberRemoveEndZero: (value: string) => value,
}));

const HASH = "0x1114a8f49815b2bdd484270c04193ab93a0f398feabc261d5348ca320dd00899";

describe("RainbowWallet send without wait", () => {
  let RainbowWallet: typeof import("./wallet").default;
  let sendUncheckedTransaction: ReturnType<typeof vi.fn>;
  let sendTransaction: ReturnType<typeof vi.fn>;
  let wait: ReturnType<typeof vi.fn>;
  let populateTransaction: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    sendUncheckedTransaction = vi.fn().mockResolvedValue(HASH);
    wait = vi.fn().mockResolvedValue({ hash: HASH, status: 1 });
    sendTransaction = vi.fn().mockResolvedValue({ hash: HASH, wait });
    populateTransaction = vi.fn().mockResolvedValue({
      to: "0x55d398326f99059ff775485246999027b3197955",
      data: "0xa9059cbb",
    });

    vi.doMock("ethers", async () => {
      const actual = await vi.importActual<typeof import("ethers")>("ethers");
      const ContractMock = vi.fn(function ContractMock(this: any) {
        this.transfer = {
          populateTransaction,
        };
      });
      return {
        ...actual,
        ethers: {
          ...actual.ethers,
          parseEther: actual.ethers.parseEther,
          Contract: ContractMock,
        },
      };
    });

    ({ default: RainbowWallet } = await import("./wallet"));
  });

  it("sendRheaTx uses sendUncheckedTransaction and returns hash without wait", async () => {
    const wallet = new RainbowWallet(null, {
      sendUncheckedTransaction,
      sendTransaction,
    });

    const hash = await wallet.sendRheaTx({
      to: "0x55d398326f99059ff775485246999027b3197955",
      data: "0xa9059cbb",
      value: "0x0",
      gasLimit: "0x186a0",
      chainId: 56,
    });

    expect(hash).toBe(HASH);
    expect(sendUncheckedTransaction).toHaveBeenCalledTimes(1);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });

  it("transfer native returns hash without wait", async () => {
    const wallet = new RainbowWallet(null, {
      sendUncheckedTransaction,
      sendTransaction,
    });

    const hash = await wallet.transfer({
      originAsset: "eth",
      depositAddress: "0xF0D3827817C4eBdA3B135E9C328C95d04142B734",
      amount: "0.2",
    });

    expect(hash).toBe(HASH);
    expect(sendUncheckedTransaction).toHaveBeenCalledTimes(1);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });

  it("transfer erc20 returns hash without wait", async () => {
    const wallet = new RainbowWallet(null, {
      sendUncheckedTransaction,
      sendTransaction,
    });

    const hash = await wallet.transfer({
      originAsset: "0x55d398326f99059ff775485246999027b3197955",
      depositAddress: "0xF0D3827817C4eBdA3B135E9C328C95d04142B734",
      amount: "200000000000000000",
    });

    expect(hash).toBe(HASH);
    expect(populateTransaction).toHaveBeenCalledTimes(1);
    expect(sendUncheckedTransaction).toHaveBeenCalledTimes(1);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(wait).not.toHaveBeenCalled();
  });
});
