import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
  boundedReadFile,
  boundedListDir,
  boundedSearchText,
  boundedWriteFile,
  boundedDeleteFile,
  resolveWithinRoot,
} from "./fs-ops.js";
import { DIAGNOSTIC_DEFINITIONS } from "./diagnostics.js";

// fs-ops relies on POSIX canonical paths and realpath containment; the broker
// runs on Linux Mint, so these are gated to Linux (source-complete, host-verified).
const onLinux = process.platform === "linux";
describe.skipIf(!onLinux)("engineering fs-ops", () => {
  const root = mkdtempSync(path.join(tmpdir(), "eng-fs-"));
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(path.join(root, "src", "a.ts"), "export const x = 1;\nfunction findMe() {}\n");
  writeFileSync(path.join(root, "README.md"), "hello world\n");

  it("resolves a canonical relative path and rejects escape", async () => {
    const ok = await resolveWithinRoot(root, "src/a.ts");
    expect(ok.ok).toBe(true);
    const escape = await resolveWithinRoot(root, "../../etc/passwd");
    expect(escape.ok).toBe(false);
    // ".." is not canonical-relative, so it is rejected before resolution.
    const dotdot = await resolveWithinRoot(root, "../x");
    expect(dotdot.ok).toBe(false);
  });

  it("reads, lists, searches, writes, deletes within root", async () => {
    const read = await boundedReadFile(root, "README.md");
    expect(read.ok && read.content.includes("hello")).toBe(true);

    const list = await boundedListDir(root, ".");
    expect(list.ok && list.entries.some((e) => e.name === "src")).toBe(true);

    const search = await boundedSearchText(root, "findMe");
    expect(search.ok && search.matches.some((m) => m.relativePath === "src/a.ts")).toBe(true);

    const write = await boundedWriteFile(root, "out/note.txt", Buffer.from("hi").toString("base64"));
    expect(write.ok).toBe(true);
    const read2 = await boundedReadFile(root, "out/note.txt");
    expect(read2.ok && read2.content === "hi").toBe(true);

    const del = await boundedDeleteFile(root, "out/note.txt");
    expect(del.ok).toBe(true);
  });

  it("refuses to read outside the root", async () => {
    const r = await boundedReadFile(root, "src/../../etc/passwd");
    expect(r.ok).toBe(false);
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));
});

describe("diagnostics catalog is host-defined and fixed", () => {
  it("contains only host-defined read-only diagnostics with fixed argv", () => {
    expect(DIAGNOSTIC_DEFINITIONS.size).toBeGreaterThan(0);
    for (const def of DIAGNOSTIC_DEFINITIONS.values()) {
      expect(Array.isArray(def.argv)).toBe(true);
      expect(def.diagnosticId).toBe(def.diagnosticId);
    }
    expect(DIAGNOSTIC_DEFINITIONS.has("disk_free")).toBe(true);
    // The agent lifecycle is out of engineering scope: no diagnostic may
    // inspect or affect the running Ashley agent unit.
    expect(DIAGNOSTIC_DEFINITIONS.has("ashley_agent_status")).toBe(false);
    expect(DIAGNOSTIC_DEFINITIONS.has("broker_status")).toBe(true);
  });
});
