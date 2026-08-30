import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const DERIVED_INDEX_SCHEMA_VERSION = 1;

export function defaultDerivedIndexDbPath(): string {
  return join(homedir(), ".composer-assistant", "cognitive-v021-derived-index.db");
}

function sha256(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

export function computeMemorySourceHash(sidecarDb: DatabaseSync): { hash: string; count: number } {
  const rows = sidecarDb.prepare(`
    SELECT assertion_key, content_hash
    FROM sidecar_memory_assertions
    WHERE data_classification IN ('ordinary', 'sensitive', 'never_public')
      AND statement IS NOT NULL
      AND statement != '[redacted]'
    ORDER BY assertion_key ASC
  `).all() as Array<{ assertion_key: string; content_hash: string }>;

  const payload = rows.map((r) => `${r.assertion_key}:${r.content_hash}`).join("\n");
  return {
    hash: sha256(payload),
    count: rows.length,
  };
}

export function computeConversationSourceHash(sidecarDb: DatabaseSync): { hash: string; count: number } {
  const rows = sidecarDb.prepare(`
    SELECT row_id, content_hash, version
    FROM conversation_evidence_log
    WHERE data_classification IN ('ordinary', 'sensitive', 'never_public')
      AND text IS NOT NULL
      AND text != '[redacted]'
    ORDER BY row_id ASC
  `).all() as Array<{ row_id: string; content_hash: string; version: number }>;

  const payload = rows.map((r) => `${r.row_id}:${r.content_hash}:${r.version}`).join("\n");
  return {
    hash: sha256(payload),
    count: rows.length,
  };
}

export class DerivedStore {
  readonly db: DatabaseSync;
  private readonly dbPath: string;

  constructor(dbOrPath?: string | DatabaseSync) {
    if (typeof dbOrPath === "object" && dbOrPath !== null) {
      this.db = dbOrPath;
      this.dbPath = ":memory:";
    } else {
      this.dbPath = dbOrPath ?? defaultDerivedIndexDbPath();
      if (this.dbPath !== ":memory:") {
        const parent = dirname(this.dbPath);
        if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
      }
      this.db = new DatabaseSync(this.dbPath);
    }
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        assertion_key UNINDEXED,
        statement,
        memory_kind UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 1'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS conversation_fts USING fts5(
        row_id UNINDEXED,
        conversation_id UNINDEXED,
        text,
        tokenize = 'unicode61 remove_diacritics 1'
      );

      CREATE TABLE IF NOT EXISTS fts_index_state (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        generation INTEGER NOT NULL,
        sidecar_assertion_count INTEGER NOT NULL,
        sidecar_conversation_count INTEGER NOT NULL,
        memory_source_hash TEXT NOT NULL,
        conversation_source_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'valid' CHECK(status IN ('valid', 'invalid')),
        updated_at_ms INTEGER NOT NULL
      );
    `);
  }

  getIndexState(): {
    generation: number;
    sidecarAssertionCount: number;
    sidecarConversationCount: number;
    memorySourceHash: string;
    conversationSourceHash: string;
    status: "valid" | "invalid";
    updatedAtMs: number;
  } | null {
    const row = this.db.prepare("SELECT * FROM fts_index_state WHERE id = 1").get() as {
      generation: number;
      sidecar_assertion_count: number;
      sidecar_conversation_count: number;
      memory_source_hash: string;
      conversation_source_hash: string;
      status: string;
      updated_at_ms: number;
    } | undefined;

    if (!row) return null;
    return {
      generation: row.generation,
      sidecarAssertionCount: row.sidecar_assertion_count,
      sidecarConversationCount: row.sidecar_conversation_count,
      memorySourceHash: row.memory_source_hash,
      conversationSourceHash: row.conversation_source_hash,
      status: row.status as "valid" | "invalid",
      updatedAtMs: row.updated_at_ms,
    };
  }

  markInvalid(): void {
    const now = Date.now();
    try {
      this.db.prepare(`
        INSERT INTO fts_index_state (id, generation, sidecar_assertion_count, sidecar_conversation_count, memory_source_hash, conversation_source_hash, status, updated_at_ms)
        VALUES (1, 1, 0, 0, '', '', 'invalid', ?)
        ON CONFLICT(id) DO UPDATE SET status = 'invalid', updated_at_ms = ?
      `).run(now, now);
    } catch {
      // Ignore if marking fails
    }
  }

  checkIntegrity(): { ok: boolean; pragma: string; memoryFts: string; conversationFts: string } {
    let pragma = "error";
    let memoryFts = "error";
    let conversationFts = "error";

    try {
      const pragmaRow = this.db.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
      pragma = pragmaRow?.integrity_check ?? "unknown";

      this.db.exec("INSERT INTO memory_fts(memory_fts) VALUES('integrity-check');");
      memoryFts = "ok";

      this.db.exec("INSERT INTO conversation_fts(conversation_fts) VALUES('integrity-check');");
      conversationFts = "ok";
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (memoryFts !== "ok") memoryFts = err.message;
        else if (conversationFts !== "ok") conversationFts = err.message;
      }
    }

    const ok = pragma === "ok" && memoryFts === "ok" && conversationFts === "ok";
    return { ok, pragma, memoryFts, conversationFts };
  }

  /**
   * Fast readiness check.
   * If the index status is valid, returns true without scanning the sidecar source tables (O(1)).
   * If the index is missing or marked invalid, performs synchronous reconciliation/rebuild.
   */
  isReady(sidecarDb: DatabaseSync): boolean {
    try {
      const state = this.getIndexState();
      if (state && state.status === "valid") {
        return true;
      }
      return this.reconcile(sidecarDb);
    } catch {
      this.markInvalid();
      return false;
    }
  }

  /**
   * Full source-fingerprint reconciliation.
   * Used for startup, recovery, and invalid-state detection.
   */
  reconcile(sidecarDb: DatabaseSync): boolean {
    try {
      const state = this.getIndexState();
      const mem = computeMemorySourceHash(sidecarDb);
      const conv = computeConversationSourceHash(sidecarDb);

      if (
        state &&
        state.status === "valid" &&
        state.memorySourceHash === mem.hash &&
        state.conversationSourceHash === conv.hash &&
        state.sidecarAssertionCount === mem.count &&
        state.sidecarConversationCount === conv.count
      ) {
        return true;
      }

      this.rebuild(sidecarDb, mem, conv);
      return true;
    } catch {
      this.markInvalid();
      return false;
    }
  }

  /**
   * Explicit startup and crash-gap recovery reconciliation.
   * Compares authoritative sidecar source fingerprints against persisted derived fingerprints.
   * Rebuilds if fingerprints differ or status is invalid.
   */
  reconcileAtStartup(sidecarDb: DatabaseSync): boolean {
    return this.reconcile(sidecarDb);
  }

  reconcileIfNeeded(sidecarDb: DatabaseSync): boolean {
    return this.reconcile(sidecarDb);
  }

  rebuild(
    sidecarDb: DatabaseSync,
    precomputedMem?: { hash: string; count: number },
    precomputedConv?: { hash: string; count: number },
  ): void {
    const mem = precomputedMem ?? computeMemorySourceHash(sidecarDb);
    const conv = precomputedConv ?? computeConversationSourceHash(sidecarDb);

    const memRows = sidecarDb.prepare(`
      SELECT assertion_key, statement, memory_kind
      FROM sidecar_memory_assertions
      WHERE data_classification IN ('ordinary', 'sensitive', 'never_public')
        AND statement IS NOT NULL
        AND statement != '[redacted]'
    `).all() as Array<{ assertion_key: string; statement: string; memory_kind: string }>;

    const convRows = sidecarDb.prepare(`
      SELECT row_id, conversation_id, text
      FROM conversation_evidence_log
      WHERE data_classification IN ('ordinary', 'sensitive', 'never_public')
        AND text IS NOT NULL
        AND text != '[redacted]'
    `).all() as Array<{ row_id: string; conversation_id: string; text: string }>;

    const priorState = this.getIndexState();
    const nextGen = (priorState?.generation ?? 0) + 1;
    const now = Date.now();

    this.db.exec("BEGIN IMMEDIATE;");
    try {
      this.db.exec("DELETE FROM memory_fts;");
      const insertMem = this.db.prepare(
        "INSERT INTO memory_fts (assertion_key, statement, memory_kind) VALUES (?, ?, ?)",
      );
      for (const row of memRows) {
        insertMem.run(row.assertion_key, row.statement, row.memory_kind);
      }

      this.db.exec("DELETE FROM conversation_fts;");
      const insertConv = this.db.prepare(
        "INSERT INTO conversation_fts (row_id, conversation_id, text) VALUES (?, ?, ?)",
      );
      for (const row of convRows) {
        insertConv.run(row.row_id, row.conversation_id, row.text);
      }

      this.db.prepare(`
        INSERT INTO fts_index_state (id, generation, sidecar_assertion_count, sidecar_conversation_count, memory_source_hash, conversation_source_hash, status, updated_at_ms)
        VALUES (1, ?, ?, ?, ?, ?, 'valid', ?)
        ON CONFLICT(id) DO UPDATE SET
          generation = excluded.generation,
          sidecar_assertion_count = excluded.sidecar_assertion_count,
          sidecar_conversation_count = excluded.sidecar_conversation_count,
          memory_source_hash = excluded.memory_source_hash,
          conversation_source_hash = excluded.conversation_source_hash,
          status = 'valid',
          updated_at_ms = excluded.updated_at_ms
      `).run(nextGen, mem.count, conv.count, mem.hash, conv.hash, now);

      this.db.exec("COMMIT;");
    } catch (err) {
      try {
        this.db.exec("ROLLBACK;");
      } catch {
        // preserve write error
      }
      this.markInvalid();
      throw err;
    }
  }

  syncAfterCommit(
    sidecarDb: DatabaseSync,
    changes: { changedAssertionKeys?: string[]; changedRowIds?: string[] },
  ): void {
    const changedKeys = changes.changedAssertionKeys ?? [];
    const changedRowIds = changes.changedRowIds ?? [];

    if (changedKeys.length === 0 && changedRowIds.length === 0) {
      return;
    }

    try {
      this.db.exec("BEGIN IMMEDIATE;");

      if (changedKeys.length > 0) {
        const deleteMem = this.db.prepare("DELETE FROM memory_fts WHERE assertion_key = ?");
        const selectMem = sidecarDb.prepare(`
          SELECT assertion_key, statement, memory_kind, data_classification
          FROM sidecar_memory_assertions
          WHERE assertion_key = ?
        `);
        const insertMem = this.db.prepare(
          "INSERT INTO memory_fts (assertion_key, statement, memory_kind) VALUES (?, ?, ?)",
        );

        for (const key of changedKeys) {
          deleteMem.run(key);
          const row = selectMem.get(key) as {
            assertion_key: string;
            statement: string;
            memory_kind: string;
            data_classification: string;
          } | undefined;

          if (
            row &&
            row.data_classification !== "secret" &&
            row.statement &&
            row.statement !== "[redacted]"
          ) {
            insertMem.run(row.assertion_key, row.statement, row.memory_kind);
          }
        }
      }

      if (changedRowIds.length > 0) {
        const deleteConv = this.db.prepare("DELETE FROM conversation_fts WHERE row_id = ?");
        const selectConv = sidecarDb.prepare(`
          SELECT row_id, conversation_id, text, data_classification
          FROM conversation_evidence_log
          WHERE row_id = ?
        `);
        const insertConv = this.db.prepare(
          "INSERT INTO conversation_fts (row_id, conversation_id, text) VALUES (?, ?, ?)",
        );

        for (const rowId of changedRowIds) {
          deleteConv.run(rowId);
          const row = selectConv.get(rowId) as {
            row_id: string;
            conversation_id: string;
            text: string;
            data_classification: string;
          } | undefined;

          if (
            row &&
            row.data_classification !== "secret" &&
            row.text &&
            row.text !== "[redacted]"
          ) {
            insertConv.run(row.row_id, row.conversation_id, row.text);
          }
        }
      }

      const priorState = this.getIndexState();
      const nextGen = (priorState?.generation ?? 0) + 1;
      const now = Date.now();

      this.db.prepare(`
        INSERT INTO fts_index_state (id, generation, sidecar_assertion_count, sidecar_conversation_count, memory_source_hash, conversation_source_hash, status, updated_at_ms)
        VALUES (1, ?, ?, ?, ?, ?, 'valid', ?)
        ON CONFLICT(id) DO UPDATE SET
          generation = excluded.generation,
          status = 'valid',
          updated_at_ms = excluded.updated_at_ms
      `).run(nextGen, priorState?.sidecarAssertionCount ?? 0, priorState?.sidecarConversationCount ?? 0, priorState?.memorySourceHash ?? "", priorState?.conversationSourceHash ?? "", now);

      this.db.exec("COMMIT;");
    } catch {
      try {
        this.db.exec("ROLLBACK;");
      } catch {
        // Ignore rollback failure if already inactive
      }
      this.markInvalid();
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      // Ignore close errors
    }
  }
}

const syncSubscribers = new WeakMap<DatabaseSync, Set<DerivedStore>>();

export function registerDerivedStoreForSidecar(
  sidecarDb: DatabaseSync,
  derivedStore: DerivedStore,
): () => void {
  let set = syncSubscribers.get(sidecarDb);
  if (!set) {
    set = new Set();
    syncSubscribers.set(sidecarDb, set);
  }
  set.add(derivedStore);
  return () => {
    set?.delete(derivedStore);
  };
}

export function notifySidecarPostCommit(
  sidecarDb: DatabaseSync,
  changes: { changedAssertionKeys?: string[]; changedRowIds?: string[] },
): void {
  const stores = syncSubscribers.get(sidecarDb);
  if (!stores || stores.size === 0) return;
  for (const store of stores) {
    try {
      store.syncAfterCommit(sidecarDb, changes);
    } catch {
      store.markInvalid();
    }
  }
}

export function openDerivedStore(dbOrPath?: string | DatabaseSync): DerivedStore {
  return new DerivedStore(dbOrPath);
}
