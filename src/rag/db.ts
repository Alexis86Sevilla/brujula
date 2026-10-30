// The ONLY module that touches node:sqlite (experimental in Node 22). If its API changes, fix it here.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Chunk } from "./types.js";

export interface RagDb {
  readonly raw: DatabaseSync;
}

export function openDb(path: string, opts: { readOnly?: boolean } = {}): RagDb {
  if (!opts.readOnly) mkdirSync(dirname(path), { recursive: true });
  const raw = new DatabaseSync(path, { readOnly: opts.readOnly ?? false });
  if (!opts.readOnly) {
    raw.exec(`
      CREATE TABLE IF NOT EXISTS files (source TEXT PRIMARY KEY, hash TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
        heading, text,
        source UNINDEXED, start_line UNINDEXED, end_line UNINDEXED,
        tokenize = 'unicode61 remove_diacritics 2'
      );
    `);
  }
  return { raw };
}

export function closeDb(db: RagDb): void {
  db.raw.close();
}

const fileRow = z.object({ source: z.string(), hash: z.string() });

/** source -> git blob hash of the indexed version. */
export function getFileHashes(db: RagDb): Map<string, string> {
  const rows = z.array(fileRow).parse(db.raw.prepare("SELECT source, hash FROM files").all());
  return new Map(rows.map((r) => [r.source, r.hash]));
}

/** Atomically replaces every chunk of `source` and records its hash. */
export function replaceFile(db: RagDb, source: string, hash: string, chunks: Chunk[]): void {
  db.raw.exec("BEGIN");
  try {
    db.raw.prepare("DELETE FROM chunks WHERE source = ?").run(source);
    const insert = db.raw.prepare(
      "INSERT INTO chunks (heading, text, source, start_line, end_line) VALUES (?, ?, ?, ?, ?)",
    );
    for (const c of chunks) insert.run(c.heading, c.text, c.source, c.startLine, c.endLine);
    db.raw.prepare("INSERT OR REPLACE INTO files (source, hash) VALUES (?, ?)").run(source, hash);
    db.raw.exec("COMMIT");
  } catch (e) {
    db.raw.exec("ROLLBACK");
    throw e;
  }
}

export function removeFile(db: RagDb, source: string): void {
  db.raw.exec("BEGIN");
  try {
    db.raw.prepare("DELETE FROM chunks WHERE source = ?").run(source);
    db.raw.prepare("DELETE FROM files WHERE source = ?").run(source);
    db.raw.exec("COMMIT");
  } catch (e) {
    db.raw.exec("ROLLBACK");
    throw e;
  }
}

export function countChunks(db: RagDb): number {
  const row = z.object({ n: z.number() }).parse(db.raw.prepare("SELECT count(*) AS n FROM chunks").get());
  return row.n;
}

const matchRow = z.object({
  source: z.string(),
  heading: z.string(),
  text: z.string(),
  start_line: z.coerce.number().int(),
  end_line: z.coerce.number().int(),
  bm25: z.number(),
});
export type MatchRow = z.infer<typeof matchRow>;

/** Runs an already sanitised FTS5 MATCH expression. `bm25` is negative: lower is better. */
export function matchChunks(db: RagDb, match: string, pathPrefix: string | undefined, limit: number): MatchRow[] {
  const prefix = pathPrefix ? `${pathPrefix.replace(/[\\%_]/g, "\\$&")}%` : null;
  const sql = `
    SELECT source, heading, text, start_line, end_line, bm25(chunks, 3.0, 1.0, 0.0, 0.0, 0.0) AS bm25
    FROM chunks
    WHERE chunks MATCH ? ${prefix ? "AND source LIKE ? ESCAPE '\\'" : ""}
    ORDER BY bm25 LIMIT ?`;
  const params = prefix ? [match, prefix, limit] : [match, limit];
  return z.array(matchRow).parse(db.raw.prepare(sql).all(...params));
}
