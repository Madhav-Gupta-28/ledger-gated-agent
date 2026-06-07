import { type DeviceSessionId } from "@ledgerhq/device-management-kit";
import { SignerEthBuilder, type Signature } from "@ledgerhq/device-signer-kit-ethereum";
import { hexToBytes } from "viem";
import {
  ETH_DERIVATION_PATH,
  LEDGER_ORIGIN_TOKEN,
} from "../config.js";
import type { Hex, SignatureResult } from "../types.js";
import { dmk } from "./client.js";
import {
  classifyDeviceError,
  isDeviceRejection,
  runDeviceAction,
} from "./actions.js";
import { assertDeviceReady } from "./session.js";

const SIGNING_TIMEOUT_MS = 60_000;
const ADDRESS_TIMEOUT_MS = 60_000;

function buildSigner(sessionId: DeviceSessionId) {
  return new SignerEthBuilder({
    dmk,
    sessionId,
    originToken: LEDGER_ORIGIN_TOKEN || undefined,
  }).build();
}

function toHexSignature(signature: Signature): Hex {
  const r = signature.r.replace(/^0x/, "");
  const s = signature.s.replace(/^0x/, "");
  const v = signature.v.toString(16).padStart(2, "0");
  return `0x${r}${s}${v}`;
}

export async function getLedgerAddress(
  sessionId: DeviceSessionId,
  verifyOnDevice: boolean,
): Promise<Hex> {
  await assertDeviceReady(sessionId);
  const signer = buildSigner(sessionId);
  const output = await runDeviceAction(
    signer.getAddress(ETH_DERIVATION_PATH, {
      checkOnDevice: verifyOnDevice,
    }),
    ADDRESS_TIMEOUT_MS,
  );

  return output.address as Hex;
}

export async function requestSignature(params: {
  sessionId: DeviceSessionId;
  unsignedTx: Hex;
}): Promise<SignatureResult> {
  await assertDeviceReady(params.sessionId);
  const signer = buildSigner(params.sessionId);

  try {
    const output = await runDeviceAction(
      signer.signTransaction(ETH_DERIVATION_PATH, hexToBytes(params.unsignedTx)),
      SIGNING_TIMEOUT_MS,
    );

    return {
      signature: toHexSignature(output),
      r: output.r as Hex,
      s: output.s as Hex,
      v: output.v,
    };
  } catch (error) {
    if (isDeviceRejection(error)) {
      return {
        rejected: true,
        reason: "Action cancelled on device. No funds moved.",
      };
    }

    throw new Error(classifyDeviceError(error));
  }
}
