export type Hex = `0x${string}`;
export type EthAddress = Hex;

export type BalanceIntent = {
  kind: "balance";
  account?: EthAddress;
};

export type HistoryIntent = {
  kind: "history";
  account?: EthAddress;
};

export type AddressIntent = {
  kind: "address";
  verifyOnDevice: boolean;
};

export type TransferIntent = {
  kind: "transfer";
  to: EthAddress;
  amountEth: string;
  from?: EthAddress;
};

export type HelpIntent = {
  kind: "help";
};

export type QuitIntent = {
  kind: "quit";
};

export type Intent =
  | BalanceIntent
  | HistoryIntent
  | AddressIntent
  | TransferIntent
  | HelpIntent
  | QuitIntent;

export type BalanceResult = {
  account: EthAddress;
  balanceWei: bigint;
  balanceEth: string;
  chainId: number;
};

export type OperationsResult = {
  account: EthAddress;
  transactionCount: number;
  latestBlock: bigint;
  note: string;
};

export type BuiltTransfer = {
  from: EthAddress;
  to: EthAddress;
  amountEth: string;
  unsignedTx: Hex;
  nonce: number;
  gas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  chainId: number;
};

export type SignatureResult =
  | {
      rejected: true;
      reason: string;
    }
  | {
      rejected?: false;
      signature: Hex;
      r: Hex;
      s: Hex;
      v: number;
    };
