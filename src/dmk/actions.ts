import {
  DeviceActionStatus,
  UserInteractionRequired,
  type DeviceActionState,
} from "@ledgerhq/device-management-kit";
import type { Observable } from "rxjs";

type DeviceActionReturn<Output, Error, Intermediate> = {
  observable: Observable<DeviceActionState<Output, Error, Intermediate>>;
  cancel: () => void;
};

const DEVICE_PROMPTS: Record<string, string> = {
  [UserInteractionRequired.UnlockDevice]: "Unlock the Ledger and enter the PIN.",
  [UserInteractionRequired.ConfirmOpenApp]:
    "Confirm opening the Ethereum app on the Ledger screen.",
  [UserInteractionRequired.VerifyAddress]:
    "Verify the address on the Ledger screen.",
  [UserInteractionRequired.SignTransaction]:
    "Review and approve the transaction on the Ledger screen.",
  [UserInteractionRequired.Web3ChecksOptIn]:
    "Review the Web3 Checks prompt on the Ledger screen.",
  [UserInteractionRequired.None]: "Processing on Ledger...",
};

export function printDevicePrompt(interaction: string): void {
  const prompt = DEVICE_PROMPTS[interaction] ?? `Check Ledger: ${interaction}`;
  process.stderr.write(`Ledger: ${prompt}\n`);
}

export function isDeviceRejection(error: unknown): boolean {
  const value = error as {
    _tag?: string;
    errorCode?: string;
    originalError?: { errorCode?: string };
  };
  const tag = value?._tag ?? "";
  const code = value?.errorCode ?? value?.originalError?.errorCode ?? "";

  return (
    tag === "RefusedByUserDAError" ||
    code === "5501" ||
    code === "6985" ||
    code === "6982"
  );
}

export function classifyDeviceError(error: unknown): string {
  const value = error as {
    _tag?: string;
    errorCode?: string;
    originalError?: { errorCode?: string };
    message?: string;
  };
  const tag = value?._tag ?? "";
  const code = value?.errorCode ?? value?.originalError?.errorCode ?? "";

  if (tag === "DeviceLockedError" || code === "5515") {
    return "Device locked. Enter your PIN on the Ledger and retry.";
  }
  if (code === "6807") {
    return "Ethereum app is not installed on the Ledger.";
  }
  if (code === "6a80") {
    return "Blind signing is not enabled for this transaction type.";
  }
  if (code === "6e00") {
    return "Wrong app is open. Reopen the Ethereum app and retry.";
  }
  if (tag === "DeviceDisconnectedWhileSendingError") {
    return "Ledger disconnected during the operation.";
  }
  if (tag === "SendApduTimeoutError") {
    return "Timed out while communicating with the Ledger.";
  }
  if (tag === "NoAccessibleDeviceError") {
    return "No accessible Ledger device was found.";
  }

  return value?.message ?? "Unexpected Ledger error.";
}

export async function runDeviceAction<Output, Error, Intermediate>(
  action: DeviceActionReturn<Output, Error, Intermediate>,
  timeoutMs: number,
): Promise<Output> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let lastInteraction = "";

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      action.cancel();
      subscription.unsubscribe();
      reject(new Error("Ledger operation timed out waiting for device approval."));
    }, timeoutMs);

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
      callback();
    };

    const subscription = action.observable.subscribe({
      next: (state) => {
        switch (state.status) {
          case DeviceActionStatus.NotStarted:
            break;
          case DeviceActionStatus.Pending: {
            const requiredInteraction = String(
              (
                state.intermediateValue as {
                  requiredUserInteraction?: string;
                }
              ).requiredUserInteraction ?? UserInteractionRequired.None,
            );
            if (requiredInteraction !== lastInteraction) {
              lastInteraction = requiredInteraction;
              printDevicePrompt(requiredInteraction);
            }
            break;
          }
          case DeviceActionStatus.Completed:
            finish(() => resolve(state.output));
            break;
          case DeviceActionStatus.Error:
            finish(() => reject(state.error));
            break;
          case DeviceActionStatus.Stopped:
            finish(() => reject(new Error("Ledger action stopped.")));
            break;
        }
      },
      error: (error) => finish(() => reject(error)),
    });
  });
}
