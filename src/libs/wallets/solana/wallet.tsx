import {
  Connection,
  PublicKey,
  SendTransactionError,
  Transaction,
  VersionedTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { getChainRpcUrl } from "@/config/chains";
import Big from "big.js";
import { numberRemoveEndZero } from "@/utils/format/number";
import { getRheaNativePrice } from "@/services/rhea/tokens";
import { SendType } from "../types";
import { csl } from "@/utils/log";
import { createSolanaFallbackConnection } from "../utils/solana";

export default class SolanaWallet {
  private publicKey: PublicKey | null;
  private signTransaction: any;
  private signer: any;

  constructor(options: { publicKey: PublicKey | null; signer: any }) {
    this.publicKey = options.publicKey;
    this.signTransaction = options.signer.signTransaction;
    this.signer = options.signer;
  }

  getConnection() {
    const solanaRpcUrls: string[] = getChainRpcUrl("Solana").rpcUrls;
    return createSolanaFallbackConnection(solanaRpcUrls);
  };

  // Transfer SOL
  async transferSOL(to: string, amount: string) {
    if (!this.publicKey) {
      throw new Error("Wallet not connected");
    }

    const fromPubkey = this.publicKey;
    const toPubkey = new PublicKey(to);
    const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports
      })
    );

    const connection = this.getConnection();
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    const signedTransaction = await this.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(
      signedTransaction.serialize()
    );

    await connection.confirmTransaction(signature);
    return signature;
  }

  // Transfer SPL token
  async transferToken(tokenMint: string, to: string, amount: string) {
    if (!this.publicKey) {
      throw new Error("Wallet not connected");
    }

    const connection = this.getConnection();

    const fromPubkey = this.publicKey;
    const toPubkey = new PublicKey(to);
    const mint = new PublicKey(tokenMint);

    // Get associated token account addresses
    const fromTokenAccount = getAssociatedTokenAddressSync(mint, fromPubkey);
    const toTokenAccount = getAssociatedTokenAddressSync(mint, toPubkey);

    const transaction = new Transaction();

    // Check if recipient has token account, create if not
    try {
      await getAccount(connection, toTokenAccount);
    } catch (error) {
      // If token account doesn't exist, create it
      transaction.add(
        createAssociatedTokenAccountInstruction(
          fromPubkey, // payer
          toTokenAccount, // ata
          toPubkey, // owner
          mint // mint
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        fromPubkey,
        BigInt(amount),
        [],
        TOKEN_PROGRAM_ID
      )
    );

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    const signedTransaction = await this.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(
      signedTransaction.serialize()
    );

    await connection.confirmTransaction(signature);

    return signature;
  }

  // Generic transfer method
  async transfer(data: {
    originAsset: string;
    depositAddress: string;
    amount: string;
  }) {
    const { originAsset, depositAddress, amount } = data;

    // Transfer SOL
    if (originAsset === "SOL" || originAsset === "sol") {
      return await this.transferSOL(depositAddress, amount);
    }

    // Transfer SPL token
    const result = await this.transferToken(
      originAsset,
      depositAddress,
      amount
    );
    return result;
  }

  async getSOLBalance(account: string, options?: { isCatchError?: boolean; }) {
    const { isCatchError = false } = options || {};

    const connection = this.getConnection();

    try {
      const publicKey = new PublicKey(account);
      const balance = await connection.getBalance(publicKey);
      return balance;
    } catch (error) {
      csl("Solana getSOLBalance", "red-500", "Get SOL balance failed: %o", error);
      if (isCatchError) {
        throw error;
      }
      return "0";
    }
  }

  async getTokenBalance(tokenMint: string, account: string, options?: { isCatchError?: boolean; }) {
    const { isCatchError = false } = options || {};

    const connection = this.getConnection();

    const mint = new PublicKey(tokenMint);
    const owner = new PublicKey(account);

    try {
      const tokenAccount = await getAssociatedTokenAddress(mint, owner);

      const accountInfo = await getAccount(connection, tokenAccount);

      return accountInfo.amount;
    } catch (error: any) {
      if (error.message.includes("could not find account")) {
        return "0";
      }
      if (isCatchError) {
        throw error;
      }
      return "0";
    }
  }

  async getBalance(token: any, account: string, options?: { isCatchError?: boolean; }) {
    if (
      token.symbol === "SOL" ||
      token.symbol === "sol" ||
      token.symbol === "native" ||
      token.contractAddress === "So11111111111111111111111111111111111111112" ||
      token.assetId === "So11111111111111111111111111111111111111112"
    ) {
      return await this.getSOLBalance(account, options);
    }
    return await this.getTokenBalance(token.contractAddress, account, options);
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
  }): Promise<{
    gasLimit: bigint;
    gasPrice: bigint;
    estimateGas: bigint;
  }> {
    const connection = this.getConnection();

    // Solana transaction fees are typically fixed at 5000 lamports per signature
    // Base fee per signature: 5000 lamports
    let estimatedFee = 5000n;

    const { fromToken, depositAddress } = data;
    const originAsset = fromToken.contractAddress;

    // Check if token account creation is needed for SPL tokens
    if (originAsset !== "SOL" && originAsset !== "sol") {
      const mint = new PublicKey(originAsset);
      const toPubkey = new PublicKey(depositAddress);
      const toTokenAccount = getAssociatedTokenAddressSync(mint, toPubkey);

      // Check if recipient has token account
      try {
        await getAccount(connection, toTokenAccount);
        // Account exists, no additional fee
      } catch (error) {
        // Account doesn't exist, will need to create it (additional fee)
        estimatedFee += 5000n;
      }
    }

    return {
      gasLimit: estimatedFee,
      gasPrice: 1n,
      estimateGas: estimatedFee
    };
  }

  async getEstimateGas(params: any) {
    const { gasLimit = "5000", price, nativeToken } = params;

    const estimateGas = BigInt(gasLimit);
    const estimateGasAmount = Big(estimateGas.toString()).div(10 ** nativeToken.decimals);
    const estimateGasUsd = Big(estimateGasAmount).times(price || 1);

    return {
      gasPrice: 1n,
      usd: numberRemoveEndZero(Big(estimateGasUsd).toFixed(20)),
      wei: estimateGas,
      amount: numberRemoveEndZero(Big(estimateGasAmount).toFixed(nativeToken.decimals)),
    };
  }

  async estimateTransaction(params: any) {
    const {
      dry,
      versionedTx,
      fromToken,
      prices,
    } = params;

    const connection = this.getConnection();

    const nativeTokenPrice = getRheaNativePrice(fromToken);

    let estimatedFee = 5000n;
    if (!dry) {
      try {
        const sendSim = await connection.simulateTransaction(versionedTx, {
          sigVerify: false,
          replaceRecentBlockhash: true,
        });
        csl("Solana estimateTransaction", "purple-400", "sendSim: %o", sendSim);
        // Even if simulation fails (e.g., insufficient funds), we can still get the fee estimate
        if (!sendSim.value.err) {
          // @ts-ignore Solana base fee is 5000 lamports per signature
          estimatedFee = (sendSim.value as any).fee || 5000n;
        } else {
          // If simulation fails, log it but continue with default fee
          console.warn('Send simulation failed (this is normal in quote phase):', sendSim.value.err);
          // @ts-ignore Try to get fee even if simulation failed
          const fee = (sendSim.value as any).fee;
          if (fee) {
            estimatedFee = fee;
          }
        }
      } catch (error) {
        // csl("Solana estimateTransaction", "red-500", "estimateTransaction failed: %o", error);
      }
    }

    const result = {
      estimateSourceGasLimit: BigInt(estimatedFee),
      estimateSourceGas: 0n,
      estimateSourceGasUsd: "0",
    };

    const setDefaultGasLimit = async () => {
      const { usd, wei } = await this.getEstimateGas({
        gasLimit: estimatedFee,
        price: nativeTokenPrice,
        nativeToken: fromToken.nativeToken,
      });
      result.estimateSourceGas = wei;
      result.estimateSourceGasUsd = usd;
    };

    await setDefaultGasLimit();
    return result;
  }

  async checkTransactionStatus(signature: string) {
    const connection = this.getConnection();

    const maxAttempts = 30;
    const interval = 4000;
    let timer: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const tx = await connection.getTransaction(signature, {
          commitment: "finalized",
          maxSupportedTransactionVersion: 0
        });

        if (tx) {
          if (tx.meta && tx.meta.err === null) {
            return true;
          } else {
            return false;
          }
        } else {
          csl("Solana checkTransactionStatus", "purple-400", "polling attempt %d/%d: transaction not confirmed...", attempt, maxAttempts);
        }
      } catch (error: any) {
        csl("Solana checkTransactionStatus", "red-500", "checkTransactionStatus failed: %o", error.message);
      }

      await new Promise((resolve) => {
        timer = setTimeout(() => {
          clearTimeout(timer);
          resolve(true);
        }, interval);
      });
    }

    csl("Solana checkTransactionStatus", "red-500", "checkTransactionStatus failed: timeout");
    return false;
  }

  async simulateIx(ix: any) {
    const connection = this.getConnection();

    const tx = new Transaction().add(ix);

    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.publicKey!;

    // Convert Transaction to VersionedTransaction to use config options
    const message = tx.compileMessage();
    const versionedTx = new VersionedTransaction(message);

    const sim = await connection.simulateTransaction(versionedTx, {
      // commitment: "confirmed",
      sigVerify: false
    });

    if (sim.value.err) console.error("Error:", sim.value.err);

    csl("Solana simulateIx", "purple-400", "sim: %o", sim);

    return sim.value;
  }

  async sendTransaction(params: any) {
    const { transaction } = params;

    const connection = this.getConnection();

    if (!this.publicKey) {
      throw new Error("Wallet not connected");
    }

    if (!transaction) {
      throw new Error("Transaction is required");
    }

    const hasAnySignature = (sig: Uint8Array | Buffer | null | undefined) =>
      !!sig && sig.length > 0 && Array.from(sig).some((byte) => byte !== 0);
    let latestBlockhash: Awaited<ReturnType<Connection["getLatestBlockhash"]>> | null = null;
    let didRefreshBlockhash = false;

    // Only refresh blockhash for unsigned transactions.
    // For pre-signed CCTP txs, mutating recentBlockhash invalidates existing signatures.
    if (transaction instanceof Transaction) {
      const isUnsigned = transaction.signatures.every(({ signature }) => !hasAnySignature(signature as any));
      if (isUnsigned) {
        latestBlockhash = await connection.getLatestBlockhash("confirmed");
        transaction.recentBlockhash = latestBlockhash.blockhash;
        if (!transaction.feePayer) {
          transaction.feePayer = this.publicKey;
        }
        didRefreshBlockhash = true;
      }
    } else if (transaction instanceof VersionedTransaction) {
      const isUnsigned = transaction.signatures.every((signature) => !hasAnySignature(signature));
      if (isUnsigned) {
        latestBlockhash = await connection.getLatestBlockhash("confirmed");
        // web3.js does not expose a convenient mutator here in typings, but runtime object is mutable.
        (transaction.message as any).recentBlockhash = latestBlockhash.blockhash;
        didRefreshBlockhash = true;
      }
    }

    // Sign the transaction
    const signedTransaction = await this.signTransaction(transaction);

    let signature: string;
    try {
      // Send the transaction
      signature = await connection.sendRawTransaction(
        signedTransaction.serialize(),
        {
          skipPreflight: false,
          maxRetries: 3
        }
      );
    } catch (error: any) {
      if (error instanceof SendTransactionError) {
        try {
          const logs = await error.getLogs(connection);
          csl("Solana sendTransaction", "red-500", "sendRawTransaction failed logs: %o", logs);
        } catch (logsError: any) {
          csl("Solana sendTransaction", "red-500", "failed to fetch SendTransactionError logs: %o", logsError?.message || logsError);
        }
      }
      throw error;
    }

    csl("Solana sendTransaction", "green-400", "Transaction sent with signature: %o", signature);

    // // Confirm the transaction
    // // If adding confirmation, you need to catch errors because it may throw a TransactionExpiredBlockheightExceededError.
    // const confirmation = didRefreshBlockhash && latestBlockhash
    //   ? await connection.confirmTransaction(
    //     {
    //       signature,
    //       blockhash: latestBlockhash.blockhash,
    //       lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
    //     },
    //     "confirmed"
    //   )
    //   : await connection.confirmTransaction(signature, "confirmed");

    // if (confirmation.value.err) {
    //   throw new Error(
    //     `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
    //   );
    // }

    return signature;
  }

  /**
   * Sign and send a Rhea Solana tx payload (base64 serialized transaction).
   */
  async sendRheaTx(tx: any) {
    const serialized =
      tx?.transaction ||
      tx?.serializedTransaction ||
      tx?.serialized ||
      (typeof tx === "string" ? tx : null);

    if (!serialized || typeof serialized !== "string") {
      throw new Error("Invalid Solana Rhea tx payload: missing base64 transaction");
    }

    const raw = Buffer.from(serialized, "base64");
    let transaction: Transaction | VersionedTransaction;
    try {
      transaction = VersionedTransaction.deserialize(raw);
    } catch {
      transaction = Transaction.from(raw);
    }

    return this.sendTransaction({ transaction });
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

  async createAssociatedTokenAddress(params: any) {
    const {
      tokenMint,
    } = params;

    const connection = this.getConnection();

    if (!this.publicKey) {
      throw new Error("Wallet not connected");
    }

    const ownerPubkey = this.publicKey;
    const mint = new PublicKey(tokenMint);
    const associatedTokenAccount = getAssociatedTokenAddressSync(mint, ownerPubkey);

    csl("Solana createAssociatedTokenAddress", "purple-400", "associatedTokenAccount: %o", associatedTokenAccount);

    const createTokenAccount = async () => {
      const transaction = new Transaction();

      transaction.add(
        createAssociatedTokenAccountInstruction(
          ownerPubkey,
          associatedTokenAccount,
          ownerPubkey,
          mint
        )
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = ownerPubkey;

      const signedTransaction = await this.signTransaction(transaction);

      const signature = await connection.sendRawTransaction(
        signedTransaction.serialize()
      );

      await this.checkTransactionStatus(signature);

      return associatedTokenAccount;
    };

    try {
      const accountRes = await getAccount(connection, associatedTokenAccount);
      csl("Solana createAssociatedTokenAddress", "purple-400", "associatedTokenAccount account: %o", accountRes);
      return associatedTokenAccount;
    } catch (error) {
      csl("Solana createAssociatedTokenAddress", "red-500", "get ata failed: %o", error);
    }

    return createTokenAccount();
}
}
