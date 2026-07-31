import { describe, expect, it } from "vitest";
import { buildChatMessages } from "./chat-messages.js";

const system = "you are ashley";

describe("buildChatMessages", () => {
  it("ends with exactly one user turn carrying the current message", () => {
    const messages = buildChatMessages({
      system,
      hot: [
        { role: "user", content: "hey" },
        { role: "assistant", content: "hey you" },
      ],
      message: "still up?",
    });

    expect(messages.at(-1)).toEqual({ role: "user", content: "still up?" });
    expect(messages.filter((m) => m.content === "still up?")).toHaveLength(1);
  });

  it("drops a trailing hot turn that repeats the current message", () => {
    const messages = buildChatMessages({
      system,
      hot: [
        { role: "assistant", content: "hey you" },
        { role: "user", content: "still up?" },
      ],
      message: "still up?",
    });

    expect(messages).toEqual([
      { role: "system", content: system },
      { role: "assistant", content: "hey you" },
      { role: "user", content: "still up?" },
    ]);
  });

  it("keeps a genuine repeat that Doc sent twice with a reply between", () => {
    const messages = buildChatMessages({
      system,
      hot: [
        { role: "user", content: "you there" },
        { role: "assistant", content: "yeah" },
      ],
      message: "you there",
    });

    expect(messages.filter((m) => m.content === "you there")).toHaveLength(2);
  });

  it("keeps hot history when it ends on an assistant turn", () => {
    const messages = buildChatMessages({
      system,
      hot: [{ role: "assistant", content: "night" }],
      message: "morning",
    });

    expect(messages).toHaveLength(3);
  });

  it("attaches images to the current turn only", () => {
    const messages = buildChatMessages({
      system,
      hot: [{ role: "user", content: "look" }],
      message: "look at this",
      imageUrls: ["https://cdn.example/a.png"],
    });

    expect(messages.at(-1)).toEqual({
      role: "user",
      content: "look at this",
      imageUrls: ["https://cdn.example/a.png"],
    });
    expect(messages.filter((m) => m.imageUrls)).toHaveLength(1);
  });

  it("puts fetched web text in a user turn before his message, never in system", () => {
    const messages = buildChatMessages({
      system,
      hot: [{ role: "assistant", content: "sure" }],
      message: "latest bun version?",
      searchContext: "<<<web\n- Bun 1.3\nweb>>>",
    });

    expect(messages[0]?.content).toBe(system);
    expect(messages.at(-2)).toEqual({
      role: "user",
      content: "<<<web\n- Bun 1.3\nweb>>>",
    });
    expect(messages.at(-1)?.content).toBe("latest bun version?");
  });

  it("leaves imageUrls unset when there are none", () => {
    const messages = buildChatMessages({
      system,
      hot: [],
      message: "hey",
      imageUrls: [],
    });

    expect(messages.at(-1)).toEqual({ role: "user", content: "hey" });
  });
});
