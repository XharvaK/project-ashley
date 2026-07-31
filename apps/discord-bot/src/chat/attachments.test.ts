import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Message } from "discord.js";
import { describeIntake } from "./attachments.js";

type FakeAttachment = {
  url: string;
  contentType: string | null;
  name?: string | null;
  duration?: number | null;
};

function fakeMessage(params: {
  content?: string;
  attachments?: FakeAttachment[];
  stickers?: string[];
}): Message {
  return {
    content: params.content ?? "",
    attachments: new Map(
      (params.attachments ?? []).map((a, i) => [
        String(i),
        { duration: null, name: null, ...a },
      ]),
    ),
    stickers: new Map(
      (params.stickers ?? []).map((name, i) => [String(i), { name }]),
    ),
  } as unknown as Message;
}

describe("describeIntake", () => {
  it("passes plain text through untouched", () => {
    const intake = describeIntake(fakeMessage({ content: "hey" }));
    assert.equal(intake.text, "hey");
    assert.deepEqual(intake.imageUrls, []);
    assert.equal(intake.hasMedia, false);
  });

  it("gives an uncaptioned image a turn instead of dropping it", () => {
    const intake = describeIntake(
      fakeMessage({
        attachments: [
          { url: "https://cdn.example/a.png", contentType: "image/png" },
        ],
      }),
    );
    assert.deepEqual(intake.imageUrls, ["https://cdn.example/a.png"]);
    assert.match(intake.text, /image, which you can see/);
  });

  it("keeps the caption and the note apart", () => {
    const intake = describeIntake(
      fakeMessage({
        content: "look at this",
        attachments: [
          { url: "https://cdn.example/a.jpg", contentType: "image/jpeg" },
        ],
      }),
    );
    assert.equal(
      intake.text,
      "look at this\n(Doc sent an image, which you can see.)",
    );
  });

  it("is honest about a voice note", () => {
    const intake = describeIntake(
      fakeMessage({
        attachments: [
          {
            url: "https://cdn.example/v.ogg",
            contentType: "audio/ogg",
            duration: 14.4,
          },
        ],
      }),
    );
    assert.deepEqual(intake.imageUrls, []);
    assert.match(intake.text, /voice note 14s, which you cannot listen to/);
  });

  it("names a file it cannot open", () => {
    const intake = describeIntake(
      fakeMessage({
        attachments: [
          {
            url: "https://cdn.example/x.pdf",
            contentType: "application/pdf",
            name: "notes.pdf",
          },
        ],
      }),
    );
    assert.match(intake.text, /file called notes\.pdf that you cannot open/);
  });

  it("caps images at four and mentions the rest", () => {
    const attachments = Array.from({ length: 6 }, (_, i) => ({
      url: `https://cdn.example/${i}.png`,
      contentType: "image/png",
    }));
    const intake = describeIntake(fakeMessage({ attachments }));
    assert.equal(intake.imageUrls.length, 4);
    assert.match(intake.text, /another image you did not open/);
  });

  it("treats a sticker as a message", () => {
    const intake = describeIntake(fakeMessage({ stickers: ["thumbs up"] }));
    assert.equal(intake.text, '(Doc sent the "thumbs up" sticker.)');
    assert.equal(intake.hasMedia, true);
  });

  it("handles a content type with parameters", () => {
    const intake = describeIntake(
      fakeMessage({
        attachments: [
          {
            url: "https://cdn.example/a.webp",
            contentType: "image/webp; charset=binary",
          },
        ],
      }),
    );
    assert.deepEqual(intake.imageUrls, ["https://cdn.example/a.webp"]);
  });

  it("stays empty when there is genuinely nothing", () => {
    assert.equal(describeIntake(fakeMessage({})).text, "");
  });
});
