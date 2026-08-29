import type { DatabaseSync } from "node:sqlite";
import {
  type InboxEvent,
  type KernelDeps,
  type KernelRunResult,
  type OutboxDeliveryProjector,
} from "../types.js";
import { runCognitiveCycle } from "../thought/run.js";
import { createOutboxProjector } from "../delivery/outbox-projector.js";

export type LiveCognitiveTurnInput = {
  sidecar: DatabaseSync;
  nuclear: DatabaseSync;
  event: InboxEvent;
  deps: KernelDeps;
  projector?: OutboxDeliveryProjector;
};

function withProjector(
  deps: KernelDeps,
  projector: OutboxDeliveryProjector | undefined,
): KernelDeps {
  if (!projector) return { ...deps, origin: "live" };
  return {
    ...deps,
    origin: "live",
    projectOutbox: (outboxId) => projector.project(outboxId),
    projectSystemNotice: (noticeId) => projector.projectSystem(noticeId),
  };
}

/**
 * Run one admitted inbox event through the v0.2.1 kernel and then through the
 * nuclear delivery projector. This function has no legacy `/chat/text` path.
 */
export async function runLiveCognitiveTurn(
  input: LiveCognitiveTurnInput,
): Promise<KernelRunResult>;
export async function runLiveCognitiveTurn(
  sidecar: DatabaseSync,
  nuclear: DatabaseSync,
  event: InboxEvent,
  deps: KernelDeps,
): Promise<KernelRunResult>;
export async function runLiveCognitiveTurn(
  inputOrSidecar: LiveCognitiveTurnInput | DatabaseSync,
  nuclear?: DatabaseSync,
  event?: InboxEvent,
  deps?: KernelDeps,
): Promise<KernelRunResult> {
  const input: LiveCognitiveTurnInput = inputOrSidecar instanceof Object &&
    "sidecar" in inputOrSidecar
    ? inputOrSidecar as LiveCognitiveTurnInput
    : {
        sidecar: inputOrSidecar as DatabaseSync,
        nuclear: nuclear!,
        event: event!,
        deps: deps!,
      };
  if (!input.sidecar || !input.nuclear || !input.event || !input.deps) {
    throw new Error("live_cognitive_turn_input_required");
  }
  const projector = input.projector ?? createOutboxProjector(input.sidecar, input.nuclear);
  return runCognitiveCycle(
    input.sidecar,
    input.nuclear,
    input.event,
    withProjector(input.deps, projector),
  );
}

/** Factory form used by the durable inbox worker. */
export function createLiveCognitiveDispatcher(input: {
  sidecar: DatabaseSync;
  nuclear: DatabaseSync;
  deps: KernelDeps;
  projector?: OutboxDeliveryProjector;
}): (event: InboxEvent) => Promise<KernelRunResult> {
  return (event) => runLiveCognitiveTurn({ ...input, event });
}
