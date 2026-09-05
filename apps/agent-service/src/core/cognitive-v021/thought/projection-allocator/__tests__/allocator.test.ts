import { describe, it, expect } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { ThoughtInput } from "../../../types.js";
import {
  allocateThoughtProjection,
  RequiredOverflowError,
  thoughtMessagesForProjection,
} from "../allocator.js";
import { buildAllocationCandidates } from "../sections.js";
import { createThoughtStructuralFeedback } from "../../structural-feedback.js";
import { ensureAuthoritativeLineage, openContinuityDb } from "../../../../continuity/db.js";
import { buildOrientationKernel } from "../../orientation-kernel.js";
import type { DomainPointersSection } from "../../domain-pointers.js";
import { buildCoverageManifest } from "../../coverage-manifest.js";
import { modelVisibleThoughtProjection } from "../../projection.js";

function makeThoughtInput(overrides: Partial<ThoughtInput> = {}): ThoughtInput {
  return {
    cycleId: "cycle-test-1",
    generation: 1,
    occupantId: "occupant-1",
    authorityEpoch: 1,
    trigger: { kind: "owner_message", ref: "msg-1" },
    rawConversation: [
      {
        rowId: "row-1",
        lineageId: "lin-1",
        version: 1,
        conversationId: "conv-1",
        role: "owner",
        text: "Hello Ashley, let's test allocation",
        createdAtMs: Date.now() - 1000,
        discordMessageIds: [],
        reservationId: null,
        producingCycleId: null,
        architectureEpoch: "v0.2.1",
        contentHash: "hash1",
        sourceStatus: "delivered",
        dataClassification: "ordinary",
        secretOmitted: false,
        delivered: true,
      },
    ],
    workingContext: [
      {
        id: "wc-topic-1",
        conversationId: "conv-1",
        type: "topic",
        text: "General discussion about architecture",
        concernId: null,
        sourceTurnIds: [],
        status: "active",
        supersedesId: null,
        updatedGeneration: 1,
      },
      {
        id: "wc-corr-1",
        conversationId: "conv-1",
        type: "correction",
        text: "Important owner correction about database schema",
        concernId: null,
        sourceTurnIds: [],
        status: "active",
        supersedesId: null,
        updatedGeneration: 1,
      },
    ],
    occupancy: [],
    constitution: { constitutional: ["Be truthful"], stableSelf: ["Project Ashley"] },
    learnedSelfSlice: { dispositions: ["disciplined"], interests: ["architecture"] },
    capabilityReality: {
      vision: false,
      attachmentText: false,
      conversationalRead: false,
      webSearch: false,
      canOfferProjectInspection: false,
      canOfferWorkspace: false,
      canOfferVerification: false,
      canOfferAuthorship: false,
      canOfferBoundedOperation: false,
      canOfferPatchExport: false,
      approvedProjectIds: [],
    },
    observations: [],
    retrieval: {
      request: {
        triggerTerms: ["architecture"],
        workingContextTopics: [],
        assertionKeys: [],
        includeLogSearch: true,
      },
      hits: [
        {
          kind: "lexical",
          sourceStore: "live_memory",
          ref: "mem:arch:1",
          snippet: "Project Ashley uses SQLite and unprivileged Bubblewrap",
          score: -5.0,
          assertionKey: "mem:arch:1",
          memoryKind: "owner_world_claim",
          dimensions: null,
          dataClassification: "ordinary",
          live: true,
          supportRefs: ["supp-1"],
        },
      ],
      state: "ready",
      miss: false,
    },
    inFlight: [],
    authorityObjections: [],
    runtimeCondition: {
      fallback: false,
      compression: false,
      lookupFailed: false,
      thoughtUnavailable: false,
    },
    rememberDirective: null,
    ...overrides,
  };
}

