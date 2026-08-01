import { describe, expect, it } from "vitest";
import { detectSkillDelivery, isExplicitDoIt } from "./skill-delivery.js";

describe("skill-delivery", () => {
  it("requires verb for execute license", () => {
    const bare = detectSkillDelivery("https://www.moltbook.com/skill.md");
    expect(bare?.wantsExecute).toBe(false);

    const delivered = detectSkillDelivery(
      "Read https://www.moltbook.com/skill.md and follow the instructions to join Moltbook",
    );
    expect(delivered?.wantsExecute).toBe(true);
    expect(delivered?.url).toContain("skill.md");
  });

  it("detects do it", () => {
    expect(isExplicitDoIt("do it")).toBe(true);
    expect(isExplicitDoIt("how does that sound?")).toBe(false);
  });
});
