export const FRAME_VERSION = 1;
export const MAX_FRAME_BYTES = 1_024 * 1_024;
export const MAX_PAYLOAD_BYTES = 256 * 1_024;
export const PAYLOAD_REF_ENTROPY_BYTES = 16;
export const VAULT_SESSION_TTL_MS = 5 * 60 * 1000;
export const DISPATCH_RESERVATION_TTL_MS = 15 * 60 * 1000;
export const RECONCILIATION_LEASE_MS = 7 * 24 * 60 * 60 * 1000;
export const REQUIRED_NETWORK_MODE = "none" as const;
