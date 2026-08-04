export interface AdapterRegistryEntry {
  adapterId: string;
  kind: "fake" | "real";
  available: boolean;
  qualified: boolean;
  networkRequired: boolean;
}

export const ADAPTER_REGISTRY: AdapterRegistryEntry[] = [
  {
    adapterId: "fake-local-v1",
    kind: "fake",
    available: true,
    qualified: true,
    networkRequired: false,
  },
  {
    adapterId: "github-v1",
    kind: "real",
    available: false,
    qualified: false,
    networkRequired: true,
  },
];

export function getAdapterEntry(adapterId: string): AdapterRegistryEntry | undefined {
  return ADAPTER_REGISTRY.find((entry) => entry.adapterId === adapterId);
}

export function assertAdapterAvailable(
  adapterId: string,
): { ok: true; entry: AdapterRegistryEntry } | { ok: false; reason: string } {
  const entry = getAdapterEntry(adapterId);
  if (!entry) {
    return { ok: false, reason: "unknown_adapter" };
  }
  if (!entry.available || !entry.qualified) {
    return { ok: false, reason: "adapter_unavailable" };
  }
  return { ok: true, entry };
}
