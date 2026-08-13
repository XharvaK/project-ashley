import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupFixture,
  makeMintFixture,
  readMarker,
  readState,
  readText,
  runRollback,
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

describe("rollback-engineering security finality", () => {
  it("disables persistent authority and proves service/socket finality", () => {
    const created = fixture();
    const result = runRollback(created);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_BROKER_ENABLED=false");
    expect(readText(created.brokerEnv)).toContain("ASHLEY_SANDBOX_DELEGATED_ENABLED=false");
    expect(readText(created.conf + "/.env")).not.toContain("ASHLEY_SANDBOX_LIFECYCLE=ENABLED");
    expect(readMarker(created).sandboxAutonomy).toBe("DISABLED");
    expect(readState(created, "service")).toBe("inactive");
    expect(readState(created, "socket")).toBe("inactive");
  });

  it("fails visibly when systemctl stop fails", () => {
    const created = fixture();
    const result = runRollback(created, { ASHLEY_FAKE_STOP_FAIL: "1" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("broker_stop_failed");
  });

  it.each([
    ["service remains active", { ASHLEY_FAKE_STICKY_SERVICE: "1" }, "service_still_active"],
    ["socket remains active", { ASHLEY_FAKE_STICKY_SOCKET: "1" }, "socket_still_active"],
  ])("fails visibly when %s past the finality timeout", (_label, env, reason) => {
    const created = fixture();
    const result = runRollback(created, env);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(reason);
  });

  it("is idempotent", () => {
    const created = fixture();
    const first = runRollback(created);
    const second = runRollback(created);
    expect(first.status, first.stderr).toBe(0);
    expect(second.status, second.stderr).toBe(0);
    expect(readState(created, "service")).toBe("inactive");
    expect(readState(created, "socket")).toBe("inactive");
  });
});
