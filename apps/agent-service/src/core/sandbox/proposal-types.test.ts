import { describe, expect, it } from "vitest";
import {
  validateSandboxActionProposal,
  type SandboxActionProposal,
} from "./proposal-types.js";

const base: SandboxActionProposal = {
  proposalId: "prop-2026-0001",
  ownerId: "owner-ashley-test",
  requestedCapability: "approved_project_read",
  targetPaths: [{ path: "/sandbox/repo/src/main.ts", intent: "read" }],
  requiresNetwork: false,
  externalSideEffect: false,
  persistence: "temporary",
  modelSuggestedRisk: "low",
  rationale: "review the candidate patch site",
};

function valid(
  overrides: Partial<SandboxActionProposal> = {},
): SandboxActionProposal {
  return { ...base, ...overrides };
}

function expectValid(input: unknown): SandboxActionProposal {
  const result = validateSandboxActionProposal(input);
  expect(result.ok, `expected valid, got ${JSON.stringify(result)}`).toBe(true);
  return (result as { proposal: SandboxActionProposal }).proposal;
}

function expectInvalid(input: unknown, reason: string): void {
  const result = validateSandboxActionProposal(input);
  expect(result.ok).toBe(false);
  expect((result as { reason: string }).reason).toBe(reason);
}

describe("validateSandboxActionProposal", () => {
  it("1: accepts a minimal path-based proposal", () => {
    const proposal = expectValid(valid());
    expect(proposal.requestedCapability).toBe("approved_project_read");
  });

  it("2: accepts a recipe proposal with argv and cwd", () => {
    const proposal = expectValid(
      valid({
        requestedCapability: "fixed_test_recipe",
        recipeId: "test-run-recipes/mocha-run",
        argv: ["--reporter", "dot"],
        cwd: "/sandbox/disposable/w",
        targetPaths: undefined,
      }),
    );
    expect(proposal.recipeId).toBe("test-run-recipes/mocha-run");
  });

  it("3: accepts an executable proposal with executableId and argv", () => {
    const proposal = expectValid(
      valid({
        requestedCapability: "bounded_diagnostic_execution",
        executableId: "diagnostics/node-memory-check",
        argv: ["--limit", "64"],
        targetPaths: undefined,
      }),
    );
    expect(proposal.executableId).toBe("diagnostics/node-memory-check");
  });

  it("4: rejects null, undefined and primitives", () => {
    expectInvalid(null, "not_an_object");
    expectInvalid(undefined, "not_an_object");
    expectInvalid(42, "not_an_object");
    expectInvalid("proposal", "not_an_object");
  });

  it("5: rejects arrays", () => {
    expectInvalid([], "not_an_object");
  });

  it("6: rejects objects with non-plain prototypes", () => {
    expectInvalid(Object.create({ evil: true }), "non_plain_object");
  });

  it("7: rejects own __proto__ keys", () => {
    expectInvalid(
      JSON.parse('{"proposalId":"p-1","__proto__":{"polluted":true}}'),
      "non_plain_object",
    );
  });

  it("8: rejects unknown fields", () => {
    expectInvalid(valid({ argv: undefined, injected: true } as never), "extra_fields");
  });

  it("9: rejects invalid proposalId", () => {
    expectInvalid(valid({ proposalId: "" }), "proposal_id_invalid");
    expectInvalid(valid({ proposalId: "x".repeat(129) }), "proposal_id_invalid");
    expectInvalid(valid({ proposalId: 7 as never }), "proposal_id_invalid");
  });

  it("10: rejects invalid ownerId", () => {
    expectInvalid(valid({ ownerId: "" }), "owner_id_invalid");
  });

  it("11: rejects invalid sessionUuid", () => {
    expectInvalid(valid({ sessionUuid: "x".repeat(65) }), "session_uuid_invalid");
    expectInvalid(valid({ sessionUuid: 9 as never }), "session_uuid_invalid");
  });

  it("12: rejects unknown capabilities", () => {
    expectInvalid(
      valid({ requestedCapability: "surprise_attack" } as never),
      "unknown_capability",
    );
  });

  it("13: rejects invalid recipeId", () => {
    expectInvalid(
      valid({
        requestedCapability: "fixed_test_recipe",
        recipeId: "x".repeat(257),
        targetPaths: undefined,
      }),
      "recipe_id_invalid",
    );
  });

  it("14: rejects invalid executableId", () => {
    expectInvalid(
      valid({
        requestedCapability: "bounded_diagnostic_execution",
        executableId: 12 as never,
        targetPaths: undefined,
      }),
      "executable_id_invalid",
    );
  });

  it("15: rejects invalid cwd", () => {
    expectInvalid(
      valid({
        requestedCapability: "fixed_test_recipe",
        recipeId: "test-run-recipes/mocha-run",
        cwd: "x".repeat(1025),
        targetPaths: undefined,
      }),
      "cwd_invalid",
    );
  });

  it("16: rejects overlong rationale", () => {
    expectInvalid(valid({ rationale: "x".repeat(2001) }), "rationale_invalid");
  });

  it("17: rejects non-array argv", () => {
    expectInvalid(
      valid({
        requestedCapability: "fixed_test_recipe",
        recipeId: "test-run-recipes/mocha-run",
        argv: "--reporter" as never,
        targetPaths: undefined,
      }),
      "argv_invalid",
    );
  });

  it("18: rejects non-string argv entries", () => {
    expectInvalid(
      valid({
        requestedCapability: "fixed_test_recipe",
        recipeId: "test-run-recipes/mocha-run",
        argv: ["ok", 42] as never,
        targetPaths: undefined,
      }),
      "argv_invalid",
    );
  });

  it("19: rejects argv with more than 16 entries", () => {
    expectInvalid(
      valid({
        requestedCapability: "fixed_test_recipe",
        recipeId: "test-run-recipes/mocha-run",
        argv: Array.from({ length: 17 }, (_, i) => `arg-${i}`),
        targetPaths: undefined,
      }),
      "argv_too_many",
    );
  });

  it("20: rejects argv entries longer than 256 characters", () => {
    expectInvalid(
      valid({
        requestedCapability: "fixed_test_recipe",
        recipeId: "test-run-recipes/mocha-run",
        argv: ["x".repeat(257)],
        targetPaths: undefined,
      }),
      "argv_entry_too_long",
    );
  });

  it("21: rejects non-array targetPaths", () => {
    expectInvalid(valid({ targetPaths: "/sandbox/repo" as never }), "target_paths_invalid");
  });

  it("22: rejects more than 8 target paths", () => {
    expectInvalid(
      valid({
        targetPaths: Array.from({ length: 9 }, (_, i) => ({
          path: `/sandbox/repo/src/${i}.ts`,
          intent: "read",
        })),
      }),
      "target_paths_too_many",
    );
  });

  it("23: rejects malformed target entries", () => {
    expectInvalid(
      valid({
        targetPaths: [{ path: "/sandbox/repo/a.ts", intent: "read", extra: 1 }] as never,
      }),
      "target_path_entry_invalid",
    );
  });

  it("24: rejects empty or non-string paths", () => {
    expectInvalid(
      valid({ targetPaths: [{ path: "", intent: "read" }] }),
      "path_invalid",
    );
  });

  it("25: rejects paths longer than 4096 characters", () => {
    expectInvalid(
      valid({ targetPaths: [{ path: "/" + "x".repeat(4096), intent: "read" }] }),
      "path_too_long",
    );
  });

  it("26: rejects unknown intents", () => {
    expectInvalid(
      valid({ targetPaths: [{ path: "/sandbox/repo/a.ts", intent: "execute" }] as never }),
      "intent_invalid",
    );
  });

  it("27: rejects duplicate target paths", () => {
    expectInvalid(
      valid({
        targetPaths: [
          { path: "/sandbox/repo/a.ts", intent: "read" },
          { path: "/sandbox/repo/a.ts", intent: "read" },
        ],
      }),
      "duplicate_target_path",
    );
  });

  it("28: rejects non-boolean requiresNetwork", () => {
    expectInvalid(valid({ requiresNetwork: "yes" as never }), "requires_network_invalid");
  });

  it("29: rejects invalid persistence values", () => {
    expectInvalid(valid({ persistence: "forever" as never }), "persistence_invalid");
  });

  it("30: rejects invalid model risk labels", () => {
    expectInvalid(
      valid({ modelSuggestedRisk: "critical" as never }),
      "model_suggested_risk_invalid",
    );
  });

  it("31: rejects network for network-none capabilities", () => {
    expectInvalid(valid({ requiresNetwork: true }), "network_inconsistent");
  });

  it("32: rejects external side effects for side-effect-free capabilities", () => {
    expectInvalid(valid({ externalSideEffect: true }), "external_side_effect_inconsistent");
  });

  it("33: rejects persistence on non-writable capabilities", () => {
    expectInvalid(valid({ persistence: "persistent" }), "persistence_inconsistent");
  });

  it("34: rejects argv on non-argument capabilities", () => {
    expectInvalid(
      valid({ argv: ["--flag"] }),
      "argv_not_permitted",
    );
  });

  it("35: rejects cwd on non-argument capabilities", () => {
    expectInvalid(valid({ cwd: "/sandbox/repo" }), "cwd_not_permitted");
  });

  it("36: requires paths for path-based capabilities", () => {
    expectInvalid(valid({ targetPaths: undefined }), "paths_required");
    expectInvalid(valid({ targetPaths: [] }), "paths_required");
  });

  it("37: rejects paths on path-less capabilities", () => {
    expectInvalid(
      valid({
        requestedCapability: "fixed_test_recipe",
        recipeId: "test-run-recipes/mocha-run",
        targetPaths: [{ path: "/sandbox/disposable/w", intent: "read" }],
      }),
      "paths_not_permitted",
    );
  });

  it("38: requires recipeId for recipe-bound capabilities", () => {
    expectInvalid(
      valid({ requestedCapability: "fixed_test_recipe", targetPaths: undefined }),
      "recipe_id_required",
    );
  });

  it("39: rejects recipeId on non-recipe capabilities", () => {
    expectInvalid(
      valid({ recipeId: "test-run-recipes/mocha-run" }),
      "recipe_id_not_permitted",
    );
  });

  it("40: requires executableId for executable-bound capabilities", () => {
    expectInvalid(
      valid({
        requestedCapability: "bounded_diagnostic_execution",
        targetPaths: undefined,
      }),
      "executable_id_required",
    );
  });

  it("41: rejects executableId on non-executable capabilities", () => {
    expectInvalid(
      valid({ executableId: "diagnostics/node-memory-check" }),
      "executable_id_not_permitted",
    );
  });

  it("42: rejects secret-shaped rationale", () => {
    expectInvalid(
      valid({ rationale: "the key is sk-abcdefghijklmnopqrst" }),
      "secret_detected",
    );
  });

  it("43: rejects secret-shaped argv entries", () => {
    expectInvalid(
      valid({
        requestedCapability: "fixed_test_recipe",
        recipeId: "test-run-recipes/mocha-run",
        argv: [
          "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----",
        ],
        targetPaths: undefined,
      }),
      "secret_detected",
    );
  });

  it("44: rejects secret-shaped target paths", () => {
    expectInvalid(
      valid({
        targetPaths: [{ path: "/sandbox/repo/AKIA1234567890ABCDEF", intent: "read" }],
      }),
      "secret_detected",
    );
  });

  it("45: accepts sessionUuid and model risk absence", () => {
    const proposal = expectValid(valid({ sessionUuid: "session-1", modelSuggestedRisk: undefined }));
    expect(proposal.sessionUuid).toBe("session-1");
    expect(proposal.modelSuggestedRisk).toBeUndefined();
  });
});
