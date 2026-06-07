import {
  createPublicClient,
  formatEther,
  http,
  isAddress,
  type PublicClient,
} from "viem";
import { ACTIVE_CHAIN, requireRpcUrl, WATCH_ADDRESS } from "../config.js";
import type { BalanceResult, EthAddress, OperationsResult } from "../types.js";

let publicClient: PublicClient | undefined;

export function getPublicClient(): PublicClient {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: ACTIVE_CHAIN,
      transport: http(requireRpcUrl()),
    });
  }

  return publicClient;
}

export function resolveReadAccount(account?: EthAddress): EthAddress {
  const resolved = account ?? WATCH_ADDRESS;
  if (!resolved) {
    throw new Error(
      "No account supplied. Set WATCH_ADDRESS or ask for a specific 0x address.",
    );
  }

  if (!isAddress(resolved)) {
    throw new Error(`Invalid Ethereum address: ${resolved}`);
  }

  return resolved;
}

export async function getBalances(account?: EthAddress): Promise<BalanceResult> {
  const resolvedAccount = resolveReadAccount(account);
  const client = getPublicClient();
  const balanceWei = await client.getBalance({ address: resolvedAccount });

  return {
    account: resolvedAccount,
    balanceWei,
    balanceEth: formatEther(balanceWei),
    chainId: ACTIVE_CHAIN.id,
  };
}

export async function getOperations(
  account?: EthAddress,
): Promise<OperationsResult> {
  const resolvedAccount = resolveReadAccount(account);
  const client = getPublicClient();
  const [transactionCount, latestBlock] = await Promise.all([
    client.getTransactionCount({ address: resolvedAccount }),
    client.getBlockNumber(),
  ]);

  return {
    account: resolvedAccount,
    transactionCount,
    latestBlock,
    note: "Standard JSON-RPC exposes nonce/chain state, not full account history. Add an indexer for explorer-style history.",
  };
}
