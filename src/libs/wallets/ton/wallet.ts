import { getChainRpcUrl } from "@/config/chains";
import { Address, beginCell, toNano, TonClient } from "@ton/ton";
import type { TupleItem } from "@ton/ton";
import { TonConnectUI } from "@tonconnect/ui-react";
import { SendType } from "../types";
import { buildJettonWalletTransferBody, pollTransactionByBoc } from "../utils/ton";
import { numberRemoveEndZero } from "@/utils/format/number";
import Big from "big.js";
import { csl } from "@/utils/log";
import { getRheaNativePrice } from "@/services/rhea/tokens";
import { BridgeDefaultWallets } from "@/config";

export default class TonWallet {
  private tonConnectUI: TonConnectUI;
  private tonClient: TonClient;
  private account: string;

  constructor(options: { tonConnectUI: TonConnectUI; account: string; }) {
    this.tonConnectUI = options.tonConnectUI;
    this.account = options.account;

    this.tonClient = new TonClient({
      endpoint: getChainRpcUrl("Ton").rpcUrl,
      apiKey: import.meta.env.VITE_TON_RPC_API_KEY,
    });
  }

  // Check if the token is native TON
  private isNativeToken(originAsset: string): boolean {
    const lowerAsset = originAsset.toLowerCase();
    return lowerAsset === "ton" || lowerAsset === "native";
  }

  async getSenderJettonWallet(masterAddress: string, account?: string) {
    const _account = account || this.account;
    try {
      const jettonMasterAddress = Address.parse(masterAddress);
      const owner = Address.parse(_account);

      const ownerCell = beginCell().storeAddress(owner).endCell();
      const stack: TupleItem[] = [{ type: 'slice', cell: ownerCell }];

      const response = await this.tonClient.runMethod(jettonMasterAddress, "get_wallet_address", stack);

      const jettonWalletCell = response.stack.readCell();
      const jettonWalletAddress = jettonWalletCell.beginParse().loadAddress();

      return jettonWalletAddress;
    } catch (error) {
      console.error("get %s jetton wallet failed: %o", _account, error);
      throw error;
    }
  }

  async transfer(data: {
    originAsset: string;
    depositAddress: string;
    amount: string;
    memo?: string;
  }) {
    const { originAsset, depositAddress, amount, memo } = data;

    if (!this.tonConnectUI) {
      throw new Error('TON Connect UI not initialized');
    }

    try {
      if (this.isNativeToken(originAsset)) {
        // Native TON token transfer
        const transaction = {
          messages: [
            {
              address: depositAddress,
              amount: toNano(amount).toString(),
            }
          ],
          validUntil: Math.floor(Date.now() / 1000) + 600, // 10 minutes
        };

        const result = await this.tonConnectUI.sendTransaction(transaction);
        return result.boc;
      }

      const senderJettonWallet = await this.getSenderJettonWallet(originAsset);

      const body = buildJettonWalletTransferBody({
        memo,
        amount,
        recipient: depositAddress,
        refundTo: this.account,
      });

      const transaction = {
        validUntil: Math.floor(Date.now() / 1000) + 360,
        messages: [
          {
            address: senderJettonWallet.toString(), // sender jetton wallet
            amount: toNano("0.05").toString(), // for commission fees, excess will be returned
            payload: body.toBoc().toString("base64"), // payload with jetton transfer body
          },
        ],
      };

      const result = await this.tonConnectUI.sendTransaction(transaction);
      return result.boc;
    } catch (error) {
      console.log('TON transfer error:', error);
      throw error;
    }
  }

  async getBalance(token: any, account: string, options?: { isCatchError?: boolean; }) {
    const { isCatchError = false } = options || {};

    try {
      if (this.isNativeToken(token.symbol)) {
        const parsedAddress = Address.parse(account);
        const accountState = await this.tonClient.getBalance(parsedAddress);
        return accountState.toString();
      }
      const tokenJettonWallet = await this.getSenderJettonWallet(token.contractAddress, account);
      const response = await this.tonClient.runMethod(tokenJettonWallet, "get_wallet_data", []);
      const balance = response.stack.readBigNumber();
      return balance.toString();
    } catch (error) {
      csl("Ton getBalance", "red-500", "Get balance failed: %o", error);
      if (isCatchError) {
        throw error;
      }
      return "0";
    }
  }

