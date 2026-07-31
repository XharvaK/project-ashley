import type { Message } from "discord.js";

/**
 * Before this, a photo with no caption produced literally nothing: the handler
 * trimmed the empty content and returned. Ignoring what a friend sends you is
 * about as unhuman as it gets, so images go to the model and everything else
 * arrives as an honest note about what she cannot open.
 */
export const MAX_IMAGES = 4;

const IMAGE_TYPES = /^image\/(png|jpeg|jpg|webp|gif|avif)$/i;

export type Intake = {
  /** What the agent sees as Doc's turn. */
  text: string;
  /** Public Discord CDN links, fetched by Mistral for vision. */
  imageUrls: string[];
  hasMedia: boolean;
};

function seconds(value: number | null | undefined): string {
  if (!value) return "";
  return ` ${Math.round(value)}s`;
}

export function describeIntake(message: Message): Intake {
  const imageUrls: string[] = [];
  const notes: string[] = [];

  for (const attachment of message.attachments.values()) {
    const type = attachment.contentType ?? "";
    const isImage = IMAGE_TYPES.test(type.split(";")[0]!.trim());

    if (isImage && imageUrls.length < MAX_IMAGES) {
      imageUrls.push(attachment.url);
      notes.push("an image, which you can see");
      continue;
    }
    if (isImage) {
      notes.push("another image you did not open");
      continue;
    }
    if (attachment.duration !== null && type.startsWith("audio/")) {
      notes.push(
        `a voice note${seconds(attachment.duration)}, which you cannot listen to`,
      );
      continue;
    }
    if (type.startsWith("audio/")) {
      notes.push("an audio file you cannot listen to");
      continue;
    }
    if (type.startsWith("video/")) {
      notes.push("a video you cannot watch");
      continue;
    }
    notes.push(
      `a file called ${attachment.name ?? "something"} that you cannot open`,
    );
  }

  for (const sticker of message.stickers.values()) {
    notes.push(`the "${sticker.name}" sticker`);
  }

  const parts: string[] = [];
  const content = message.content.trim();
  if (content) parts.push(content);
  if (notes.length > 0) {
    parts.push(`(Doc sent ${notes.join(", ")}.)`);
  }

  return {
    text: parts.join("\n"),
    imageUrls,
    hasMedia: notes.length > 0,
  };
}
