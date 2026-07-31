import erc20Abi from "@/config/abi/erc20";
import { numberRemoveEndZero } from "@/utils/format/number";
import { getRheaNativePrice, isEvmNativeBalanceToken } from "@/services/rhea/tokens";
import { formatBridgeError } from "@/views/bridge/utils";
import Big from "big.js";
import { ethers } from "ethers";
import { SendType } from "../types";
import { csl } from "@/utils/log";
import { createMulticall3, type Call } from "@/utils/multicall3";
import { evmRpcFallbackProvider } from "@/utils/evm-rpc-providers";

const DEFAULT_GAS_LIMIT = 100000n;
const DEFAULT_GAS_LIMIT_FAILED = 4000000n;
const USER_REJECTED_TRANSACTION_MESSAGE = "User rejected transaction";


export default class RainbowWallet {
  provider: any;
  signer: any;

  constructor(_provider: any, _signer?: any) {
    this.provider = _provider;
    this.signer = _signer;
  }

  async transfer(data: {
    originAsset: string;
    depositAddress: string;
    amount: string;
  }) {
    const { originAsset, depositAddress, amount } = data;

    if (originAsset === "eth") {
      const hash = await this.signer.sendUncheckedTransaction({
        to: depositAddress,
        value: ethers.parseEther(amount),
      });
      return hash;
    }

    const contract = new ethers.Contract(originAsset, erc20Abi, this.signer);
    const txRequest = await contract.transfer.populateTransaction(depositAddress, amount);
    const hash = await this.signer.sendUncheckedTransaction(txRequest);
    return hash;
  }

  async getBalance(token: any, account: string, options?: { isCatchError?: boolean; }) {
    const { isCatchError = false } = options || {};

    try {
      let provider = this.provider;
      if (token.rpcUrls) {
        provider = evmRpcFallbackProvider(token);
      }

      const addr = (token.contractAddress || "").toLowerCase();
      const isNative =
        token.symbol === "native" ||
        isEvmNativeBalanceToken(token) ||
        addr === "0x0000000000000000000000000000000000000000" ||
        /^nep\d+:/i.test(addr);

      if (isNative) {
        const balance = await provider.getBalance(account);
        return balance.toString();
      }

      // Use provider instead of _signer for read-only operations
      const contract = new ethers.Contract(token.contractAddress, erc20Abi, provider);

      const balance = await contract.balanceOf(account);
      csl("EVM getBalance", "green-500", "Success getting %s token balance: %o", token.contractAddress, balance);

      return balance.toString();
    } catch (err) {
      csl("EVM getBalance", "red-500", "Get balance failed: %o", err);
      if (isCatchError) {
        throw err;
      }
      return "0";
    }
  }

  async balanceOf(token: any, account: string, options?: { isCatchError?: boolean; }) {
    return await this.getBalance(token, account, options);
  }

  /**
   * Estimate gas limit for transfer transaction
   * @param data Transfer data
   * @returns Gas limit estimate, gas price, and estimated gas cost
   */
  async estimateTransferGas(data: {
    fromToken: any;
    depositAddress: string;
    amount: string;
    account: string;
  }): Promise<{
    gasLimit: bigint;
    gasPrice: bigint;
    estimateGas: bigint;
  }> {
    const { fromToken, depositAddress, amount, account } = data;
    const originAsset = fromToken.contractAddress;
    const provider = evmRpcFallbackProvider(fromToken);

    let gasLimit: bigint;

    if (originAsset === "eth") {
      // Estimate gas for ETH transfer
      const tx = {
        from: account,
        to: depositAddress,
        value: ethers.parseEther(amount)
      };
      gasLimit = await provider.estimateGas(tx);
    } else {
      // Estimate gas for ERC20 token transfer
      const contract = new ethers.Contract(originAsset, erc20Abi, provider);
      gasLimit = await contract.transfer.estimateGas(depositAddress, amount);
    }

    // Increase gas limit by 20% to provide buffer
    gasLimit = (gasLimit * 120n) / 100n;

    // Get gas price
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice || 0n;

    // Calculate estimated gas cost: gasLimit * gasPrice
    const estimateGas = gasLimit * gasPrice;

    return {
      gasLimit,
      gasPrice,
      estimateGas
    };
  }

  getContract(params: any) {
    const {
      contractAddress,
      abi,
    } = params;

    return new ethers.Contract(contractAddress, abi, this.signer);
  }