function makeConversationRows(
  count: number,
  textFor: (index: number) => string,
): ThoughtInput["rawConversation"] {
  return Array.from({ length: count }, (_, index) => ({
    rowId: `synthetic-row-${index}`,
    lineageId: `synthetic-lineage-${index}`,
    version: 1,
    conversationId: "conv-1",
    role: "owner" as const,
    text: textFor(index),
    createdAtMs: index + 1,
    discordMessageIds: [],
    reservationId: null,
    producingCycleId: null,
    architectureEpoch: "v0.2.1" as const,
    contentHash: `synthetic-hash-${index}`,
    sourceStatus: "delivered" as const,
    dataClassification: "ordinary" as const,
    secretOmitted: false,
    delivered: true,
  }));
}

function withSyntheticC2(input: ThoughtInput): ThoughtInput & {
  orientationKernel: ReturnType<typeof buildOrientationKernel>;
  domainPointers: DomainPointersSection;
} {
  const orientationKernel = buildOrientationKernel({
    values: ["synthetic value"],
    boundaries: ["synthetic boundary"],
    stableSelf: ["synthetic stable self"],
    staticOperatingContract: "Synthetic operating contract for allocation pressure tests.",
    capabilityReality: input.capabilityReality,
  });
  const domainPointers: DomainPointersSection = {
    version: 1,
    conversationId: input.rawConversation[0]?.conversationId ?? "conv-1",
    cycleId: input.cycleId,
    pointers: [{
      domain: "synthetic_domain",
      canonicalStore: "synthetic.db:domain",
      entityIds: ["synthetic-entity"],
      status: "active",
      updatedAtMs: 1,
      disposition: "POINTER_ONLY",
      pointerOnly: true,
    }],
    coverageManifest: buildCoverageManifest([{
      domain: "synthetic_domain",
      disposition: "POINTER_ONLY",
      sourceRecordCount: 1,
      eligibleRecordCount: 1,
      candidateIds: ["synthetic-entity"],
      required: false,
      pointerOnly: true,
    }]),
  };
  return { ...input, orientationKernel, domainPointers };
}

