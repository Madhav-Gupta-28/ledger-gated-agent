import {
  isAddress,
  parseEther,
  serializeTransaction,
  type Hex,
} from "viem";
import { ACTIVE_CHAIN } from "../config.js";
import { getPublicClient, resolveReadAccount } from "./read.js";
import type { BuiltTransfer, TransferIntent } from "../types.js";

export async function buildTransfer(intent: TransferIntent): Promise<BuiltTransfer> {
  if (!isAddress(intent.to)) {
    throw new Error(`Invalid recipient address: ${intent.to}`);
  }

  const from = resolveReadAccount(intent.from);
  const client = getPublicClient();
  const value = parseEther(intent.amountEth);
  if (value <= 0n) {
    throw new Error("Transfer amount must be greater than zero.");
  }

  const [nonce, gas, fees] = await Promise.all([
    client.getTransactionCount({ address: from }),
    client.estimateGas({ account: from, to: intent.to, value }),
    client.estimateFeesPerGas(),
  ]);

  const maxFeePerGas = fees.maxFeePerGas ?? fees.gasPrice;
  const maxPriorityFeePerGas = fees.maxPriorityFeePerGas ?? 0n;

  if (!maxFeePerGas) {
    throw new Error("RPC did not return a usable gas price.");
  }

  const unsignedTx = serializeTransaction({
    chainId: ACTIVE_CHAIN.id,
    type: "eip1559",
    to: intent.to,
    value,
    nonce,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
  }) as Hex;

  return {
    from,
    to: intent.to,
    amountEth: intent.amountEth,
    unsignedTx,
    nonce,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas,
    chainId: ACTIVE_CHAIN.id,
  };
}