  async allowance(params: any) {
    const {
      dry,
      contractAddress,
      spender,
      address,
      amountWei,
      provider,
      blockTag,
      strict = false,
    } = params;

    const runner = provider || this.provider;
    const contract = new ethers.Contract(contractAddress, erc20Abi, runner);

    // If querying for a quote
    // Directly return the default value
    if (dry) {
      return {
        contract,
        allowance: "0",
        needApprove: false,
      };
    }

    // get allowance
    let allowance = "0";
    try {
      allowance = blockTag
        ? await contract.allowance(address, spender, { blockTag })
        : await contract.allowance(address, spender);
      allowance = allowance.toString();
    } catch (error) {
      csl("EVM allowance", "red-500", "Error getting allowance: %o", error);
      if (strict) {
        throw error;
      }
    }

    return {
      contract,
      allowance,
      needApprove: Big(amountWei || 0).gt(allowance || 0),
    };
  }

  async approve(params: any) {
    const {
      contractAddress,
      spender,
      amountWei,
      isApproveMax = false,
      isDetails = false,
      isWaitTxReceipt = true,
    } = params;

    const contract = new ethers.Contract(contractAddress, erc20Abi, this.signer);

    let _amountWei = amountWei;
    if (isApproveMax) {
      _amountWei = ethers.MaxUint256;
    }

    const detailResult: any = {
      success: false,
      data: {},
      message: null,
    };

    try {
      const tx = await contract.approve(spender, _amountWei);
      const txReceipt = await tx.wait();
      if (txReceipt.status === 1) {
        if (isDetails) {
          const confirmations = typeof txReceipt.confirmations === "function"
            ? await txReceipt.confirmations()
            : txReceipt.confirmations;
          detailResult.success = true;
          detailResult.data = {
            txHash: txReceipt.hash,
            blockNumber: txReceipt.blockNumber,
            confirmations,
          };
          return detailResult;
        }
        return true;
      }
      if (isDetails) {
        detailResult.message = "Arrove failed";
        return detailResult;
      }
      return false;
    } catch (error: any) {
      console.error("Error approve: %o", error)
      if (isDetails) {
        detailResult.message = error.message;
      }
    }

    if (isDetails) {
      return detailResult;
    }

    return false;
  }

  async getEstimateGas(params: any) {
    const { gasLimit, price, nativeToken, provider, gasPrice } = params;

    let finalGasPrice = gasPrice;
    if (!finalGasPrice) {
      const feeData = await provider.getFeeData();
      finalGasPrice = feeData.maxFeePerGas || feeData.gasPrice || BigInt("20000000000"); // Default 20 gwei
    }

    const estimateGas = BigInt(gasLimit) * BigInt(finalGasPrice);
    const estimateGasAmount = Big(estimateGas.toString()).div(10 ** nativeToken.decimals);
    const estimateGasUsd = Big(estimateGasAmount).times(price || 1);

    return {
      gasPrice: finalGasPrice,
      usd: numberRemoveEndZero(Big(estimateGasUsd).toFixed(20)),
      wei: estimateGas,
      amount: numberRemoveEndZero(Big(estimateGasAmount).toFixed(nativeToken.decimals)),
    };
  }