describe("Whole-Thought Projection Allocator", () => {
  it("degrades ordinary recent history while retaining the exact current trigger", () => {
    const rows = makeConversationRows(
      12,
      (index) => `synthetic ordinary recent context row ${index} `.repeat(50),
    );
    const input = withSyntheticC2(makeThoughtInput({
      rawConversation: rows,
      trigger: { kind: "owner_message", ref: rows.at(-1)!.rowId },
    }));

    const allocated = allocateThoughtProjection({
      thoughtInput: input,
      semanticBudgetTokens: 9_500,
      requestId: "req-ordinary-required-overflow-regression",
    });

    const includedIds = allocated.projected.rawConversation.map((row) => row.rowId);
    const omittedRecent = allocated.receipt.decision.omitted.filter(
      (candidate) => candidate.section === "recent_raw",
    );

    expect(allocated.receipt.semanticProjectionEnvelope.maxInputTokens).toBe(9_500);
    expect(includedIds).toContain(rows.at(-1)!.rowId);
    expect(includedIds).toContain(rows.at(-2)!.rowId);
    expect(includedIds).not.toContain(rows[0]!.rowId);
    expect(allocated.receipt.decision.included).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `recent_raw:${rows.at(-1)!.rowId}`, required: true }),
    ]));
    expect(buildAllocationCandidates(input, [])
      .filter((candidate) => candidate.section === "recent_raw" && candidate.required)
      .map((candidate) => candidate.ref)).toEqual([rows.at(-1)!.rowId]);
    expect(omittedRecent.length).toBeGreaterThan(0);
    expect(allocated.receipt.coverageManifest?.domains).toEqual(expect.arrayContaining([
      expect.objectContaining({ domain: "recent_raw", disposition: "OMITTED_FOR_BUDGET" }),
    ]));
    expect(allocated.projected.conversationSelection?.omittedEvidenceIds).toEqual(
      expect.arrayContaining(omittedRecent.map((candidate) => candidate.ref)),
    );
    expect(allocated.receipt.requiredOverflow).toBe(false);
    expect(allocated.messages[1]?.content).toContain(rows.at(-1)!.text as string);
  });

  it("keeps every useful row for a small ordinary conversation", () => {
    const rows = makeConversationRows(12, (index) => `small synthetic row ${index}`);
    const allocated = allocateThoughtProjection({
      thoughtInput: makeThoughtInput({
        rawConversation: rows,
        trigger: { kind: "owner_message", ref: rows.at(-1)!.rowId },
      }),
      semanticBudgetTokens: 9_500,
      requestId: "req-small-ordinary-conversation",
    });

    expect(allocated.projected.rawConversation.map((row) => row.rowId)).toEqual(
      rows.map((row) => row.rowId),
    );
    expect(allocated.receipt.decision.omitted.filter(
      (candidate) => candidate.section === "recent_raw",
    )).toHaveLength(0);
  });

  it("retains the current trigger and frontier ownership while bounding inline frontier text", () => {
    const rows = makeConversationRows(
      20,
      (index) => `synthetic frontier context row ${index} `.repeat(35),
    );
    const frontierIds = rows.slice(0, 3).map((row) => row.rowId);
    const input = makeThoughtInput({
      rawConversation: rows,
      trigger: { kind: "owner_message", ref: rows.at(-1)!.rowId },
      conversationSelection: {
        frontierIncludedIds: frontierIds,
        omittedEvidenceIds: [],
      },
    });

    const allocated = allocateThoughtProjection({
      thoughtInput: input,
      semanticBudgetTokens: 4_500,
      requestId: "req-active-frontier-trigger-regression",
    });

    expect(allocated.projected.rawConversation.map((row) => row.rowId)).toContain(rows.at(-1)!.rowId);
    expect(allocated.projected.conversationSelection?.frontierIncludedIds).toEqual(frontierIds);
    expect(allocated.projected.conversationSelection?.omittedEvidenceIds).toEqual(
      expect.arrayContaining(frontierIds),
    );
    expect(allocated.receipt.coverageManifest?.domains).toEqual(expect.arrayContaining([
      expect.objectContaining({ domain: "recent_raw", disposition: "OMITTED_FOR_BUDGET" }),
    ]));
  });

  it("requires the authoritative current trigger row rather than its superseded predecessor", () => {
    const seedRows = makeConversationRows(
      12,
      (index) => `synthetic lineage pressure row ${index} `.repeat(50),
    );
    const staleTrigger = {
      ...seedRows[0]!,
      rowId: "trigger-lineage-v1",
      lineageId: "trigger-lineage",
      version: 1,
      text: "synthetic stale trigger ".repeat(100),
      createdAtMs: 1,
    };
    const currentTrigger = {
      ...staleTrigger,
      rowId: "trigger-lineage-v2",
      version: 2,
      text: "synthetic authoritative current trigger ".repeat(50),
      createdAtMs: 2,
    };
    const rows = [
      staleTrigger,
      currentTrigger,
      ...seedRows.slice(1).map((row, index) => ({ ...row, createdAtMs: index + 3 })),
    ];
    type LineageAwareThoughtInput = ThoughtInput & {
      conversationSelection: NonNullable<ThoughtInput["conversationSelection"]> & {
        currentTriggerRowId: string;
      };
    };
    const input = withSyntheticC2({
      ...makeThoughtInput({
        rawConversation: rows,
        trigger: { kind: "owner_message", ref: staleTrigger.rowId },
      }),
      conversationSelection: {
        frontierIncludedIds: [],
        omittedEvidenceIds: [],
        currentTriggerRowId: currentTrigger.rowId,
      },
    } as LineageAwareThoughtInput);

    const allocated = allocateThoughtProjection({
      thoughtInput: input,
      semanticBudgetTokens: 9_500,
      requestId: "req-trigger-lineage-pressure",
    });
    const candidateDefinitions = buildAllocationCandidates(input, []);

    expect(allocated.projected.rawConversation.map((row) => row.rowId)).toContain(currentTrigger.rowId);
    expect(allocated.projected.rawConversation.map((row) => row.rowId)).not.toContain(staleTrigger.rowId);
    expect(candidateDefinitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `recent_raw:${currentTrigger.rowId}`, required: true }),
      expect.objectContaining({ id: `recent_raw:${staleTrigger.rowId}`, required: false }),
    ]));
    expect(allocated.receipt.decision.omitted).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `recent_raw:${staleTrigger.rowId}`, reason: "budget_omission" }),
    ]));
  });

  it("fails closed when the resolved current trigger itself exceeds the envelope", () => {
    const currentTrigger = {
      ...makeConversationRows(1, () => "synthetic current trigger")[0]!,
      rowId: "trigger-lineage-overflow-v2",
      lineageId: "trigger-lineage-overflow",
      version: 2,
      text: "synthetic current trigger overflow ".repeat(20_000),
    };
    const input = withSyntheticC2({
      ...makeThoughtInput({
        rawConversation: [currentTrigger],
        trigger: { kind: "owner_message", ref: "trigger-lineage-overflow-v1" },
      }),
      conversationSelection: {
        frontierIncludedIds: [],
        omittedEvidenceIds: [],
        currentTriggerRowId: currentTrigger.rowId,
      },
    } as ThoughtInput & {
      conversationSelection: NonNullable<ThoughtInput["conversationSelection"]> & {
        currentTriggerRowId: string;
      };
    });

    let error: unknown;
    try {
      allocateThoughtProjection({
        thoughtInput: input,
        semanticBudgetTokens: 9_500,
        requestId: "req-trigger-lineage-overflow",
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(RequiredOverflowError);
    expect(error).toMatchObject({
      section: "recent_raw",
      semanticBudgetTokens: 9_500,
    });
  });

  it("does not hide a contextual reference failure behind generic correction guidance", () => {
    const input = makeThoughtInput({
      rawConversation: [
        {
          rowId: "turn-1",
          lineageId: "lin-1",
          version: 1,
          conversationId: "conv-1",
          role: "owner",
          text: "Return the effect intent semantic branch.",
          createdAtMs: Date.now() - 1000,
          discordMessageIds: [],
          reservationId: null,
          producingCycleId: null,
          architectureEpoch: "v0.2.1",
          contentHash: "hash1",
          sourceStatus: "delivered",
          dataClassification: "ordinary",
          secretOmitted: false,
          delivered: true,
        },
      ],
      trigger: { kind: "owner_message", ref: "turn-1" },
      retrieval: {
        request: { triggerTerms: [], workingContextTopics: [], assertionKeys: [], includeLogSearch: true },
        hits: [],
        state: "ready",
        miss: true,
      },
    });
    const allocated = allocateThoughtProjection({
      thoughtInput: input,
      requestId: "req-contextual-correction",
    });
    const feedback = createThoughtStructuralFeedback({
      code: "reference_not_allowlisted",
      field: "existingRefs",
      allowlistedReferences: ["turn-1"],
    });

    const systemMessage = thoughtMessagesForProjection(allocated.projected, feedback)[0]?.content ?? "";

    expect(systemMessage).toContain("reference_not_allowlisted");
    expect(systemMessage).toContain("existingRefs");
    expect(systemMessage).toContain("host allowlisted reference IDs");
    expect(systemMessage).toContain('["turn-1"]');
    expect(systemMessage).toContain("Do not change the semantic answer or invent authority.");
    expect(systemMessage).not.toContain("Match the semantic Thought contract exactly.");
  });

  it("delivers the governed currentness rule in the assembled Thought system message", () => {
    const input = makeThoughtInput();
    const allocated = allocateThoughtProjection({
      thoughtInput: input,
      requestId: "req-currentness-instruction",
    });
    const systemMessage = thoughtMessagesForProjection(allocated.projected)[0]?.content ?? "";

    expect(systemMessage).toContain("governed evidence status, not ordinary conversational recency");
    expect(systemMessage).toContain("does not by itself license");
    expect(systemMessage).toContain("the owner just sent a message");
    expect(systemMessage).toContain('Use time:unknown_freshness');
    expect(systemMessage).toContain('Use time:historical');
    expect(systemMessage).toContain("omit the epistemic commitment");
  });

  it("delivers the observation-relevance and abstain-precedence rule in the assembled Thought system message", () => {
    const input = makeThoughtInput();
    const allocated = allocateThoughtProjection({
      thoughtInput: input,
      requestId: "req-observation-relevance-instruction",
    });
    const systemMessage = thoughtMessagesForProjection(allocated.projected)[0]?.content ?? "";

    expect(systemMessage).toContain("can actually supply evidence capable of resolving the current semantic need");
    expect(systemMessage).toContain("availability of an unrelated observation does not justify observation");
    expect(systemMessage).toContain("abstain takes precedence over observation");
  });

  it("allocates complete thought context within the logical semantic envelope", () => {
    const input = makeThoughtInput();
    const allocated = allocateThoughtProjection({
      thoughtInput: input,
      quotaBucket: "groq:openai/gpt-oss-20b", // 8,000 TPM
      requestId: "req-1",
    });

    expect(allocated.receipt.hardTpm).toBe(8000);
    expect(allocated.receipt.estimatedInputTokens).toBeGreaterThan(0);
    expect(allocated.receipt.estimatedInputTokens)
      .toBeLessThanOrEqual(allocated.receipt.semanticProjectionEnvelope.maxInputTokens);
    expect(allocated.receipt.headroomTokens).toBeGreaterThanOrEqual(0);
    expect(allocated.receipt.compression).toBe(false);
    expect(allocated.projected.workingContext.length).toBe(2);
    expect(allocated.projected.retrieval.hits.length).toBe(1);
    expect(allocated.hashes.semanticProjectionHash).toBeDefined();
    expect(allocated.hashes.dispatchMessagesHash).toBeDefined();
  });

  it("omits optional candidates when the logical envelope is restricted, marking compression", () => {
    // Generate many optional retrieval hits and topics
    const manyHits = Array.from({ length: 50 }, (_, i) => ({
      kind: "lexical" as const,
      sourceStore: "live_memory" as const,
      ref: `mem:item:${i}`,
      snippet: `A large snippet of text with lots of words repeated to take up context space ${i} `.repeat(20),
      score: -1.0,
      assertionKey: `mem:item:${i}`,
      memoryKind: "owner_world_claim" as const,
      dimensions: null,
      dataClassification: "ordinary" as const,
      live: true,
      supportRefs: [],
    }));

    const input = makeThoughtInput({
      retrieval: {
        request: { triggerTerms: ["test"], workingContextTopics: [], assertionKeys: [], includeLogSearch: true },
        hits: manyHits,
        state: "ready",
        miss: false,
      },
    });

    const allocated = allocateThoughtProjection({
      thoughtInput: input,
      quotaBucket: "groq:openai/gpt-oss-20b",
      requestId: "req-compressed",
    });

    expect(allocated.receipt.compression).toBe(true);
    expect(allocated.projected.runtimeCondition.compression).toBe(true);
    expect(allocated.receipt.decision.omitted.length).toBeGreaterThan(0);
    expect(allocated.receipt.decision.omitted[0].reason).toBe("budget_omission");
    expect(allocated.receipt.decision.omitted[0]).toMatchObject({
      required: false,
      priority: 18,
      estimatedTokens: expect.any(Number),
    });
    expect(allocated.receipt.estimatedInputTokens)
      .toBeLessThanOrEqual(allocated.receipt.semanticProjectionEnvelope.maxInputTokens);
    expect(allocated.receipt.tokenBreakdown.omitted_for_budget_count)
      .toBe(allocated.receipt.decision.omitted.length);
  });

  it("fails closed when a genuinely mandatory section exceeds the envelope", () => {
    const rows = makeConversationRows(1, () => "current synthetic trigger");
    const input = {
      ...makeThoughtInput({
        rawConversation: rows,
        trigger: { kind: "owner_message", ref: rows[0]!.rowId },
      }),
      orientationKernel: buildOrientationKernel({
        values: ["synthetic value"],
        boundaries: ["synthetic boundary"],
        stableSelf: [],
        staticOperatingContract: "mandatory orientation payload ".repeat(20_000),
        capabilityReality: makeThoughtInput().capabilityReality,
      }),
    };

    let error: unknown;
    try {
      allocateThoughtProjection({
        thoughtInput: input,
        semanticBudgetTokens: 9_500,
        requestId: "req-mandatory-overflow",
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(RequiredOverflowError);
    expect(error).toMatchObject({
      section: "orientation_kernel",
      semanticBudgetTokens: 9_500,
    });
    expect((error as RequiredOverflowError).estimatedInputTokens).toBeGreaterThan(9_500);
  });

  it("uses token pressure rather than a fixed required turn count", () => {
    const tinyRows = makeConversationRows(18, (index) => `tiny synthetic row ${index}`);
    const tiny = allocateThoughtProjection({
      thoughtInput: makeThoughtInput({
        rawConversation: tinyRows,
        trigger: { kind: "owner_message", ref: tinyRows.at(-1)!.rowId },
      }),
      semanticBudgetTokens: 9_500,
      requestId: "req-token-driven-tiny-rows",
    });

    const largeRows = makeConversationRows(
      3,
      (index) => `large synthetic row ${index} `.repeat(260),
    );
    const large = allocateThoughtProjection({
      thoughtInput: makeThoughtInput({
        rawConversation: largeRows,
        trigger: { kind: "owner_message", ref: largeRows.at(-1)!.rowId },
      }),
      semanticBudgetTokens: 9_500,
      requestId: "req-token-driven-large-rows",
    });

    expect(tiny.projected.rawConversation).toHaveLength(18);
    expect(tiny.receipt.decision.omitted.filter(
      (candidate) => candidate.section === "recent_raw",
    )).toHaveLength(0);
    expect(large.projected.rawConversation.map((row) => row.rowId)).toContain(largeRows.at(-1)!.rowId);
    expect(large.receipt.decision.omitted.filter(
      (candidate) => candidate.section === "recent_raw",
    ).length).toBeGreaterThan(0);
  });

  it("records provider-independent semantic budget and per-pass component token breakdown", () => {
    const allocated = allocateThoughtProjection({
      thoughtInput: makeThoughtInput(),
      quotaBucket: "groq:openai/gpt-oss-20b",
      semanticProjectionEnvelope: {
        id: "test-envelope",
        version: 1,
        maxInputTokens: 9500,
      },
      requestId: "req-breakdown",
    });

    expect(allocated.receipt.semanticProjectionEnvelope.maxInputTokens).toBe(9500);
    expect(allocated.receipt.tokenBreakdown.static_contract_tokens).toBeGreaterThan(0);
    expect(allocated.receipt.tokenBreakdown.conversation_tokens).toBeGreaterThan(0);
    expect(allocated.receipt.tokenBreakdown.working_context_tokens).toBeGreaterThan(0);
    expect(allocated.receipt.tokenBreakdown.learned_self_tokens).toBeGreaterThan(0);
    expect(allocated.receipt.tokenBreakdown.retrieval_tokens).toBeGreaterThan(0);
    expect(allocated.receipt.tokenBreakdown.omitted_for_budget_count).toBe(0);
    expect(allocated.receipt.tokenBreakdown.required_overflow_count).toBe(0);
  });

  it("records mechanical W0 projection geometry and allocation operation counts", () => {
    const input = withSyntheticC2(makeThoughtInput());
    const allocated = allocateThoughtProjection({
      thoughtInput: input,
      requestId: "req-w0-allocation-diagnostics",
    });
    const diagnostics = allocated.receipt.diagnostics;
    const candidateCount =
      allocated.receipt.decision.included.length + allocated.receipt.decision.omitted.length;
    const systemMessageBytes = Buffer.byteLength(allocated.messages[0]?.content ?? "", "utf8");

    expect(diagnostics).toMatchObject({
      system_message_bytes: systemMessageBytes,
      orientation_kernel_bytes: expect.any(Number),
      required_base_estimated_tokens: expect.any(Number),
      optional_context_estimated_tokens: expect.any(Number),
      system_prefix_bytes: systemMessageBytes,
      system_prefix_estimated_tokens: allocated.receipt.tokenBreakdown.static_contract_tokens,
      candidate_S0_S1_prefix_bytes: expect.any(Number),
      candidate_S0_S1_prefix_estimated_tokens: expect.any(Number),
      first_volatile_field: "rawConversation",
      first_volatile_byte_offset: expect.any(Number),
      allocation_candidate_count: candidateCount,
      renderTentative_call_count: candidateCount + 1,
      thoughtMessagesForProjection_call_count: candidateCount + 1,
      allocation_elapsed_ms: expect.any(Number),
    });
    expect(allocated.receipt.tokenBreakdown.static_contract_tokens)
      .toBe(Math.ceil(systemMessageBytes / 2));
    expect(allocated.receipt.tokenBreakdown.identity_kernel_tokens).toBeGreaterThan(0);
    expect(diagnostics?.orientation_kernel_bytes).toBeGreaterThan(0);
    expect(diagnostics?.candidate_S0_S1_prefix_bytes).toBeGreaterThan(systemMessageBytes);
    expect(diagnostics?.allocation_elapsed_ms).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(diagnostics)).not.toContain("Hello Ashley");
  });

  it("uses stable-first visible key ordering without changing projected keys or values", () => {
    const allocated = allocateThoughtProjection({
      thoughtInput: withSyntheticC2(makeThoughtInput()),
      requestId: "req-w1-key-order",
    });
    const visible = modelVisibleThoughtProjection(allocated.projected);
    const serialized = JSON.parse(allocated.messages[1]?.content ?? "{}") as Record<string, unknown>;

    expect(Object.keys(serialized)).toEqual([
      "orientationKernel",
      "learnedSelfSlice",
      "occupantId",
      "authorityEpoch",
      "workingContext",
      "occupancy",
      "domainPointers",
      "rawConversation",
      "retrieval",
      "cycleId",
      "generation",
      "trigger",
      "observations",
      "inFlight",
      "authorityObjections",
      "runtimeCondition",
      "rememberDirective",
    ]);
    expect(Object.keys(serialized).sort()).toEqual(Object.keys(visible).sort());
    expect(serialized).toEqual(visible);
  });

  it("keeps the stable prefix byte-identical when only cycle and trigger data change", () => {
    const first = allocateThoughtProjection({
      thoughtInput: withSyntheticC2(makeThoughtInput({
        cycleId: "cycle-w1-first",
        generation: 1,
        trigger: { kind: "owner_message", ref: "trigger-w1-first" },
      })),
      requestId: "req-w1-prefix-first",
    });
    const second = allocateThoughtProjection({
      thoughtInput: withSyntheticC2(makeThoughtInput({
        cycleId: "cycle-w1-second",
        generation: 2,
        trigger: { kind: "owner_message", ref: "trigger-w1-second" },
      })),
      requestId: "req-w1-prefix-second",
    });

    const firstJson = first.messages[1]?.content ?? "";
    const secondJson = second.messages[1]?.content ?? "";
    const firstS1End = firstJson.indexOf(',"workingContext":');
    const secondS1End = secondJson.indexOf(',"workingContext":');

    expect(firstS1End).toBeGreaterThan(0);
    expect(secondS1End).toBeGreaterThan(0);
    expect(firstJson.slice(0, firstS1End)).toBe(secondJson.slice(0, secondS1End));
    expect(JSON.parse(firstJson).cycleId).not.toBe(JSON.parse(secondJson).cycleId);
    expect(JSON.parse(firstJson).trigger).not.toEqual(JSON.parse(secondJson).trigger);
    expect(first.receipt.diagnostics?.first_volatile_field).toBe("rawConversation");
    expect(second.receipt.diagnostics?.first_volatile_field).toBe("rawConversation");
  });

  it("invalidates the stable prefix when canonical identity changes", () => {
    const unchanged = allocateThoughtProjection({
      thoughtInput: withSyntheticC2(makeThoughtInput()),
      requestId: "req-w1-identity-unchanged",
    });
    const changedInput = withSyntheticC2(makeThoughtInput());
    changedInput.orientationKernel = {
      ...changedInput.orientationKernel,
      values: ["changed canonical identity"],
    };
    const changed = allocateThoughtProjection({
      thoughtInput: changedInput,
      requestId: "req-w1-identity-changed",
    });

    const unchangedJson = unchanged.messages[1]?.content ?? "";
    const changedJson = changed.messages[1]?.content ?? "";
    const unchangedS1End = unchangedJson.indexOf(',"workingContext":');
    const changedS1End = changedJson.indexOf(',"workingContext":');

    expect(unchangedS1End).toBeGreaterThan(0);
    expect(changedS1End).toBeGreaterThan(0);
    expect(unchangedJson.slice(0, unchangedS1End))
      .not.toBe(changedJson.slice(0, changedS1End));
  });

  it("attaches a structured coverage manifest to the allocation receipt", () => {
    const allocated = allocateThoughtProjection({
      thoughtInput: makeThoughtInput(),
      requestId: "req-coverage-manifest",
    });

    expect(allocated.receipt.coverageManifest).toBeDefined();
    expect(allocated.receipt.coverageManifest?.version).toBe(1);
    expect(allocated.receipt.coverageManifest?.domains.length).toBeGreaterThan(0);
    expect(allocated.receipt.coverageManifest?.dispositionCounts.INCLUDED).toBeGreaterThan(0);
  });

  it("applies the authoritative tombstone on the production allocation path before payload inclusion", () => {
    const continuity = openContinuityDb(new DatabaseSync(":memory:"));
    try {
      const { lineageId } = ensureAuthoritativeLineage(continuity, {
        nuclearSchemaVersion: 44,
        buildIdentity: "mat2-test",
      });
      continuity.prepare(
        `INSERT INTO forget_tombstones
           (tombstone_id, owner_id, lineage_id, status, created_at)
         VALUES (?, ?, ?, 'applied', ?)`,
      ).run("tombstone-row-1", "owner-1", lineageId, new Date().toISOString());
      continuity.prepare(
        `INSERT INTO forget_tombstone_targets
           (tombstone_id, entity_type, entity_uuid, action)
         VALUES (?, ?, ?, 'redact')`,
      ).run("tombstone-row-1", "conversation_evidence_log", "row-1");

      const allocated = allocateThoughtProjection({
        thoughtInput: makeThoughtInput(),
        requestId: "req-tombstone-production-path",
        continuityDb: continuity,
      } as Parameters<typeof allocateThoughtProjection>[0]);

      expect(allocated.projected.rawConversation).toEqual([]);
      expect(allocated.receipt.coverageManifest?.domains).toEqual(expect.arrayContaining([
        expect.objectContaining({
          domain: "recent_raw",
          disposition: "INELIGIBLE",
          candidate_ids: ["recent_raw:row-1"],
        }),
      ]));
    } finally {
      continuity.close();
    }
  });

  it("bounds active-frontier inline text while retaining every frontier identity in coverage metadata", () => {
    const rows = Array.from({ length: 40 }, (_, index) => ({
      rowId: `frontier-row-${index}`,
      lineageId: `frontier-lineage-${index}`,
      version: 1,
      conversationId: "conv-1",
      role: "owner" as const,
      text: `frontier evidence ${index} `.repeat(160),
      createdAtMs: index + 1,
      discordMessageIds: [],
      reservationId: null,
      producingCycleId: null,
      architectureEpoch: "v0.2.1" as const,
      contentHash: `frontier-hash-${index}`,
      sourceStatus: "delivered" as const,
      dataClassification: "ordinary" as const,
      secretOmitted: false,
      delivered: true,
    }));
    const frontierInput = makeThoughtInput({ rawConversation: rows }) as ThoughtInput & {
      conversationSelection: {
        frontierIncludedIds: string[];
        omittedEvidenceIds: string[];
      };
    };
    frontierInput.conversationSelection = {
      frontierIncludedIds: rows.map((row) => row.rowId),
      omittedEvidenceIds: [],
    };

    const allocated = allocateThoughtProjection({
      thoughtInput: frontierInput,
      semanticBudgetTokens: 4_500,
      requestId: "req-frontier-bounded",
    });

    expect(allocated.projected.rawConversation.length).toBeLessThan(rows.length);
    expect(allocated.projected.conversationSelection?.frontierIncludedIds).toEqual(
      rows.map((row) => row.rowId),
    );
    expect(allocated.projected.conversationSelection?.omittedEvidenceIds.length).toBeGreaterThan(0);
    expect(allocated.receipt.coverageManifest?.domains).toEqual(expect.arrayContaining([
      expect.objectContaining({
        domain: "recent_raw",
        disposition: "OMITTED_FOR_BUDGET",
      }),
    ]));
  });
});
