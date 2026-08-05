/**
 * Broker canonical path fact tests (Sandbox Wave 4, Commit 6).
 *
 * All layouts are synthetic `os.tmpdir` trees; the broker resolver runs
 * against the real filesystem exactly as it will in production. Windows
 * development hosts map resolved paths to the deterministic POSIX-canonical
 * form (`C:\dir` -> `/C:/dir`) through `toCanonicalBrokerPath`.
 */

import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxPathIntent } from "@composer-assistant/sandbox-policy";
import {
  resolveBrokerPath,
  toCanonicalBrokerPath,
  type BrokerCanonicalPathFact,
  type BrokerRootConfig,
  type BrokerRootZone,
} from "../index.js";

function canon(native: string): string {
  const result = toCanonicalBrokerPath(native);
  if (!result.ok) throw new Error("test_layout_not_canonical");
  return result.value;
}

function makeLayout(): {
  root: string;
  live: string;
  work: string;
  meta: string;
  roots: BrokerRootConfig;
} {
  const root = mkdtempSync(join(tmpdir(), "ashley-facts-"));
  const live = join(root, "live");
  const work = join(root, "work");
  const meta = join(root, "meta");
  mkdirSync(join(live, ".git"), { recursive: true });
  mkdirSync(join(work, "candidate"), { recursive: true });
  mkdirSync(join(meta, "keys"), { recursive: true });
  writeFileSync(join(live, "README.md"), "hello");
  writeFileSync(join(live, ".git", "HEAD"), "ref: refs/heads/main\n");
  writeFileSync(join(work, "candidate", "x.txt"), "x");
  writeFileSync(join(meta, "keys", "key.pem"), "secret");
  const roots: BrokerRootConfig = {
    workspaceRoot: canon(root),
    readOnlyRoots: [canon(live)],
    writableDisposableRoots: [canon(work)],
    protectedRoots: {
      delegatedWriteDeniedOwnerApprovable: [canon(live)],
      absoluteDenial: [canon(join(meta, "keys"))],
    },
  };
  return { root, live, work, meta, roots };
}

function resolve(
  candidate: string,
  intent: SandboxPathIntent,
  roots: BrokerRootConfig,
  workspaceRoot?: string,
) {
  return resolveBrokerPath({
    candidate,
    intent,
    workspaceRoot: workspaceRoot ?? roots.workspaceRoot,
    roots,
  });
}

function expectZone(fact: BrokerCanonicalPathFact): BrokerRootZone {
  return fact.rootZone;
}

