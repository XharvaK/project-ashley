import type { DatabaseSync } from "node:sqlite";
import { listSources, parseFeed, upsertSource, urlKey } from "./feed.js";
import {
  fetchValidatedResource,
  type FetchLike,
  type ResolveHost,
} from "./network.js";

type Candidate = {
  id: number;
  url: string;
  title: string;
  kind: "rss" | "atom" | "json";
  interest: string;
  status: "proposed" | "probation";
  successfulFetches: number;
};

export async function processSourceProbation(
  db: DatabaseSync,
  dependencies: { fetcher?: FetchLike; resolve?: ResolveHost } = {},
): Promise<{ activated: number; probationSuccesses: number; errors: string[] }> {
  const rows = db.prepare(
    `SELECT id, url, title, kind, interest, status, successful_fetches
     FROM cur_source_candidates
     WHERE status IN ('proposed', 'probation')
     ORDER BY successful_fetches DESC, id ASC LIMIT 6`,
  ).all() as Array<Record<string, unknown>>;
  const candidates: Candidate[] = rows.map((row) => ({
    id: Number(row.id),
    url: String(row.url),
    title: String(row.title),
    kind: row.kind === "atom" || row.kind === "json" ? row.kind : "rss",
    interest: String(row.interest),
    status: row.status === "probation" ? "probation" : "proposed",
    successfulFetches: Number(row.successful_fetches ?? 0),
  }));
  const existingKeys = new Set(listSources(db, 200).map((source) => urlKey(source.url)));
  let activated = 0;
  let probationSuccesses = 0;
  const errors: string[] = [];
  for (const candidate of candidates) {
    const key = urlKey(candidate.url);
    if (existingKeys.has(key)) {
      db.prepare(
        `UPDATE cur_source_candidates SET status = 'rejected', last_error = 'duplicate', updated_at = ?
         WHERE id = ?`,
      ).run(new Date().toISOString(), candidate.id);
      continue;
    }
    try {
      const resource = await fetchValidatedResource(candidate.url, {
        accept: "application/rss+xml, application/atom+xml, application/json, text/xml;q=0.9",
        ...dependencies,
      });
      const finalKey = urlKey(resource.finalUrl);
      if (existingKeys.has(finalKey) && finalKey !== key) {
        db.prepare(
          `UPDATE cur_source_candidates SET status = 'rejected', last_error = 'redirect_duplicate', updated_at = ?
           WHERE id = ?`,
        ).run(new Date().toISOString(), candidate.id);
        continue;
      }
      const parsed = parseFeed(new TextDecoder().decode(resource.body), 3);
      if (parsed.length === 0) throw new Error("feed_parse_empty");
      const successes = candidate.successfulFetches + 1;
      const canActivate = successes >= 3 && listSources(db, 200).length < 100;
      db.prepare(
        `UPDATE cur_source_candidates
         SET status = ?, successful_fetches = ?, last_error = NULL, updated_at = ?
         WHERE id = ?`,
      ).run(canActivate ? "active" : "probation", successes, new Date().toISOString(), candidate.id);
      probationSuccesses++;
      if (canActivate) {
        upsertSource(db, {
          slug: `discovered-${candidate.id}`,
          title: candidate.title,
          kind: candidate.kind,
          url: resource.finalUrl,
          interest: candidate.interest,
          weight: 0.5,
        });
        existingKeys.add(finalKey);
        activated++;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      db.prepare(
        `UPDATE cur_source_candidates
         SET status = 'probation', last_error = ?, updated_at = ? WHERE id = ?`,
      ).run(message.slice(0, 500), new Date().toISOString(), candidate.id);
      errors.push(`candidate:${candidate.id}:${message}`);
    }
  }
  return { activated, probationSuccesses, errors };
}
