import { REQUIRED_NETWORK_MODE } from "../constants/limits.js";

export function assertNetworkModeNone(
  networkMode: string,
): { ok: true } | { ok: false; reason: string } {
  if (networkMode !== REQUIRED_NETWORK_MODE) {
    return { ok: false, reason: "invalid_network_mode" };
  }
  return { ok: true };
}
