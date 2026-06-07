import { DeviceManagementKitBuilder } from "@ledgerhq/device-management-kit";
import { speculosTransportFactory } from "@ledgerhq/device-transport-kit-speculos";
import { SPECULOS_URL } from "../config.js";

export const dmk = new DeviceManagementKitBuilder()
  .addTransport(speculosTransportFactory(SPECULOS_URL))
  .build();
