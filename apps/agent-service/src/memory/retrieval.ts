import type { DatabaseSync } from "node:sqlite";
import { env } from "../env.js";
import { embedTexts } from "../mistral-client.js";
import { bufferToFloat32, cosineSimilarity } from "./embeddings.js";
import { isTextDenied } from "./correction-denylist.js";
import type { ChatChannel } from "./types.js";

export type ScoredChunk = {
  text: string;
  score: number;
  channel: ChatChannel;
  role?: "user" | "assistant" | null;
};

function recencyDecay(isoDate: string): number {
  const days =
    (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-days / 14);
}

export function retrieveChunks(
  db: DatabaseSync,
  ownerId: string,
  queryEmbedding: Float32Array,
  currentChannel: ChatChannel,
  topK = env.memoryRetrievalTopK,
  minScore = env.memoryRetrievalMinScore,
  denylist: string[] = [],
): ScoredChunk[] {
  const rows = db
    .prepare(
      `SELECT c.text, c.channel, c.embedding, c.created_at, c.token_estimate, m.role
       FROM mem_chunks c
       LEFT JOIN mem_messages m ON c.message_id = m.id
       WHERE c.owner_id = ? AND c.deleted_at IS NULL`,
    )
    .all(ownerId) as Array<{
    text: string;
    channel: ChatChannel;
    embedding: Buffer;
    created_at: string;
    token_estimate: number | null;
    role: "user" | "assistant" | null;
  }>;

  const scored: ScoredChunk[] = [];
  for (const row of rows) {
    if (denylist.length > 0 && isTextDenied(row.text, denylist)) continue;
    if ((row.token_estimate ?? row.text.length / 4) < 5 && row.channel === "voice") {
      continue;
    }
    const emb = bufferToFloat32(row.embedding);
    const cosine = cosineSimilarity(queryEmbedding, emb);
    if (cosine < minScore) continue;

    const score =
      0.7 * cosine +
      0.2 * recencyDecay(row.created_at) +
      0.1 * (row.channel === currentChannel ? 1 : 0);

    scored.push({ text: row.text, score, channel: row.channel, role: row.role });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export function paraphraseSnippet(text: string, role?: string | null): string {
  const cleaned = text
    .replace(/^(user|assistant|doc|ashley):\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
    
  if (role === "user") return `[Doc]: ${cleaned}`;
  if (role === "assistant") return `[Ashley]: ${cleaned}`;
  return cleaned;
}
