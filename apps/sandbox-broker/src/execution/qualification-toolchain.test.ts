import { describe, expect, it } from "vitest";
import {
  BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT,
  validateQualificationToolchain,
  type QualificationToolContractEntry,
} from "./qualification-toolchain.js";

type SyntheticProbe = {
  readonly executable?: boolean;
  readonly resolved?: string;
};

function syntheticFilesystem(probes: Readonly<Record<string, SyntheticProbe>>) {
  return {
    lstatSync(path: string) {
      if (!(path in probes)) throw new Error(`missing:${path}`);
      return {};
    },
    accessSync(path: string) {
      if (!probes[path]?.executable) throw new Error(`not_executable:${path}`);
    },
    realpathSync(path: string) {
      const resolved = probes[path]?.resolved;
      if (resolved === undefined) throw new Error(`unresolved:${path}`);
      return resolved;
    },
  };
}

function probesFor(
  tools: readonly QualificationToolContractEntry[],
): Record<string, SyntheticProbe> {
  return Object.fromEntries(
    tools.map((tool) => [tool.path, { executable: true, resolved: tool.path }]),
  );
}

describe("validateQualificationToolchain", () => {
  it("declares the exact reviewed eight-tool contract in order", () => {
    expect(BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT.map((tool) => tool.path)).toEqual([
      "/usr/bin/dash",
      "/usr/bin/bash",
      "/usr/bin/timeout",
      "/usr/bin/env",
      "/usr/bin/sleep",
      "/usr/bin/rm",
      "/usr/bin/true",
      "/usr/bin/yes",
    ]);
    expect(BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT.every((tool) =>
      tool.visibleRoots.join(",") === "/usr,/lib,/lib64",
    )).toBe(true);
  });

  it("accepts executable synthetic probes resolved within visible roots", () => {
    const tools = BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT;
    expect(validateQualificationToolchain(tools, syntheticFilesystem(probesFor(tools)))).toEqual({
      status: "valid",
      tools,
    });

    const interpreterTarget = probesFor(tools);
    interpreterTarget["/usr/bin/dash"] = {
      executable: true,
      resolved: "/lib64/ld-linux-x86-64.so.2",
    };
    expect(validateQualificationToolchain(tools, syntheticFilesystem(interpreterTarget))).toEqual({
      status: "valid",
      tools,
    });
  });

  it("fails closed for missing and non-executable exact paths", () => {
    const tools = BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT;
    const missing = probesFor(tools);
    delete missing["/usr/bin/dash"];
    expect(validateQualificationToolchain(tools, syntheticFilesystem(missing))).toEqual({
      status: "invalid",
      reason: "qualification_probe_toolchain_invalid:dash",
    });

    const nonExecutable = probesFor(tools);
    nonExecutable["/usr/bin/bash"] = { executable: false, resolved: "/usr/bin/bash" };
    expect(validateQualificationToolchain(tools, syntheticFilesystem(nonExecutable))).toEqual({
      status: "invalid",
      reason: "qualification_probe_toolchain_invalid:bash",
    });
  });

  it.each(["/etc/alternatives/dash", "/home/ashley/dash", "/opt/unreviewed/dash"])(
    "rejects a symlink target outside visible roots: %s",
    (resolved) => {
      const tools = BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT;
      const probes = probesFor(tools);
      probes["/usr/bin/dash"] = { executable: true, resolved };

      expect(validateQualificationToolchain(tools, syntheticFilesystem(probes))).toEqual({
        status: "invalid",
        reason: "qualification_probe_toolchain_invalid:dash",
      });
    },
  );

  it("rejects relative paths, duplicate entries, and sibling-prefix targets", () => {
    const tools = BUBBLEWRAP_QUALIFICATION_TOOL_CONTRACT;
    const relative = [{ ...tools[0], path: "usr/bin/dash" }, ...tools.slice(1)];
    expect(validateQualificationToolchain(relative, syntheticFilesystem(probesFor(tools)))).toEqual({
      status: "invalid",
      reason: "qualification_probe_toolchain_invalid:dash",
    });

    const duplicate = [...tools, tools[0]];
    expect(validateQualificationToolchain(duplicate, syntheticFilesystem(probesFor(tools)))).toEqual({
      status: "invalid",
      reason: "qualification_probe_toolchain_invalid:dash",
    });

    const probes = probesFor(tools);
    probes["/usr/bin/dash"] = { executable: true, resolved: "/usr-local/bin/dash" };
    expect(validateQualificationToolchain(tools, syntheticFilesystem(probes))).toEqual({
      status: "invalid",
      reason: "qualification_probe_toolchain_invalid:dash",
    });
  });
});
