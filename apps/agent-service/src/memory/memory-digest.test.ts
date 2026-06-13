import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildMemoryDigestItems,
  sanitizeDigestLine,
} from "./memory-digest.js";

vi.mock("../mistral-client.js", () => ({
  completeChat: vi.fn(),
}));

vi.mock("../prompts.js", () => ({
  loadCorePrompt: () => "# Ashley\nYou are Ashley.",
}));

import { completeChat } from "../mistral-client.js";

const mockedComplete = vi.mocked(completeChat);

describe("memory-digest", () => {
  beforeEach(() => {
    mockedComplete.mockReset();
  });

  it("sanitizes LLM output", () => {
    expect(sanitizeDigestLine('Not ettim: Proje benmişim!\n')).toBe(
      "Proje benmişim!",
    );
    expect(sanitizeDigestLine('"Tek cümle."')).toBe("Tek cümle.");
  });

  it("builds display via LLM", async () => {
    mockedComplete.mockResolvedValue({
      text: "Demek proje benmişim — üzerimde çalışıyorsun.",
      model: "test",
    });

    const items = await buildMemoryDigestItems(
      [
        {
          category: "project",
          key: "current_project",
          value: "composer-assistant (Ashley)",
        },
      ],
      "cursordaki projem sensin şapşik",
      "discord",
    );

    expect(mockedComplete).toHaveBeenCalledOnce();
    expect(items[0]?.display).toBe(
      "Demek proje benmişim — üzerimde çalışıyorsun.",
    );
    expect(items[0]?.value).toBe("composer-assistant (Ashley)");
  });

  it("falls back to stored value when LLM fails", async () => {
    mockedComplete.mockRejectedValue(new Error("api down"));

    const items = await buildMemoryDigestItems(
      [{ category: "pinned", key: "pinned_1", value: "Kuzenin sitesi bekliyor" }],
      "bunu hatırla: kuzen",
      "discord",
    );

    expect(items[0]?.display).toBe("Kuzenin sitesi bekliyor");
  });
});