  async balanceOf(token: string, account: string, options?: { isCatchError?: boolean; }) {
    return await this.getBalance(token, account, options);
  }

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
    const { fromToken, amount, depositAddress, account } = data;

    let estimateGas: bigint;

    if (this.isNativeToken(fromToken.symbol)) {
      estimateGas = toNano("0.01");
    } else {
      const senderJettonWallet = await this.getSenderJettonWallet(fromToken.contractAddress, account);
      const body = buildJettonWalletTransferBody({
        amount,
        recipient: depositAddress,
        refundTo: account,
      });
      try {
        const estimation = await this.tonClient.estimateExternalMessageFee(senderJettonWallet, {
          body,
          initCode: null,
          initData: null,
          ignoreSignature: true,
        });
        const { in_fwd_fee, storage_fee, gas_fee, fwd_fee } = estimation.source_fees;
        estimateGas = BigInt(in_fwd_fee) + BigInt(storage_fee) + BigInt(gas_fee) + BigInt(fwd_fee);
        csl("TON estimateTransferGas", "blue-300", "estimateGas: %o", estimateGas);
        estimateGas = estimateGas + toNano("0.1");
      } catch {
        estimateGas = toNano("0.12");
      }
    }

    return {
      gasLimit: estimateGas,
      gasPrice: 1n, // TON has no gas price concept, use 1 for compatibility
      estimateGas,
    };
  }

  async getEstimateGas(params: any) {
    const { gasLimit, price, nativeToken } = params;

    const estimateGasAmount = Big(gasLimit.toString()).div(10 ** nativeToken.decimals);
    const estimateGasUsd = Big(estimateGasAmount).times(price || 1);

    return {
      gasPrice: 1n,
      usd: numberRemoveEndZero(Big(estimateGasUsd).toFixed(20)),
      wei: gasLimit,
      amount: numberRemoveEndZero(Big(estimateGasAmount).toFixed(nativeToken.decimals)),
    };
  }

  async estimateTransaction(params: any) {
    const {
      dry,
      body,
      estimateGas,
      fromToken,
      prices,
    } = params;

    const nativeTokenPrice = getRheaNativePrice(fromToken);

    let finalEstimateGas = estimateGas || toNano("0.12");
    if (body) {
      try {
        const account = this.account || BridgeDefaultWallets["ton"];
        const senderJettonWallet = await this.getSenderJettonWallet(fromToken.contractAddress, account);
        const estimation = await this.tonClient.estimateExternalMessageFee(senderJettonWallet, {
          body,
          initCode: null,
          initData: null,
          ignoreSignature: true,
        });
        csl("TON estimateTransaction", "blue-300", "estimation: %o", estimation);
        const { in_fwd_fee, storage_fee, gas_fee, fwd_fee } = estimation.source_fees;
        finalEstimateGas = BigInt(in_fwd_fee) + BigInt(storage_fee) + BigInt(gas_fee) + BigInt(fwd_fee);
        finalEstimateGas = finalEstimateGas + toNano("0.1");
      } catch (error) {
        csl("TON estimateTransaction", "red-500", "estimateExternalMessageFee failed: %o", error);
      }
    }

    const { usd, wei } = await this.getEstimateGas({
      gasLimit: finalEstimateGas,
      price: nativeTokenPrice,
      nativeToken: fromToken.nativeToken,
    });

    const result = {
      estimateSourceGasLimit: finalEstimateGas,
      estimateSourceGas: wei,
      estimateSourceGasUsd: usd,
    };

    return result;
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

  async sendTransaction(params: any) {
    const {
      transaction,
    } = params;

    const result = await this.tonConnectUI.sendTransaction(transaction);
    const { hexHash } = await pollTransactionByBoc(result.boc, { maxPollCount: 60, pollInterval: 3000 });
    return hexHash;
  }
}
