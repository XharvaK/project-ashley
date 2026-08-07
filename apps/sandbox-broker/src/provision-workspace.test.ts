/**
 * Regression tests for the R5B qualification-workspace provisioning
 * (`deploy/linux-mint/sandbox/provision-workspace.mjs`).
 *
 * The production copy previously used `cp -RL`, which dereferences every
 * symlink. npm's `node_modules/.bin/tsc` is a symlink to
 * `../typescript/bin/tsc`, and TypeScript's launcher resolves
 * `require('../lib/tsc.js')` relative to its own real location. Once the
 * `.bin/tsc` link is dereferenced into a regular file, Node resolves that
 * require from `node_modules/.bin/`, producing
 * `Cannot find module '../lib/tsc.js'`.
 *
 * These tests execute the real helper against fixture trees and assert:
 *  - `.bin/tsc` stays a working symlink (the regression cannot reproduce);
 *  - `@composer-assistant/*` workspace links become self-contained real trees;
 *  - escaping/absolute symlink targets fail closed.
 */

import { describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  statSync,
  symlinkSync,
  writeFileSync,
  lstatSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const win = process.platform === "win32";

const HELPER_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "deploy",
  "linux-mint",
  "sandbox",
  "provision-workspace.mjs",
);

function makeTree(root: string, files: Record<string, string>): string {
  for (const [rel, content] of Object.entries(files)) {
    const native = path.join(root, ...rel.split("/"));
    mkdirSync(path.dirname(native), { recursive: true });
    writeFileSync(native, content);
  }
  return root;
}

function makeDirSymlink(target: string, linkPath: string): void {
  mkdirSync(path.dirname(linkPath), { recursive: true });
  symlinkSync(target, linkPath, win ? "junction" : "dir");
}

function runHelper(args: string[]) {
  return spawnSync(process.execPath, [HELPER_PATH, ...args], {
    encoding: "utf8",
  });
}

function runProvision(
  source: string,
  dest: string,
  workspaceLinks: { name: string; liveRoot: string }[],
) {
  const args = ["--source", source, "--dest", dest];
  for (const link of workspaceLinks) {
    args.push("--workspace", `${link.name}=${link.liveRoot}`);
  }
  return runHelper(args);
}

