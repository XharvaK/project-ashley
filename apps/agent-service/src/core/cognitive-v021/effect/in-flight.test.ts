import { describe, expect, it } from "vitest";
import { getInFlight, markInFlightUnknown, putInFlight } from "./in-flight.js";
import { openTestSidecar } from "../test-support.js";

describe("v0.2.1 in-flight effect pointers", () => {
  it("deduplicates by idempotency key and preserves unknown timeout", () => {
    const db = openTestSidecar();
    try {
      const first = putInFlight(db, {
        effectId: "effect-1", cycleId: "cycle-1", generation: 1, correlationId: "corr-1",
        idempotencyKey: "idem-1", dispatchedAtMs: 10,
      });
      const duplicate = putInFlight(db, {
        effectId: "effect-2", cycleId: "cycle-1", generation: 1, correlationId: "corr-2",
        idempotencyKey: "idem-1", dispatchedAtMs: 11,
      });
      expect(duplicate.effectId).toBe(first.effectId);
      markInFlightUnknown(db, first.effectId, 20);
      expect(getInFlight(db, first.effectId)).toMatchObject({ status: "unknown" });
    } finally {
      db.close();
    }
  });
});
