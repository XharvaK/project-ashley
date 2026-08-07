#!/usr/bin/env node
/**
 * R5B qualification-workspace provisioning helper (broker-owned packaging).
 *
 * install.sh calls this with the pinned broker node binary to stage a real,
 * self-contained `apps/agent-service` tree under the broker workspace root
 * for the `verify:agent-tsc` recipe (`cwdPolicy: workspace`).
 *
 * Packaging semantics (this is the production copy implementation):
 *
 * 1. The whole source tree is copied, preserving every symlink whose target
 *    resolves back inside the destination root. In particular npm's
 *    `node_modules/.bin/*` links stay symlinks, so a launcher such as
 *    TypeScript's `.bin/tsc` keeps pointing at `../typescript/bin/tsc` and its
 *    `require('../lib/tsc.js')` keeps resolving from `typescript/`. A plain
 *    `cp -RL` dereferences those links, and the resulting regular file then
 *    fails with `Cannot find module '../lib/tsc.js'`.
 * 2. The known `@composer-assistant/*` workspace package links (which npm
 *    created as links back into the live checkout) are materialized as real
 *    self-contained package trees (`package.json` + `dist`) copied from the
 *    configured live package roots, so the staged workspace never resolves
 *    back into the live checkout.
 * 3. Fail closed on: symlink targets that would escape the destination root,
 *    sockets/FIFOs/device nodes, setuid/setgid files, and case-colliding
 *    relative paths on case-insensitive filesystems.
 *
 * Offline and deterministic (sorted traversal); uses only Node built-ins.
 *
 * Usage:
 *   node provision-workspace.mjs \
 *     --source <agent-service-root> \
 *     --dest <workspace/apps/agent-service> \
 *     --workspace "@composer-assistant/sandbox-policy=<live-package-root>" \
 *     --workspace "@composer-assistant/sandbox-broker=<live-package-root>"
 */

import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";

function usage() {
  process.stderr.write(
    [
      "usage: provision-workspace.mjs",
      "  --source <agent-service-root>",
      "  --dest <workspace/apps/agent-service>",
      "  --workspace <scoped-name>=<live-package-root>   (repeatable)",
      "",
    ].join("\n"),
  );
  process.exitCode = 2;
}

function parseArgs(argv) {
  const parsed = { source: null, dest: null, workspace: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") {
      parsed.source = argv[i + 1];
      i += 1;
    } else if (arg === "--dest") {
      parsed.dest = argv[i + 1];
      i += 1;
    } else if (arg === "--workspace") {
      const pair = argv[i + 1];
      i += 1;
      if (typeof pair !== "string" || !pair.includes("=")) {
        return null;
      }
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const root = pair.slice(eq + 1);
      if (name === "" || root === "") return null;
      parsed.workspace.push({ name, liveRoot: resolve(root) });
    } else {
      return null;
    }
  }
  if (
    parsed.source === null ||
    parsed.dest === null ||
    parsed.source === "" ||
    parsed.dest === ""
  ) {
    return null;
  }
  parsed.source = resolve(parsed.source);
  parsed.dest = resolve(parsed.dest);
  return parsed;
}

function isWithin(root, target) {
  const r = resolve(root);
  const t = resolve(target);
  const rl = process.platform === "win32" ? r.toLowerCase() : r;
  const tl = process.platform === "win32" ? t.toLowerCase() : t;
  return tl === rl || tl.startsWith(`${rl}${sep}`);
}

function makeContext(destRoot, workspaceByName) {
  return {
    destRoot,
    workspaceByName,
    seenLower: new Set(),
    counts: { files: 0, dirs: 0, symlinks: 0, packages: 0 },
  };
}

function copyRegular(src, dest, mode) {
  copyFileSync(src, dest);
  if (process.platform !== "win32") chmodSync(dest, mode & 0o777);
}

function copyTree(src, dest, ctx, label) {
  const st = lstatSync(src);
  if (st.isDirectory()) {
    mkdirSync(dest, { recursive: false });
    if (process.platform !== "win32") chmodSync(dest, st.mode & 0o777);
    for (const name of readdirSync(src).sort()) {
      copyTree(join(src, name), join(dest, name), ctx, `${label}/${name}`);
    }
    return;
  }
  if (st.isFile()) {
    if (st.mode & (0o4000 | 0o2000)) {
      throw new Error(`privileged_file_forbidden:${label}`);
    }
    copyRegular(src, dest, st.mode);
    return;
  }
  if (st.isSymbolicLink()) {
    throw new Error(`symlink_in_package_forbidden:${label}`);
  }
  throw new Error(`special_file_forbidden:${label}`);
}

