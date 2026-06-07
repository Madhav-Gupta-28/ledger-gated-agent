import { type DeviceSessionId } from "@ledgerhq/device-management-kit";
import { formatGwei } from "viem";
import { getBalances, getOperations } from "../chain/read.js";
import { buildTransfer } from "../chain/tx.js";
import { getLedgerAddress, requestSignature } from "../dmk/signer.js";
import type { EthAddress, Intent, TransferIntent } from "../types.js";

type SessionProvider = () => Promise<DeviceSessionId>;

const HELP_TEXT = `Try:
- balance
- balance 0xYourAddress
- history 0xYourAddress
- address
- send 0.01 ETH to 0xRecipientAddress
- quit`;

function sameAddress(left: EthAddress, right: EthAddress): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

async function routeTransfer(
  intent: TransferIntent,
  getSession: SessionProvider,
): Promise<string> {
  const sessionId = await getSession();
  const ledgerAddress = await getLedgerAddress(sessionId, false);
  const transfer = await buildTransfer({
    ...intent,
    from: intent.from ?? ledgerAddress,
  });

  if (!sameAddress(transfer.from, ledgerAddress)) {
    throw new Error(
      `Transfer from ${transfer.from} does not match Ledger address ${ledgerAddress}.`,
    );
  }

  process.stderr.write(
    `\nReview on device: ${transfer.amountEth} ETH -> ${transfer.to}\n` +
      `Unsigned tx nonce ${transfer.nonce}, gas ${transfer.gas.toString()}, ` +
      `max fee ${formatGwei(transfer.maxFeePerGas)} gwei.\n\n`,
  );

  const result = await requestSignature({
    sessionId,
    unsignedTx: transfer.unsignedTx,
  });

  if (result.rejected) {
    return result.reason;
  }

  return [
    "Signed on Ledger.",
    `Signature: ${result.signature}`,
    `r: ${result.r}`,
    `s: ${result.s}`,
    `v: ${result.v}`,
    "Broadcasting is intentionally left manual for the demo.",
  ].join("\n");
}

export async function route(
  intent: Intent,
  getSession: SessionProvider,
): Promise<string> {
  switch (intent.kind) {
    case "balance": {
      const balance = await getBalances(intent.account);
      return `${balance.account} has ${balance.balanceEth} ETH on chain ${balance.chainId}.`;
    }
    case "history": {
      const operations = await getOperations(intent.account);
      return [
        `${operations.account} transaction count: ${operations.transactionCount}`,
        `Latest block: ${operations.latestBlock.toString()}`,
        operations.note,
      ].join("\n");
    }
    case "address": {
      const sessionId = await getSession();
      const address = await getLedgerAddress(sessionId, intent.verifyOnDevice);
      return `Ledger address: ${address}`;
    }
    case "transfer":
      return routeTransfer(intent, getSession);
    case "quit":
      return "Goodbye.";
    case "help":
      return HELP_TEXT;
  }
}
