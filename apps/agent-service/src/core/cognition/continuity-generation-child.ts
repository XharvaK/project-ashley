import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getContinuityFor } from "../continuity/registry.js";
import { openNuclearDb } from "../db.js";
import { materializeOpenCognitiveItem } from "./open-items.js";

const [
  dbPath,
  proposalPath,
  readyPath,
  gatePath,
  resultPath,
  attemptPath,
  transactionReadyPath,
  commitGatePath,
] = process.argv.slice(2);

if (!dbPath || !proposalPath || !readyPath || !gatePath || !resultPath) {
  throw new Error("continuity_generation_child_arguments_missing");
}

const db = openNuclearDb(new DatabaseSync(dbPath), { continuityOptional: true });
const continuity = getContinuityFor(db);
db.exec("PRAGMA busy_timeout = 5000");
writeFileSync(readyPath, "ready", "utf8");

try {
  while (!existsSync(gatePath)) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const proposal = JSON.parse(readFileSync(proposalPath, "utf8")) as Parameters<
    typeof materializeOpenCognitiveItem
  >[1];
  const useControlledTransaction =
    attemptPath != null &&
    transactionReadyPath != null &&
    commitGatePath != null;
  if (useControlledTransaction) {
    writeFileSync(attemptPath, "attempting", "utf8");
    db.exec("BEGIN IMMEDIATE");
    writeFileSync(transactionReadyPath, "transaction-ready", "utf8");
    while (!existsSync(commitGatePath)) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  const result = materializeOpenCognitiveItem(db, proposal, {
    inTransaction: useControlledTransaction,
  });
  if (useControlledTransaction) db.exec("COMMIT");
  writeFileSync(resultPath, JSON.stringify({ ok: true, created: result.created }), "utf8");
} catch (error) {
  writeFileSync(
    resultPath,
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
    "utf8",
  );
} finally {
  try {
    db.close();
  } finally {
    continuity?.close();
  }
}
