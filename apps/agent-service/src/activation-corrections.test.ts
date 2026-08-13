import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupFixture,
  makeMintFixture,
  readMarker,
  readState,
  readText,
  runActivation,
  type MintFixture,
} from "./mint-script-test-helpers.js";

const fixtures: MintFixture[] = [];
function fixture(): MintFixture {
  const created = makeMintFixture();
  fixtures.push(created);
  return created;
}

afterEach(() => {
  for (const created of fixtures.splice(0)) cleanupFixture(created);
});

function expectSafeState(created: MintFixture): void {
  expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_BROKER_ENABLED=false");
  expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_DELEGATED_ENABLED=false");
  expect(readText(created.conf + "/.env")).not.toContain("ASHLEY_SANDBOX_LIFECYCLE=ENABLED");
  expect(readMarker(created).sandboxAutonomy).toBe("DISABLED");
  expect(readState(created, "service")).toBe("inactive");
  expect(readState(created, "socket")).toBe("inactive");
}

describe("activate-engineering fail-closed behavior", () => {
  it("accepts canonical 02C evidence, canary receipt, runtime manifest, and workspace manifest", () => {
    const created = fixture();
    const result = runActivation(created);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('"ok":true');
    expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_BROKER_ENABLED=true");
    expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_DELEGATED_ENABLED=true");
    expect(readText(created.conf + "/.env")).toContain("ASHLEY_SANDBOX_LIFECYCLE=ENABLED");
    expect(readMarker(created).sandboxAutonomy).toBe("ENABLED");
  });

  it.each([
    "after_broker_gate_mutation",
    "after_delegated_gate_mutation",
    "before_broker_restart",
    "during_broker_restart",
    "after_broker_readiness",
    "during_r5b",
    "after_autonomy_marker_mutation",
    "during_lifecycle_enable",
    "during_agent_restart",
    "during_agent_health_verification",
  ])("failure at %s executes cleanup and proves non-autonomous finality", (stage) => {
    const created = fixture();
    const result = runActivation(created, stage);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(`injected_failure:${stage}`);
    expectSafeState(created);
  });

  it("failure before the first authority mutation leaves the original non-autonomous state", () => {
    const created = fixture();
    const result = runActivation(created, "before_first_gate_mutation");
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "injected_failure:before_first_gate_mutation",
    );
    expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_BROKER_ENABLED=false");
    expect(readMarker(created).sandboxAutonomy).toBe("DISABLED");
  });

  it("reports cleanup failure without hiding the original activation failure", () => {
    const created = fixture();
    const result = runActivation(created, "after_broker_gate_mutation", {
      ASHLEY_FAKE_STOP_FAIL: "1",
    });
    expect(result.status).not.toBe(0);
    const output = `${result.stdout}\n${result.stderr}`;
    expect(output).toContain("injected_failure:after_broker_gate_mutation");
    expect(output).toContain("failed_activation_cleanup_failed");
  });
});
