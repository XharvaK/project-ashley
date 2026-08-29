import { describe, expect, it } from "vitest";
import { openTestSidecar } from "../test-support.js";
import { putInFlight } from "./in-flight.js";
import { recoverInFlight } from "./recovery.js";

describe("v0.2.1 in-flight recovery", () => {
  it("marks orphaned effect attempts unknown without claiming failure", () => {
    const db = openTestSidecar();
    try {
      putInFlight(db, { effectId: "effect-1", cycleId: "cycle-1", generation: 1, correlationId: "corr-1", idempotencyKey: "idem-1", dispatchedAtMs: 1 });
      const recovered = recoverInFlight(db, 2);
      expect(recovered).toMatchObject([{ effectId: "effect-1", status: "unknown" }]);
      expect(recovered[0]?.status).not.toBe("receipted");
    } finally { db.close(); }
  });
});
