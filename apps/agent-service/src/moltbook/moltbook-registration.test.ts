import { describe, expect, it, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../memory/db.js";
import {
  getMoltbookCredentials,
  saveMoltbookCredentials,
} from "./moltbook-registration.js";
import type { MoltbookCredentials } from "./moltbook-client.js";

describe("moltbook-registration", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    migrate(db);
  });

  it("saves and retrieves moltbook credentials", () => {
    expect(getMoltbookCredentials(db)).toBeNull();

    const creds: MoltbookCredentials = {
      api_key: "test_key_123",
      agent_name: "Ashley",
      claim_url: "https://www.moltbook.com/claim/123",
      registeredAt: new Date().toISOString(),
    };

    saveMoltbookCredentials(db, creds);

    const saved = getMoltbookCredentials(db);
    expect(saved?.api_key).toBe("test_key_123");
    expect(saved?.agent_name).toBe("Ashley");
    expect(saved?.claim_url).toBe("https://www.moltbook.com/claim/123");
  });
});
