import "dotenv/config";
import { defineChain, type Chain } from "viem";

export const ETH_DERIVATION_PATH = "44'/60'/0'/0/0" as const;
export const ETH_APP_NAME = "Ethereum" as const;

export const SPECULOS_URL =
  process.env.SPECULOS_URL?.trim() || "http://localhost:5000";

export const RPC_URL = process.env.RPC_URL?.trim();
export const WATCH_ADDRESS = process.env.WATCH_ADDRESS?.trim();
export const LEDGER_ORIGIN_TOKEN = process.env.LEDGER_ORIGIN_TOKEN?.trim();

const chainId = Number(process.env.CHAIN_ID || 11155111);
const chainName = process.env.CHAIN_NAME?.trim() || "sepolia";

export const ACTIVE_CHAIN: Chain = defineChain({
  id: chainId,
  name: chainName,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: RPC_URL ? [RPC_URL] : ["http://127.0.0.1:8545"],
    },
  },
});

export function requireRpcUrl(): string {
  if (!RPC_URL) {
    throw new Error("RPC_URL is required for chain reads and transaction assembly.");
  }
  return RPC_URL;
}