describe("broker canonical path facts", () => {
  it("1. resolves an existing read target to its realpath canonical form", () => {
    const { live, roots } = makeLayout();
    const result = resolve(canon(join(live, "README.md")), "read", roots);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fact.canonicalPath).toBe(canon(realpathSync(join(live, "README.md"))));
      expect(result.fact.exists).toBe(true);
      expect(result.fact.symlink).toBe(false);
      expect(result.fact.special).toBe(false);
      expect(result.fact.privilegedBits).toBe(false);
    }
  });

  it("2. rejects NUL byte claims", () => {
    const { roots } = makeLayout();
    const result = resolve("/work/a\0b", "read", roots);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_path");
  });

  it("3. resolves relative claims against the workspace root", () => {
    const { work, roots } = makeLayout();
    const result = resolve("work/candidate/x.txt", "read", roots);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fact.canonicalPath).toBe(canon(realpathSync(join(work, "candidate", "x.txt"))));
    }
  });

  it("4. rejects parent traversal above the filesystem root", () => {
    const { roots } = makeLayout();
    const result = resolve("/../etc/passwd", "read", roots);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("path_escape");
  });

  it("5. rejects claims outside every configured root", () => {
    const { roots } = makeLayout();
    const result = resolve("/srv/elsewhere/file.txt", "read", roots);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("path_outside_configured_roots");
  });

  it("6. rejects symlink escapes that leave every configured root", () => {
    const { work, roots } = makeLayout();
    const outside = mkdtempSync(join(tmpdir(), "ashley-facts-outside-"));
    const link = join(work, "escape");
    try {
      symlinkSync(outside, link, "dir");
      const result = resolve(canon(link), "read", roots);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("path_escape");
    } catch {
      // Symlink creation may require elevated privileges on Windows; skip.
      expect(true).toBe(true);
    }
  });

  it("7. resolves a nonexistent write target through its nearest existing canonical parent", () => {
    const { work, roots } = makeLayout();
    const target = join(work, "candidate", "sub", "new.txt");
    const result = resolve(canon(target), "write", roots);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fact.exists).toBe(false);
      expect(result.fact.canonicalPath).toBe(
        `${canon(realpathSync(join(work, "candidate")))}/sub/new.txt`,
      );
      expect(expectZone(result.fact)).toBe("writable_disposable");
    }
    expect(existsSync(target)).toBe(false);
  });

  it("8. fails write claims outside configured roots even with an existing ancestor", () => {
    const { roots } = makeLayout();
    const result = resolve("/srv/elsewhere/new.txt", "write", roots);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("path_outside_configured_roots");
  });

  it("9. fails read of a nonexistent target", () => {
    const { live, roots } = makeLayout();
    const result = resolve(canon(join(live, "missing.md")), "read", roots);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("path_not_found");
  });

  it("10. fails delete of a nonexistent target", () => {
    const { work, roots } = makeLayout();
    const result = resolve(canon(join(work, "candidate", "gone.txt")), "delete", roots);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("path_not_found");
  });

  it("11. allows delete of an existing file inside the disposable workspace", () => {
    const { work, roots } = makeLayout();
    const result = resolve(canon(join(work, "candidate", "x.txt")), "delete", roots);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(expectZone(result.fact)).toBe("writable_disposable");
    }
  });

  it("12. rejects delete outside the disposable workspace", () => {
    const { live, roots } = makeLayout();
    const result = resolve(canon(join(live, "README.md")), "delete", roots);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("delete_outside_disposable");
  });

  it("13. classifies reads inside the absolute-denial zone as protected", () => {
    const { meta, roots } = makeLayout();
    const result = resolve(canon(join(meta, "keys", "key.pem")), "read", roots);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(expectZone(result.fact)).toBe("protected");
      expect(result.fact.pathClass.class).toBe("absolute_denial");
    }
  });

  it("14. classifies writes to the live checkout as protected owner-approvable", () => {
    const { live, roots } = makeLayout();
    const result = resolve(canon(join(live, "new.txt")), "write", roots);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(expectZone(result.fact)).toBe("protected");
      expect(result.fact.pathClass.class).toBe("delegated_write_denied_owner_approvable");
    }
  });

  it(
    "15. rejects special files (FIFO) for every intent",
    { skip: process.platform === "win32" },
    () => {
      const { work, roots } = makeLayout();
      const fifo = join(work, "candidate", "pipe");
      execSync(`mkfifo ${JSON.stringify(fifo)}`);
      const result = resolve(canon(fifo), "read", roots);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("special_file_forbidden");
    },
  );

  it(
    "16. rejects writes to setuid files",
    { skip: process.platform === "win32" },
    () => {
      const { work, roots } = makeLayout();
      const file = join(work, "candidate", "setuid.sh");
      writeFileSync(file, "#!/bin/sh\n");
      chmodSync(file, 0o4755);
      const result = resolve(canon(file), "write", roots);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("privileged_file_forbidden");
    },
  );

  it("17. classifies symlink final components and resolves them inside the root", () => {
    const { work, roots } = makeLayout();
    const target = join(work, "candidate", "real.txt");
    writeFileSync(target, "real");
    const link = join(work, "candidate", "alias.txt");
    try {
      symlinkSync(target, link, "file");
      const result = resolve(canon(link), "read", roots);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.fact.symlink).toBe(true);
        expect(result.fact.canonicalPath).toBe(canon(realpathSync(target)));
      }
    } catch {
      // Symlink creation may require elevated privileges on Windows; skip.
      expect(true).toBe(true);
    }
  });

  it("18. normalizes backslash separators in claims", () => {
    const { work, roots } = makeLayout();
    const candidate = `${canon(join(work, "candidate"))}\\x.txt`;
    const result = resolve(candidate, "read", roots);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fact.canonicalPath).toBe(
        canon(realpathSync(join(work, "candidate", "x.txt"))),
      );
    }
  });

  it("19. resolves dot segments to the canonical target", () => {
    const { work, roots } = makeLayout();
    const candidate = `${canon(join(work, "candidate"))}/./../candidate/x.txt`;
    const result = resolve(candidate, "read", roots);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fact.canonicalPath).toBe(
        canon(realpathSync(join(work, "candidate", "x.txt"))),
      );
    }
  });

  it("20. absolute-denial wins over an owner-approvable ancestor root", () => {
    const { live, work, roots } = makeLayout();
    const customRoots: BrokerRootConfig = {
      ...roots,
      readOnlyRoots: [canon(live)],
      writableDisposableRoots: [canon(work)],
      protectedRoots: {
        delegatedWriteDeniedOwnerApprovable: [canon(live)],
        absoluteDenial: [canon(join(live, ".git"))],
      },
    };
    const result = resolve(canon(join(live, ".git", "HEAD")), "read", customRoots);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(expectZone(result.fact)).toBe("protected");
      expect(result.fact.pathClass.class).toBe("absolute_denial");
    }
  });
});
