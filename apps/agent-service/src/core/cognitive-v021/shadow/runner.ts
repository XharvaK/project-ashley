import type { DatabaseSync } from "node:sqlite";
import type { InboxEvent, KernelDeps, KernelRunResult } from "../types.js";
import { runCognitiveCycle } from "../thought/run.js";

export type ShadowCognitiveTurnInput = {
  sidecar: DatabaseSync;
  nuclear: DatabaseSync;
  event: InboxEvent;
  deps: KernelDeps;
};

export type ShadowKernelRunResult = KernelRunResult & {
  shadow: true;
  error?: string;
};

function fallback(event: InboxEvent, error: unknown): ShadowKernelRunResult {
  return {
    cycleId: event.id,
    generation: 0,
    published: false,
    outboxId: null,
    infrastructureNotice: "shadow_failure",
    thoughtModelAttempts: 0,
    acceptedThoughtPasses: 0,
    composeCancelledAttempts: 0,
    acceptedSettlements: 0,
    shadow: true,
    error: error instanceof Error ? error.message : String(error),
  };
}

/** Capture-only kernel execution. It never receives a delivery projector. */
export async function runShadowCognitiveTurn(
  input: ShadowCognitiveTurnInput,
): Promise<ShadowKernelRunResult> {
  const noProjector = async (): Promise<void> => undefined;
  try {
    const result = await runCognitiveCycle(input.sidecar, input.nuclear, input.event, {
      ...input.deps,
      origin: "shadow",
      projectOutbox: noProjector,
      projectSystemNotice: noProjector,
    });
    return { ...result, shadow: true };
  } catch (error) {
    return fallback(input.event, error);
  }
}
