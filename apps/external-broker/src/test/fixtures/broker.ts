import { createBroker, type ExternalBroker } from "../../index.js";
import {
  createTestKeys,
  dispatchVerifier,
  forgetVerifier,
  policyVerifier,
  type TestKeyMaterial,
} from "./keys.js";

export function createTestBroker(
  keys: TestKeyMaterial = createTestKeys(),
): { broker: ExternalBroker; keys: TestKeyMaterial } {
  const broker = createBroker({
    ownerId: "owner-1",
    policy: policyVerifier(keys),
    dispatch: dispatchVerifier(keys),
    forget: forgetVerifier(keys),
    vaultMasterKey: keys.vaultMasterKey,
  });
  return { broker, keys };
}

export const testCtx = {
  peerOwnerId: "owner-1",
  ownerId: "owner-1",
  nowMs: Date.now(),
};

export const operatorCtx = {
  ...testCtx,
  operatorLocal: true,
};
