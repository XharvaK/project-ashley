import { DatabaseSync } from "node:sqlite";
import {
  isReservedProductionStoragePath,
  type DataPlaneContext,
} from "../../data-plane.js";
import {
  ARCHITECTURE_EPOCH,
  COGNITIVE_SIDECAR_SCHEMA_VERSION,
  IMPLEMENTATION_SPEC_VERSION,
  THOUGHT_CONTRACT_VERSION,
} from "../types.js";
import {
  COGNITIVE_SIDECAR_SCHEMA_V1,
} from "./schema.js";

export type CognitiveSidecarDataPlane = Pick<DataPlaneContext, "kind">;

export type CognitiveSidecarDbOptions = {
  dataPlane: CognitiveSidecarDataPlane;
  migrate?: boolean;
};

export type CognitiveSidecarMeta = {
  id: 1;
  schema_version: number;
  architecture_epoch: string;
  implementation_spec_version: string;
  thought_contract_version: number;
  authority_epoch: number;
};

function sidecarError(code: string, message = code): Error {
  const error = new Error(message) as Error & { code: string };
  error.code = code;
  return error;
}

function databaseMainFile(existing: DatabaseSync): string {
  const rows = existing.prepare("PRAGMA database_list").all() as Array<{
    name?: string;
    file?: string;
  }>;
  return rows.find((row) => row.name === "main")?.file?.trim() ?? "";
}

function userVersion(existing: DatabaseSync): number {
  const row = existing.prepare("PRAGMA user_version").get() as {
    user_version?: number;
  };
  return Number(row.user_version ?? 0);
}

function ensureMeta(existing: DatabaseSync): void {
  const row = existing
    .prepare("SELECT * FROM cognitive_sidecar_meta WHERE id = 1")
    .get() as Partial<CognitiveSidecarMeta> | undefined;
  if (!row) {
    existing
      .prepare(
        `INSERT INTO cognitive_sidecar_meta
           (id, schema_version, architecture_epoch, implementation_spec_version,
            thought_contract_version, authority_epoch)
         VALUES (1, ?, ?, ?, ?, 1)`,
      )
      .run(
        COGNITIVE_SIDECAR_SCHEMA_VERSION,
        ARCHITECTURE_EPOCH,
        IMPLEMENTATION_SPEC_VERSION,
        THOUGHT_CONTRACT_VERSION,
      );
    return;
  }
  if (
    Number(row.schema_version) !== COGNITIVE_SIDECAR_SCHEMA_VERSION ||
    row.architecture_epoch !== ARCHITECTURE_EPOCH ||
    row.implementation_spec_version !== IMPLEMENTATION_SPEC_VERSION ||
    Number(row.thought_contract_version) !== THOUGHT_CONTRACT_VERSION
  ) {
    throw sidecarError("cognitive_sidecar_meta_invalid");
  }
}

/**
 * Open an already-created SQLite handle on the explicitly selected data
 * plane. Sidecar schema application is isolated from nuclear migrations.
 */
export function openCognitiveSidecarDb(
  existing: DatabaseSync,
  options: CognitiveSidecarDbOptions,
): DatabaseSync {
  if (!existing) throw sidecarError("data_plane_required");
  const file = databaseMainFile(existing);
  if (file && isReservedProductionStoragePath(file)) {
    if (options.dataPlane?.kind !== "production") {
      throw sidecarError("production_data_plane_required");
    }
  }

  const version = userVersion(existing);
  if (version > COGNITIVE_SIDECAR_SCHEMA_VERSION) {
    throw sidecarError(
      `unsupported_cognitive_sidecar_schema:${version}>${COGNITIVE_SIDECAR_SCHEMA_VERSION}`,
    );
  }
  if (options.migrate === false) return existing;

  existing.exec("PRAGMA foreign_keys = ON");
  existing.exec("BEGIN IMMEDIATE");
  try {
    existing.exec(COGNITIVE_SIDECAR_SCHEMA_V1);
    existing.exec(`PRAGMA user_version = ${COGNITIVE_SIDECAR_SCHEMA_VERSION}`);
    ensureMeta(existing);
    existing.exec("COMMIT");
  } catch (error) {
    try {
      existing.exec("ROLLBACK");
    } catch {
      // Preserve the original schema error if rollback itself is unavailable.
    }
    throw error;
  }
  return existing;
}

export function readCognitiveSidecarMeta(
  sidecar: DatabaseSync,
): CognitiveSidecarMeta {
  const row = sidecar
    .prepare("SELECT * FROM cognitive_sidecar_meta WHERE id = 1")
    .get() as CognitiveSidecarMeta | undefined;
  if (!row) throw sidecarError("cognitive_sidecar_meta_missing");
  return row;
}

export function updateCognitiveAuthorityEpoch(
  sidecar: DatabaseSync,
  authorityEpoch: number,
): void {
  const result = sidecar
    .prepare(
      "UPDATE cognitive_sidecar_meta SET authority_epoch = ? WHERE id = 1",
    )
    .run(authorityEpoch);
  if (Number(result.changes) !== 1) {
    throw sidecarError("cognitive_sidecar_meta_missing");
  }
}