  async estimateTransaction(params: any) {
    const {
      dry,
      contract,
      method,
      param,
      fromToken,
      prices,
      evmGasFees,
      defaultGasLimit = DEFAULT_GAS_LIMIT,
      refundTo,
      txRequest,
    } = params;

    const provider = evmRpcFallbackProvider(fromToken);
    const nativeTokenPrice = getRheaNativePrice(fromToken);

    const result = {
      estimateSourceGasLimit: dry ? DEFAULT_GAS_LIMIT_FAILED : DEFAULT_GAS_LIMIT,
      estimateSourceGas: 0n,
      estimateSourceGasUsd: "0",
    };

    const setDefaultGasLimit = async () => {
      const { usd, wei } = await this.getEstimateGas({
        gasLimit: DEFAULT_GAS_LIMIT,
        price: nativeTokenPrice,
        nativeToken: fromToken.nativeToken,
        provider,
        gasPrice: dry ? evmGasFees[fromToken.chainId].gasPrice : void 0,
      });
      result.estimateSourceGas = wei;
      result.estimateSourceGasUsd = usd;
    };

    let finalGasLimit = defaultGasLimit;

    if (dry) {
      await setDefaultGasLimit();
      return result;
    }

    if (txRequest) {
      try {
        const gasLimit = await provider.estimateGas({
          to: txRequest.target,
          data: txRequest.calldata,
          from: refundTo || this.signer?.address,
        });
        finalGasLimit = gasLimit * 120n / 100n;
        const { usd, wei } = await this.getEstimateGas({
          gasLimit: finalGasLimit,
          price: nativeTokenPrice,
          nativeToken: fromToken.nativeToken,
          provider,
        });
        result.estimateSourceGasLimit = finalGasLimit;
        result.estimateSourceGas = wei;
        result.estimateSourceGasUsd = usd;
      } catch (error) {
        csl("EVM estimateTransaction", "red-500", "%s estimateGas failed: %o", method, error);
        await setDefaultGasLimit();
        result.estimateSourceGasLimit = DEFAULT_GAS_LIMIT_FAILED / 2n;
      }

      return result;
    }

    try {
      // Estimate via the signed RPC provider instead of the signer's provider.
      // Mobile WalletConnect routes read calls (eth_estimateGas) through its own
      // HTTP client to the proxy RPC without HMAC headers, causing a 401. The
      // fallback provider re-generates the HMAC signature on every request.
      const readContract = contract.connect(provider);
      const populated = await readContract[method].populateTransaction(...param);
      const { gasLimit: _ignoredGasLimit, ...txData } = populated;
      const gasLimit = await provider.estimateGas({
        ...txData,
        from: refundTo || this.signer?.address,
      });
      finalGasLimit = gasLimit * 120n / 100n;
      const { usd, wei } = await this.getEstimateGas({
        gasLimit: finalGasLimit,
        price: nativeTokenPrice,
        nativeToken: fromToken.nativeToken,
        provider,
      });
      result.estimateSourceGasLimit = finalGasLimit;
      result.estimateSourceGas = wei;
      result.estimateSourceGasUsd = usd;
    } catch (error) {
      csl("EVM estimateTransaction", "red-500", "%s estimateGas failed: %o", method, error);
      await setDefaultGasLimit();
      result.estimateSourceGasLimit = DEFAULT_GAS_LIMIT_FAILED / 2n;
    }

    return result;
  }

  async sendTransaction(params: any) {
    const {
      method,
      contract,
      param,
    } = params;

    // Add gas fee buffer to prevent "max fee per gas less than block base fee" error.
    // Between quote and send, the baseFee may increase, causing the estimated
    // maxFeePerGas to be lower than the current baseFee.
    const overridesIndex = param.length - 1;
    const overrides = param[overridesIndex] && typeof param[overridesIndex] === "object" && !Array.isArray(param[overridesIndex])
      ? { ...param[overridesIndex] }
      : {};

    if (!overrides.maxFeePerGas) {
      try {
        const feeData = await this.provider.getFeeData();
        if (feeData.maxFeePerGas) {
          // Add 20% buffer to maxFeePerGas to account for baseFee fluctuations
          overrides.maxFeePerGas = (feeData.maxFeePerGas * 120n) / 100n;
        }
        if (feeData.maxPriorityFeePerGas && !overrides.maxPriorityFeePerGas) {
          overrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
        }
      } catch (error) {
        csl("EVM sendTransaction", "red-500", "Failed to get fee data for gas buffer: %o", error);
      }
    }

    const finalParam = [...param];
    if (param[overridesIndex] && typeof param[overridesIndex] === "object" && !Array.isArray(param[overridesIndex])) {
      finalParam[overridesIndex] = overrides;
    } else {
      finalParam.push(overrides);
    }

    try {
      const tx = await contract[method](...finalParam);

      return tx.hash;
    } catch (error: any) {
      csl("EVM sendTransaction", "red-500", "Error sending transaction: %o, message: %o", error, error.message);
      const formatted = formatBridgeError(error, "Transaction failed");
      if (formatted === USER_REJECTED_TRANSACTION_MESSAGE) {
        throw new Error(USER_REJECTED_TRANSACTION_MESSAGE);
      }
      throw new Error(`Transaction failed: ${error.message}`);
    }

    // const DefaultErrorMsg = "Transaction failed";
    // try {
    //   const txReceipt = await tx.wait();

    //   if (txReceipt.status !== 1) {
    //     throw new Error(DefaultErrorMsg);
    //   }

    //   return txReceipt.hash;
    // } catch (error: any) {
    //   return tx.hash;
    // }
  }