function materializePackage(destPath, liveRoot, ctx) {
  mkdirSync(destPath, { recursive: false });
  for (const entry of ["package.json", "dist"]) {
    const src = join(liveRoot, entry);
    const dst = join(destPath, entry);
    if (!existsSync(src)) {
      throw new Error(`workspace_package_missing:${entry}:${liveRoot}`);
    }
    copyTree(src, dst, ctx, entry);
  }
  ctx.counts.packages += 1;
}

function walk(sourceDir, destDir, rel, ctx) {
  for (const name of readdirSync(sourceDir).sort()) {
    const childRel = rel === "" ? name : `${rel}/${name}`;
    const lower = childRel.toLowerCase();
    if (ctx.seenLower.has(lower)) {
      throw new Error(`case_collision:${childRel}`);
    }
    ctx.seenLower.add(lower);

    const childSrc = join(sourceDir, name);
    const childDest = join(destDir, name);
    const st = lstatSync(childSrc);

    if (st.isSymbolicLink()) {
      const workspacePkg = ctx.workspaceByName.get(childRel);
      if (workspacePkg !== undefined) {
        materializePackage(childDest, workspacePkg.liveRoot, ctx);
        continue;
      }
      const target = readlinkSync(childSrc);
      const resolvedTarget = resolve(dirname(childDest), target);
      if (isAbsolute(target) || !isWithin(ctx.destRoot, resolvedTarget)) {
        throw new Error(`escaping_symlink:${childRel}->${target}`);
      }
      symlinkSync(target, childDest);
      ctx.counts.symlinks += 1;
      continue;
    }

    if (st.isDirectory()) {
      mkdirSync(childDest, { recursive: false });
      if (process.platform !== "win32") chmodSync(childDest, st.mode & 0o777);
      ctx.counts.dirs += 1;
      walk(childSrc, childDest, childRel, ctx);
      continue;
    }

    if (st.isFile()) {
      if (st.mode & (0o4000 | 0o2000)) {
        throw new Error(`privileged_file_forbidden:${childRel}`);
      }
      copyRegular(childSrc, childDest, st.mode);
      ctx.counts.files += 1;
      continue;
    }

    throw new Error(`special_file_forbidden:${childRel}`);
  }
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === null) {
    usage();
    return;
  }

  const sourceSt = lstatSync(parsed.source);
  if (!sourceSt.isDirectory()) {
    throw new Error(`source_not_directory:${parsed.source}`);
  }
  if (!isAbsolute(parsed.dest) || parsed.dest === sep) {
    throw new Error(`dest_must_be_absolute_subdirectory:${parsed.dest}`);
  }
  if (
    parsed.dest === parsed.source ||
    isWithin(parsed.source, parsed.dest) ||
    isWithin(parsed.dest, parsed.source)
  ) {
    throw new Error(`source_dest_overlap:${parsed.source}:${parsed.dest}`);
  }

  const workspaceByName = new Map();
  for (const pkg of parsed.workspace) {
    const rel = `node_modules/${pkg.name}`;
    if (workspaceByName.has(rel)) {
      throw new Error(`duplicate_workspace:${pkg.name}`);
    }
    const liveSt = lstatSync(pkg.liveRoot);
    if (!liveSt.isDirectory()) {
      throw new Error(`workspace_package_not_directory:${pkg.name}`);
    }
    workspaceByName.set(rel, pkg);
  }

  if (existsSync(parsed.dest)) {
    rmSync(parsed.dest, { recursive: true, force: true });
  }
  mkdirSync(parsed.dest, { recursive: true });

  const ctx = makeContext(parsed.dest, workspaceByName);
  walk(parsed.source, parsed.dest, "", ctx);

  const { counts } = ctx;
  process.stdout.write(
    `provisioned files=${counts.files} dirs=${counts.dirs} symlinks=${counts.symlinks} packages=${counts.packages}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`provision-workspace: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
