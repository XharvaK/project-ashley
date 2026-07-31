export type ChatChannel = "discord" | "voice" | "telegram";

export type MemMessage = {
  id: number;
  thread_id: string;
  owner_id: string;
  role: "user" | "assistant" | "system";
  text: string;
  channel: ChatChannel;
  token_estimate: number | null;
  audit_session_id: string | null;
  ts: string;
};

export type MemFactCategory =
  | "project"
  | "preference"
  | "person"
  | "ongoing"
  | "pinned"
  | "identity"
  | "event"
  | "pattern";

export type MemFact = {
  id: number;
  owner_id: string;
  category: MemFactCategory;
  key: string;
  value: string;
  confidence: number;
  importance: number;
  sensitivity: "none" | "pharma" | "health" | "private";
  valid_until: string | null;
  source_message_id: number | null;
  last_confirmed_at: string;
  superseded_by: number | null;
  last_accessed: string | null;
  access_count: number;
};

export type MemReflection = {
  id: number;
  owner_id: string;
  period_start: string;
  period_end: string;
  body: string;
  model: string;
  created_at: string;
};

export type MemChunk = {
  id: number;
  owner_id: string;
  thread_id: string;
  message_id: number;
  chunk_index: number;
  text: string;
  channel: ChatChannel;
  embedding: Buffer;
};

import type { QueryMode } from "./recall.js";

export type AssembledContext = {
  memoryBlock: string;
  hotMessages: Array<{ role: "user" | "assistant"; content: string }>;
  threadId: string;
  queryMode: QueryMode;
  repeatRecall: boolean;
};

export type FactInput = {
  category: MemFact["category"];
  key: string;
  value: string;
  confidence: number;
  sensitivity?: MemFact["sensitivity"];
  valid_until?: string | null;
  supersedes_key?: string | null;
};