  /**
   * Sign and send a Rhea EVM tx payload ({ to, data, value, gasLimit }).
   */
  async sendRheaTx(tx: any) {
    if (!tx?.to) {
      throw new Error("Invalid Rhea tx: missing to");
    }
    const request: Record<string, any> = {
      to: tx.to,
      data: tx.data || "0x",
      value: tx.value != null && tx.value !== "" ? BigInt(tx.value) : 0n,
    };
    if (tx.gasLimit != null && tx.gasLimit !== "") {
      request.gasLimit = BigInt(tx.gasLimit);
    }
    if (tx.maxFeePerGas != null && tx.maxFeePerGas !== "") {
      request.maxFeePerGas = BigInt(tx.maxFeePerGas);
    }
    if (tx.maxPriorityFeePerGas != null && tx.maxPriorityFeePerGas !== "") {
      request.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);
    }

    try {
      const hash = await this.signer.sendUncheckedTransaction(request);
      return hash;
    } catch (error: any) {
      csl("EVM sendRheaTx", "red-500", "Error sending Rhea tx: %o", error);
      const formatted = formatBridgeError(error, "Transaction failed");
      if (formatted === USER_REJECTED_TRANSACTION_MESSAGE) {
        throw new Error(USER_REJECTED_TRANSACTION_MESSAGE);
      }
      throw new Error(`Transaction failed: ${error?.message || error}`);
    }
  }

  async send(type: SendType, params: any) {
    switch (type) {
      case SendType.SEND:
        return await this.sendTransaction(params);
      case SendType.TRANSFER:
        return await this.transfer(params);
      default:
        throw new Error(`Unsupported send type: ${type}`);
    }
  }

  async sendBatchCall(params: any) {
    const { multicallCalls, chainId } = params;

    if (!multicallCalls?.length || !chainId) {
      throw new Error("sendBatchCall requires multicallCalls and chainId");
    }

    try {
      const multicall = createMulticall3(this.provider, chainId);
      return await multicall.sendAggregate(multicallCalls as Call[], this.signer);
    } catch (error: any) {
      csl("EVM sendBatchCall", "red-500", "Error executing multicall: %o", error);
      const formatted = formatBridgeError(error, "Transaction failed");
      if (formatted === USER_REJECTED_TRANSACTION_MESSAGE) {
        throw new Error(USER_REJECTED_TRANSACTION_MESSAGE);
      }
      throw new Error("Transaction failed");
    }
  }

  async signTypedData(params: any) {
    const { fromToken, amountWei, spender } = params;

    csl("EVM signTypedData", "blue-900", "params: %o", params);

    const provider = evmRpcFallbackProvider(fromToken);

    const value = amountWei;
    const tokenAddress = fromToken.contractAddress;
    const chainId = fromToken.chainId;
    // 3 days
    const deadline = Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 3);
    const account = this.signer.address;

    const erc20 = new ethers.Contract(tokenAddress, erc20Abi, provider);
    const nonce = await erc20.nonces(account);
    const name = await erc20.name();

    let _version = "1";
    if (fromToken.symbol === "USDC") {
      _version = "2";
    }

    const domain = {
      name,
      version: _version,
      chainId: Number(chainId),
      verifyingContract: tokenAddress
    };

    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" }
      ]
    };

    const values = {
      owner: account,
      spender,
      value,
      nonce: nonce.toString(),
      deadline
    };

    const signature = await this.signer?.signTypedData(domain, types, values);

    const { v, r, s } = ethers.Signature.from(signature);

    // Check if signature is available
    try {
      const permitParams = [
        account,
        spender,
        value,
        deadline,
        v,
        r,
        s,
      ];
      const permitResponse = await erc20.permit.staticCall(...permitParams);
      csl("EVM signTypedData", "green-500", "permit response: %o", permitResponse);
    } catch (error: any) {
      csl("EVM signTypedData", "red-500", "check permit signature failed: %o", error);
      throw new Error("Permit signature verification failed");
    }

    return {
      owner: account,
      value,
      deadline,
      nonce: Number(nonce),
      v,
      r,
      s,
    };
  }
}
