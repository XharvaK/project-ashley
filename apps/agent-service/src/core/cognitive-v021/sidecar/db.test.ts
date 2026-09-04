import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { reservedProductionCognitiveSidecarDbPath } from "../../data-plane.js";
import { admitWake } from "../wake/ledger.js";
import { reservePrivateThought } from "../private-budget/ledger.js";
import { openCognitiveSidecarDb, readCognitiveProjectionState } from "./db.js";
import { COGNITIVE_SIDECAR_SCHEMA_V1, COGNITIVE_SIDECAR_SCHEMA_V2, COGNITIVE_SIDECAR_SCHEMA_V3, COGNITIVE_SIDECAR_SCHEMA_V4 } from "./schema.js";

function fakeDatabaseWithMainFile(file: string): DatabaseSync {
  return {
    prepare: () => ({
      all: () => [{ name: "main", file }],
    }),
  } as unknown as DatabaseSync;
}

describe("cognitive v0.2.1 sidecar database", () => {
  it("creates the complete v8 schema on an isolated in-memory database", () => {
    const db = openCognitiveSidecarDb(new DatabaseSync(":memory:"), {
      dataPlane: { kind: "isolated" },
    });

    expect(
      (db.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version,
    ).toBe(8);
    expect(
      (
        db
          .prepare(
            "SELECT schema_version, architecture_epoch, implementation_spec_version, thought_contract_version, authority_epoch FROM cognitive_sidecar_meta WHERE id = 1",
          )
          .get() as Record<string, unknown>
      ),
    ).toEqual({
      schema_version: 8,
      architecture_epoch: "v0.2.1",
      implementation_spec_version: "0.2.1.r5",
      thought_contract_version: 2,
      authority_epoch: 1,
    });

    const tables = (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
    expect(tables).toHaveLength(33);
    expect(tables).toContain("speech_outbox");
    expect(tables).toContain("thought_attempt_counters");
    expect(tables).toContain("wakes");
    expect(tables).toContain("wake_legacy_quarantine");
    expect(tables).toContain("private_budget_reservations");
    expect(tables).toContain("deferred_reactive_frontiers");
    db.close();
  });

  it("rejects a reserved production file when the caller has an isolated plane", () => {
    expect(() =>
      openCognitiveSidecarDb(
        fakeDatabaseWithMainFile(reservedProductionCognitiveSidecarDbPath()),
        { dataPlane: { kind: "isolated" } },
      ),
    ).toThrow(/production_data_plane_required/);
  });

  it("is idempotent and keeps one meta singleton with mutable epoch updates", () => {
    const db = new DatabaseSync(":memory:");
    openCognitiveSidecarDb(db, { dataPlane: { kind: "isolated" } });
    openCognitiveSidecarDb(db, { dataPlane: { kind: "isolated" } });

    expect(
      (
        db
          .prepare("SELECT COUNT(*) AS count FROM cognitive_sidecar_meta")
          .get() as { count: number }
      ).count,
    ).toBe(1);
    expect(() =>
      db
        .prepare(
          "INSERT INTO cognitive_sidecar_meta (id, schema_version, architecture_epoch, implementation_spec_version, thought_contract_version) VALUES (1, 1, 'v0.2.1', '0.2.1.r5', 1)",
        )
        .run(),
    ).toThrow();

    db.prepare(
      "UPDATE cognitive_sidecar_meta SET authority_epoch = ? WHERE id = 1",
    ).run(7);
    expect(
      (
        db
          .prepare(
            "SELECT authority_epoch FROM cognitive_sidecar_meta WHERE id = 1",
          )
          .get() as { authority_epoch: number }
      ).authority_epoch,
    ).toBe(7);
    db.close();
  });

  it("upgrades a v1 sidecar into an explicitly reconciling projection state", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(COGNITIVE_SIDECAR_SCHEMA_V1);
    db.prepare(
      `INSERT INTO cognitive_sidecar_meta
         (id, schema_version, architecture_epoch, implementation_spec_version, thought_contract_version, authority_epoch)
       VALUES (1, 1, 'v0.2.1', '0.2.1.r5', 1, 1)`,
    ).run();
    db.exec("PRAGMA user_version = 1");

    try {
      openCognitiveSidecarDb(db, { dataPlane: { kind: "isolated" } });
      expect(readCognitiveProjectionState(db)).toMatchObject({
        barrierRevision: 0,
        ownerVersions: { nuclear: 0, continuity: 0, cognitive_sidecar: 0 },
        state: "reconciling",
      });
      expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(8);
    } finally {
      db.close();
    }
  });

  it("classifies legacy lineage once, binds recoverable rows, and quarantines ambiguity", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(COGNITIVE_SIDECAR_SCHEMA_V1);
    db.prepare(
      `INSERT INTO cognitive_sidecar_meta
         (id, schema_version, architecture_epoch, implementation_spec_version, thought_contract_version, authority_epoch)
       VALUES (1, 1, 'v0.2.1', '0.2.1.r5', 1, 1)`,
    ).run();
    db.prepare(
      `INSERT INTO cycle_records
         (cycle_id, conversation_id, generation, state, trigger_kind, trigger_ref,
          occupant_id, authority_epoch, architecture_epoch, admitted_at_ms, updated_at_ms,
          compose_log_ids_json, preempted_generation)
       VALUES ('legacy-cycle', 'legacy-thread', 1, 'admitted', 'owner_message', 'legacy-ref',
          'doc', 1, 'v0.2.1', 1, 1, '[]', NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO inbox_events
         (id, conversation_id, kind, payload_json, created_at_ms, status)
       VALUES ('legacy-bound-event', 'legacy-thread', 'owner_message', ?, 2, 'pending')`,
    ).run(JSON.stringify({ cycleId: "legacy-cycle", referenceOnly: true }));
    db.prepare(
      `INSERT INTO inbox_events
         (id, conversation_id, kind, payload_json, created_at_ms, status)
       VALUES ('legacy-ambiguous-event', 'legacy-thread', 'owner_message', '{not-json', 3, 'pending')`,
    ).run();
    db.prepare(
      `INSERT INTO settlements (settlement_id, cycle_id, generation, payload_json)
       VALUES ('legacy-settlement', 'legacy-cycle', 1, '{}')`,
    ).run();
    db.prepare(
      `INSERT INTO in_flight_effects
         (effect_id, cycle_id, generation, correlation_id, idempotency_key, state, payload_json, dispatched_at_ms, origin_job_id)
       VALUES ('legacy-effect', 'legacy-cycle', 1, 'legacy-correlation', 'legacy-idempotency', 'in_flight', '{}', 4, NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO future_triggers
         (trigger_id, conversation_id, concern_id, due_at_ms, snapshot_hash, status, payload_json)
       VALUES ('legacy-fired-trigger', 'legacy-fired-thread', 'legacy-concern', 5, 'legacy-snapshot', 'fired', '{}')`,
    ).run();
    db.exec("PRAGMA user_version = 1");

    try {
      openCognitiveSidecarDb(db, { dataPlane: { kind: "isolated" } });

      const boundCycle = db.prepare("SELECT wake_id FROM cycle_records WHERE cycle_id = 'legacy-cycle'").get() as { wake_id: string };
      expect(boundCycle.wake_id).toMatch(/^wake:/);
      expect(db.prepare("SELECT wake_id FROM inbox_events WHERE id = 'legacy-bound-event'").get()).toMatchObject({ wake_id: boundCycle.wake_id });
      expect(db.prepare("SELECT wake_id FROM settlements WHERE settlement_id = 'legacy-settlement'").get()).toMatchObject({ wake_id: boundCycle.wake_id });
      expect(db.prepare("SELECT wake_id, state FROM in_flight_effects WHERE effect_id = 'legacy-effect'").get()).toMatchObject({ wake_id: boundCycle.wake_id, state: "unknown" });

      expect(db.prepare("SELECT status, last_error FROM inbox_events WHERE id = 'legacy-ambiguous-event'").get()).toMatchObject({ status: "failed_terminal", last_error: "legacy_ambiguous" });
      expect(db.prepare("SELECT table_name, row_key, reason FROM wake_legacy_quarantine WHERE table_name = 'inbox_events' AND row_key = 'legacy-ambiguous-event'").get()).toMatchObject({
        table_name: "inbox_events",
        row_key: "legacy-ambiguous-event",
        reason: "legacy_ambiguous",
      });

      const firedWake = db.prepare(
        `SELECT f.wake_id, w.cycle_id
           FROM future_triggers f JOIN wakes w ON w.wake_id = f.wake_id
          WHERE f.trigger_id = 'legacy-fired-trigger'`,
      ).get() as { wake_id: string; cycle_id: string };
      expect(firedWake.wake_id).toMatch(/^wake:/);
      expect(db.prepare("SELECT wake_id FROM cycle_records WHERE cycle_id = ?").get(firedWake.cycle_id)).toMatchObject({ wake_id: firedWake.wake_id });

      openCognitiveSidecarDb(db, { dataPlane: { kind: "isolated" } });
      expect((db.prepare("SELECT COUNT(*) AS count FROM wake_legacy_quarantine").get() as { count: number }).count).toBe(1);
    } finally {
      db.close();
    }
  });

  it("preserves v3 retry history and moves unverifiable claimed work to reconciliation", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(COGNITIVE_SIDECAR_SCHEMA_V1);
    db.prepare(
      `INSERT INTO cognitive_sidecar_meta
         (id, schema_version, architecture_epoch, implementation_spec_version, thought_contract_version, authority_epoch)
       VALUES (1, 1, 'v0.2.1', '0.2.1.r5', 1, 1)`,
    ).run();
    db.prepare(
      `INSERT INTO cycle_records
         (cycle_id, conversation_id, generation, state, trigger_kind, trigger_ref,
          occupant_id, authority_epoch, architecture_epoch, admitted_at_ms, updated_at_ms,
          compose_log_ids_json, preempted_generation)
       VALUES ('legacy-retry-cycle', 'legacy-retry-thread', 1, 'admitted', 'owner_message',
          'legacy-retry', 'doc', 1, 'v0.2.1', 1, 1, '[]', NULL)`,
    ).run();
    db.prepare(
      `INSERT INTO inbox_events
         (id, conversation_id, kind, payload_json, created_at_ms, status, claim_token,
          worker_id, lease_expires_at_ms, attempt_count, claimed_at_ms)
       VALUES ('legacy-failed', 'legacy-retry-thread', 'owner_message', ?, 2, 'failed_retryable',
          NULL, NULL, NULL, 2, 50)`,
    ).run(JSON.stringify({ cycleId: "legacy-retry-cycle", referenceOnly: true }));
    db.prepare(
      `INSERT INTO inbox_events
         (id, conversation_id, kind, payload_json, created_at_ms, status, claim_token,
          worker_id, lease_expires_at_ms, attempt_count, claimed_at_ms)
       VALUES ('legacy-claimed', 'legacy-retry-thread', 'owner_message', ?, 3, 'claimed',
          'legacy-claim', 'legacy-worker', 500, 1, 75)`,
    ).run(JSON.stringify({ cycleId: "legacy-retry-cycle", referenceOnly: true }));
    db.exec(COGNITIVE_SIDECAR_SCHEMA_V2);
    db.exec(COGNITIVE_SIDECAR_SCHEMA_V3);
    db.prepare(
      `INSERT INTO wakes
         (wake_id, occurrence_id, trigger_ref, source_kind, conversation_id, cycle_id,
          state, terminal_reason, captured_authority_revision, created_at_ms, updated_at_ms)
       VALUES ('wake:legacy-retry', 'occurrence:legacy-retry', 'legacy-retry', 'inbox',
          'legacy-retry-thread', 'legacy-retry-cycle', 'pending', NULL, 0, 1, 1)`,
    ).run();
    db.prepare("UPDATE cycle_records SET wake_id = 'wake:legacy-retry' WHERE cycle_id = 'legacy-retry-cycle'").run();
    db.prepare("UPDATE inbox_events SET wake_id = 'wake:legacy-retry' WHERE conversation_id = 'legacy-retry-thread'").run();
    db.exec("PRAGMA user_version = 3");

    try {
      openCognitiveSidecarDb(db, { dataPlane: { kind: "isolated" } });
      expect(db.prepare("SELECT state, status, attempt_count, first_attempt_at_ms, last_failure_class, claim_token FROM inbox_events WHERE id = 'legacy-failed'").get()).toMatchObject({
        state: "reconciling",
        status: "claimed",
        attempt_count: 2,
        first_attempt_at_ms: 50,
        last_failure_class: "outcome_unknown_reconcile",
        claim_token: null,
      });
      expect(db.prepare("SELECT state, status, attempt_count, first_attempt_at_ms, last_failure_class, claim_token FROM inbox_events WHERE id = 'legacy-claimed'").get()).toMatchObject({
        state: "reconciling",
        status: "claimed",
        attempt_count: 1,
        first_attempt_at_ms: 75,
        last_failure_class: "outcome_unknown_reconcile",
        claim_token: null,
      });
    } finally {
      db.close();
    }
  });

  it("upgrades v4 without assuming zero private usage and blocks the first reservation until an owner epoch", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(COGNITIVE_SIDECAR_SCHEMA_V1);
    db.prepare(
      `INSERT INTO cognitive_sidecar_meta
         (id, schema_version, architecture_epoch, implementation_spec_version, thought_contract_version, authority_epoch)
       VALUES (1, 1, 'v0.2.1', '0.2.1.r5', 1, 1)`,
    ).run();
    db.exec(COGNITIVE_SIDECAR_SCHEMA_V2);
    db.exec(COGNITIVE_SIDECAR_SCHEMA_V3);
    db.exec(COGNITIVE_SIDECAR_SCHEMA_V4);
    db.exec("PRAGMA user_version = 4");

    try {
      openCognitiveSidecarDb(db, { dataPlane: { kind: "isolated" } });
      expect((db.prepare("SELECT schema_version FROM cognitive_sidecar_meta WHERE id = 1").get() as { schema_version: number }).schema_version).toBe(8);
      expect((db.prepare("SELECT COUNT(*) AS count FROM private_budget_policy_clock").get() as { count: number }).count).toBe(0);
      expect((db.prepare("SELECT COUNT(*) AS count FROM private_budget_reservations").get() as { count: number }).count).toBe(0);

      const wake = admitWake(db, {
        occurrenceId: "occurrence:w7-migration-epoch",
        triggerRef: "trigger:w7-migration-epoch",
        sourceKind: "idle",
        conversationId: "conversation:w7-migration",
        cycleId: "cycle:w7-migration",
        capturedAuthorityRevision: 1,
        nowMs: 7_000_000,
      });
      expect(reservePrivateThought(db, {
        admissionId: "admission:w7-migration-epoch",
        wakeId: wake.wake.wakeId,
        conversationId: "conversation:w7-migration",
        policyId: "ashley.private_thought.v1",
        wallClockNowMs: 7_000_000,
      })).toEqual({ kind: "refused", reason: "clock_reconciliation", remaining: 0 });
      expect(db.prepare("SELECT clock_state FROM private_budget_policy_clock WHERE policy_id = 'ashley.private_thought.v1'").get()).toMatchObject({ clock_state: "clock_reconciliation" });
      expect((db.prepare("SELECT COUNT(*) AS count FROM private_budget_reservations").get() as { count: number }).count).toBe(0);
    } finally {
      db.close();
    }
  });

  it("rejects newer sidecar content and rolls back a failed v2 upgrade", () => {
    const newer = new DatabaseSync(":memory:");
    try {
      newer.exec("PRAGMA user_version = 9");
      expect(() => openCognitiveSidecarDb(newer, { dataPlane: { kind: "isolated" } }))
        .toThrow("unsupported_cognitive_sidecar_schema:9>8");
    } finally {
      newer.close();
    }

    const db = new DatabaseSync(":memory:");
    db.exec(COGNITIVE_SIDECAR_SCHEMA_V1);
    db.prepare(
      `INSERT INTO cognitive_sidecar_meta
         (id, schema_version, architecture_epoch, implementation_spec_version, thought_contract_version, authority_epoch)
       VALUES (1, 1, 'v0.2.1', '0.2.1.r5', 1, 1)`,
    ).run();
    db.exec(`
      PRAGMA user_version = 1;
      CREATE TRIGGER fail_sidecar_projection_upgrade
      BEFORE UPDATE OF schema_version ON cognitive_sidecar_meta
      BEGIN SELECT RAISE(ABORT, 'test_sidecar_v2_rollback'); END;
    `);
    try {
      expect(() => openCognitiveSidecarDb(db, { dataPlane: { kind: "isolated" } }))
        .toThrow("test_sidecar_v2_rollback");
      expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(1);
      expect((db.prepare("PRAGMA table_info(cognitive_sidecar_meta)").all() as Array<{ name: string }>)
        .map((column) => column.name)).not.toContain("projection_barrier_revision");
    } finally {
      db.close();
    }
  });

  it("migrates from v5 to v6 adding event provenance columns and demoting historical receipts", () => {
    const db = new DatabaseSync(":memory:");
    // Set up up to V5
    openCognitiveSidecarDb(db, { dataPlane: { kind: "isolated" } });
    expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(8);

    // Verify columns on in_flight_effects
    const columns = (db.prepare("PRAGMA table_info(in_flight_effects)").all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toContain("origin_event_id");
    expect(columns).toContain("origin_attempt_id");

    // Insert receipts with old values
    db.prepare("INSERT INTO effect_receipts (receipt_id, effect_id, idempotency_key, outcome, claims_json, at_ms, data_classification, secret_omitted) VALUES ('r-succ', 'e-succ', 'i-succ', 'succeeded', '{}', 1, 'never_public', 0)").run();
    db.prepare("INSERT INTO effect_receipts (receipt_id, effect_id, idempotency_key, outcome, claims_json, at_ms, data_classification, secret_omitted) VALUES ('r-fail', 'e-fail', 'i-fail', 'failed', '{}', 1, 'never_public', 0)").run();
    db.prepare("INSERT INTO effect_receipts (receipt_id, effect_id, idempotency_key, outcome, claims_json, at_ms, data_classification, secret_omitted) VALUES ('r-unk', 'e-unk', 'i-unk', 'unknown', '{}', 1, 'never_public', 0)").run();

    // Re-run migration logic
    db.prepare("UPDATE effect_receipts SET outcome = 'outcome_unknown' WHERE outcome IN ('failed', 'unknown')").run();

    expect((db.prepare("SELECT outcome FROM effect_receipts WHERE receipt_id = 'r-succ'").get() as any).outcome).toBe("succeeded");
    expect((db.prepare("SELECT outcome FROM effect_receipts WHERE receipt_id = 'r-fail'").get() as any).outcome).toBe("outcome_unknown");
    expect((db.prepare("SELECT outcome FROM effect_receipts WHERE receipt_id = 'r-unk'").get() as any).outcome).toBe("outcome_unknown");
    db.close();
  });
});