describe("R5B qualification workspace provisioning", () => {
  it.skipIf(win)(
    "preserves npm .bin/tsc as a symlink so the TypeScript launcher resolves",
    () => {
      const source = mkdtempSync(path.join(tmpdir(), "ashley-prov-src-"));
      makeTree(source, {
        "package.json": "{}",
        "node_modules/typescript/bin/tsc":
          "#!/usr/bin/env node\nrequire('../lib/tsc.js')\n",
        "node_modules/typescript/lib/tsc.js": "console.log('tsc-lib-loaded')\n",
      });
      mkdirSync(path.join(source, "node_modules", ".bin"), { recursive: true });
      symlinkSync(
        "../typescript/bin/tsc",
        path.join(source, "node_modules", ".bin", "tsc"),
      );

      const dest = mkdtempSync(path.join(tmpdir(), "ashley-prov-dst-"));
      const result = runProvision(source, dest, []);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");

      const stagedBin = path.join(dest, "node_modules", ".bin", "tsc");
      expect(lstatSync(stagedBin).isSymbolicLink()).toBe(true);
      expect(readlinkSync(stagedBin)).toBe("../typescript/bin/tsc");

      const run = spawnSync(process.execPath, [stagedBin], { encoding: "utf8" });
      expect(run.status).toBe(0);
      expect(run.stdout).toContain("tsc-lib-loaded");
      expect(run.stdout).not.toContain("Cannot find module '../lib/tsc.js'");
    },
  );

  it("materializes @composer-assistant workspace links as self-contained real trees", () => {
    const root = mkdtempSync(path.join(tmpdir(), "ashley-prov-ws-"));
    const policyLive = makeTree(path.join(root, "sandbox-policy"), {
      "package.json": JSON.stringify({ name: "@composer-assistant/sandbox-policy" }),
      "dist/index.js": "module.exports = 1;",
      "dist/index.d.ts": "export declare const x = 1;",
    });
    const brokerLive = makeTree(path.join(root, "sandbox-broker"), {
      "package.json": JSON.stringify({ name: "@composer-assistant/sandbox-broker" }),
      "dist/index.js": "module.exports = 2;",
      "dist/index.d.ts": "export declare const y = 2;",
    });

    const source = makeTree(path.join(root, "agent-service"), {
      "package.json": "{}",
      "src/index.ts": "export {};",
    });
    makeDirSymlink(policyLive, path.join(source, "node_modules", "@composer-assistant", "sandbox-policy"));
    makeDirSymlink(brokerLive, path.join(source, "node_modules", "@composer-assistant", "sandbox-broker"));

    const dest = path.join(root, "workspace-apps", "agent-service");
    const result = runProvision(source, dest, [
      { name: "@composer-assistant/sandbox-policy", liveRoot: policyLive },
      { name: "@composer-assistant/sandbox-broker", liveRoot: brokerLive },
    ]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");

    const stagedPolicy = path.join(dest, "node_modules", "@composer-assistant", "sandbox-policy");
    const stagedBroker = path.join(dest, "node_modules", "@composer-assistant", "sandbox-broker");
    for (const staged of [stagedPolicy, stagedBroker]) {
      expect(lstatSync(staged).isSymbolicLink()).toBe(false);
      expect(statSync(staged).isDirectory()).toBe(true);
    }
    expect(statSync(path.join(stagedPolicy, "package.json")).isFile()).toBe(true);
    expect(statSync(path.join(stagedPolicy, "dist", "index.d.ts")).isFile()).toBe(true);
    expect(statSync(path.join(stagedBroker, "dist", "index.d.ts")).isFile()).toBe(true);

    // Nothing in the staged tree may resolve back into the live checkout root.
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        const st = lstatSync(full);
        if (st.isDirectory()) out.push(...walk(full));
        else if (st.isSymbolicLink()) out.push(full);
      }
      return out;
    };
    expect(walk(dest)).toEqual([]);
  });

  it("fails closed on absolute or escaping symlink targets", () => {
    const source = mkdtempSync(path.join(tmpdir(), "ashley-prov-esc-src-"));
    makeTree(source, {
      "package.json": "{}",
      "node_modules/evil/index.js": "module.exports = 0;",
    });
    // Absolute target that points outside the destination tree.
    const outside = mkdtempSync(path.join(tmpdir(), "ashley-prov-outside-"));
    const linkPath = path.join(source, "node_modules", "evil", "escape");
    mkdirSync(path.dirname(linkPath), { recursive: true });
    symlinkSync(outside, linkPath, win ? "junction" : "dir");

    const dest = mkdtempSync(path.join(tmpdir(), "ashley-prov-esc-dst-"));
    const result = runProvision(source, dest, []);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/escaping_symlink/);
  });

  it("cleans a stale destination (idempotent repair of a broken workspace)", () => {
    const source = mkdtempSync(path.join(tmpdir(), "ashley-prov-repair-src-"));
    makeTree(source, {
      "package.json": "{}",
      "src/index.ts": "export {};",
    });
    const dest = mkdtempSync(path.join(tmpdir(), "ashley-prov-repair-dst-"));
    // Simulate the previously-broken workspace: a dereferenced .bin/tsc.
    makeTree(path.join(dest, "agent-service"), {
      "package.json": "{}",
      "node_modules/.bin/tsc": "#!/usr/bin/env node\nrequire('../lib/tsc.js')\n",
    });

    const result = runProvision(source, path.join(dest, "agent-service"), []);
    expect(result.status).toBe(0);
    expect(statSync(path.join(dest, "agent-service", "src", "index.ts")).isFile()).toBe(true);
    expect(statSync(path.join(dest, "agent-service", "package.json")).isFile()).toBe(true);
    expect(
      existsSync(path.join(dest, "agent-service", "node_modules", ".bin", "tsc")),
    ).toBe(false);
  });
});
