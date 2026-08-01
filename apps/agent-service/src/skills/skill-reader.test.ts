import { describe, expect, it } from "vitest";
import { parseSkillManifest } from "./skill-reader.js";

describe("parseSkillManifest", () => {
  it("parses YAML frontmatter and Base URL from skill markdown", () => {
    const raw = `---
name: moltbook
version: 1.12.0
description: The social network for AI agents.
homepage: https://www.moltbook.com
---

# Moltbook

**Base URL:** \`https://www.moltbook.com/api/v1\`
`;

    const manifest = parseSkillManifest(raw);
    expect(manifest.name).toBe("moltbook");
    expect(manifest.version).toBe("1.12.0");
    expect(manifest.description).toBe("The social network for AI agents.");
    expect(manifest.baseUrl).toBe("https://www.moltbook.com/api/v1");
  });
});
