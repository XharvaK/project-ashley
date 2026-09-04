import { describe, expect, it } from "vitest";
import {
  COVERAGE_DISPOSITIONS,
  buildCoverageManifest,
  classifyCoverage,
  type CoverageDisposition,
} from "../coverage-manifest.js";

describe("MAT-II coverage manifest", () => {
  it("keeps all eight dispositions distinct and reachable", () => {
    const dispositions = COVERAGE_DISPOSITIONS.map((disposition) =>
      classifyCoverage({ domain: disposition, disposition }),
    );

    expect(new Set(dispositions).size).toBe(8);
    expect(dispositions).toEqual([
      "INCLUDED",
      "OMITTED_FOR_BUDGET",
      "EMPTY",
      "UNREACHABLE",
      "INELIGIBLE",
      "STALE",
      "DEFERRED",
      "POINTER_ONLY",
    ] satisfies CoverageDisposition[]);
  });

  it("distinguishes zero source rows from source rows with zero eligible rows", () => {
    expect(classifyCoverage({
      domain: "working_context",
      querySucceeded: true,
      sourceRecordCount: 0,
      eligibleRecordCount: 0,
    })).toBe("EMPTY");
    expect(classifyCoverage({
      domain: "working_context",
      querySucceeded: true,
      sourceRecordCount: 3,
      eligibleRecordCount: 0,
    })).toBe("INELIGIBLE");
  });

  it("does not conflate dormant or stale rows with an empty store", () => {
    expect(classifyCoverage({
      domain: "working_context",
      querySucceeded: true,
      sourceRecordCount: 2,
      eligibleRecordCount: 0,
      ineligibleRecordCount: 2,
    })).toBe("INELIGIBLE");
    expect(classifyCoverage({
      domain: "working_context",
      querySucceeded: true,
      sourceRecordCount: 2,
      eligibleRecordCount: 0,
      staleRecordCount: 2,
    })).toBe("STALE");
  });

  it("fails closed for required query failures and fails soft for optional domains", () => {
    expect(() => classifyCoverage({
      domain: "identity",
      querySucceeded: false,
      required: true,
    })).toThrowError("coverage_required_unreachable");
    expect(classifyCoverage({
      domain: "concerns",
      querySucceeded: false,
      required: false,
    })).toBe("UNREACHABLE");
  });

  it("records counts and every disposition in a structured domain report", () => {
    const manifest = buildCoverageManifest([
      {
        domain: "identity",
        disposition: "INCLUDED",
        sourceRecordCount: 1,
        eligibleRecordCount: 1,
        candidateIds: ["identity-1"],
      },
      {
        domain: "conversation",
        disposition: "OMITTED_FOR_BUDGET",
        sourceRecordCount: 2,
        eligibleRecordCount: 2,
        candidateIds: ["conversation-1", "conversation-2"],
      },
      {
        domain: "curiosity",
        querySucceeded: true,
        sourceRecordCount: 0,
        eligibleRecordCount: 0,
      },
    ]);

    expect(manifest.version).toBe(1);
    expect(manifest.domains).toHaveLength(3);
    expect(manifest.domains[0]).toMatchObject({
      domain: "identity",
      disposition: "INCLUDED",
      source_record_count: 1,
      eligible_record_count: 1,
      candidate_ids: ["identity-1"],
    });
    expect(manifest.dispositionCounts).toMatchObject({
      INCLUDED: 1,
      OMITTED_FOR_BUDGET: 1,
      EMPTY: 1,
    });
  });

  it("keeps POINTER_ONLY as an explicit bounded pointer state", () => {
    const manifest = buildCoverageManifest([{
      domain: "concerns",
      pointerOnly: true,
      querySucceeded: true,
      sourceRecordCount: 4,
      eligibleRecordCount: 2,
      candidateIds: ["concern-pointer"],
    }]);

    expect(manifest.domains[0]).toMatchObject({
      disposition: "POINTER_ONLY",
      source_record_count: 4,
      eligible_record_count: 2,
    });
  });
});
