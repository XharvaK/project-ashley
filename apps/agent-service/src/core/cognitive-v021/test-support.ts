import { DatabaseSync } from "node:sqlite";
import { openCognitiveSidecarDb } from "./sidecar/db.js";

export function openTestSidecar(): DatabaseSync {
  return openCognitiveSidecarDb(new DatabaseSync(":memory:"), {
    dataPlane: { kind: "isolated" },
  });
}
