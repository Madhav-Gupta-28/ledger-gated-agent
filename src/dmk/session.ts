import {
  DeviceSessionStateType,
  DeviceStatus,
  type DeviceSessionId,
  type DeviceSessionState,
  type DiscoveredDevice,
} from "@ledgerhq/device-management-kit";
import { speculosIdentifier } from "@ledgerhq/device-transport-kit-speculos";
import { firstValueFrom, filter, take, timeout, TimeoutError } from "rxjs";
import { SPECULOS_URL } from "../config.js";
import { dmk } from "./client.js";

const DISCOVERY_TIMEOUT_MS = 15_000;
const BUSY_RECHECK_MS = 10_000;

function isReadyState(state: DeviceSessionState): boolean {
  return (
    state.deviceStatus === DeviceStatus.CONNECTED &&
    state.sessionStateType !== DeviceSessionStateType.Connected
  );
}

async function readSessionState(
  sessionId: DeviceSessionId,
): Promise<DeviceSessionState> {
  return firstValueFrom(dmk.getDeviceSessionState({ sessionId }).pipe(take(1)));
}

async function waitForReadyState(
  sessionId: DeviceSessionId,
  timeoutMs: number,
): Promise<DeviceSessionState> {
  try {
    return await firstValueFrom(
      dmk.getDeviceSessionState({ sessionId }).pipe(
        filter((state) => isReadyState(state)),
        take(1),
        timeout({ first: timeoutMs }),
      ),
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      throw new Error("Ledger session did not become ready in time.");
    }
    throw error;
  }
}

async function discoverSpeculosDevice(): Promise<DiscoveredDevice> {
  let devices: DiscoveredDevice[];
  try {
    devices = await firstValueFrom(
      dmk.listenToAvailableDevices({ transport: speculosIdentifier }).pipe(
        filter((list) => list.length > 0),
        take(1),
        timeout({ first: DISCOVERY_TIMEOUT_MS }),
      ),
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      throw new Error(
        `No Speculos Ledger detected at ${SPECULOS_URL}. Start Speculos with the Ethereum app before hardware-gated commands.`,
      );
    }
    throw error;
  }

  if (devices.length > 1) {
    throw new Error("Multiple Ledger devices detected; select one manually.");
  }

  return devices[0]!;
}

export async function assertDeviceReady(
  sessionId: DeviceSessionId,
): Promise<DeviceSessionState> {
  const state = await readSessionState(sessionId);

  if (isReadyState(state)) {
    return state;
  }

  if (state.deviceStatus === DeviceStatus.LOCKED) {
    throw new Error("Device is locked. Enter the PIN on the Ledger and retry.");
  }

  if (state.deviceStatus === DeviceStatus.BUSY) {
    return waitForReadyState(sessionId, BUSY_RECHECK_MS);
  }

  if (state.deviceStatus === DeviceStatus.NOT_CONNECTED) {
    throw new Error("Device disconnected.");
  }

  return waitForReadyState(sessionId, DISCOVERY_TIMEOUT_MS);
}

export async function openSession(): Promise<DeviceSessionId> {
  let sessionId: DeviceSessionId;
  try {
    const device = await discoverSpeculosDevice();
    sessionId = await dmk.connect({
      device,
      sessionRefresherOptions: {
        isRefresherDisabled: false,
        pollingInterval: 3_000,
      },
    });

    await assertDeviceReady(sessionId);
  } catch (error) {
    throw new Error(
      `Could not open a Speculos Ledger session at ${SPECULOS_URL}. Confirm Docker is running Speculos with apps/ethereum.elf on API port 5000. Original error: ${(error as Error).message}`,
    );
  }

  return sessionId;
}

export async function closeSession(sessionId: DeviceSessionId): Promise<void> {
  await dmk.disconnect({ sessionId });
}
