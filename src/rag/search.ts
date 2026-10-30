import { existsSync } from "node:fs";
import { closeDb, matchChunks, openDb, type RagDb } from "./db.js";
import { defaultDbPath } from "./index-docs.js";
import type { SearchFn, SearchHit } from "./types.js";

// Common Spanish and English function words. With OR semantics they would match almost every chunk.
const STOPWORDS = new Set(
  (
    "el la los las un una unos unas de del al y o u e en a por para con sin sobre entre que qué cual cuál cuales " +
    "como cómo cuando cuándo donde dónde quien quién es son ser esta está están se su sus lo le les mi me " +
    "hay ha han no si sí mas más pero the a an of to in on for and or is are was be it this that what how when where who which " +
    "do does with from by as at"
  ).split(" "),
);

const MAX_TERMS = 12;

/**
 * Turns free text into a safe FTS5 MATCH expression: only letter/digit runs survive, each one is a
 * quoted string (so FTS5 operators like AND/NOT/NEAR and punctuation are inert), joined with OR.
 * Terms of 4+ chars also match as prefixes ("chunk" finds "chunks"). Returns null when no usable term is left.
 */
export function sanitizeQuery(query: string): string | null {
  const seen = new Set<string>();
  for (const raw of query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (STOPWORDS.has(raw) || (raw.length < 2 && !/\d/.test(raw))) continue;
    seen.add(raw);
    if (seen.size >= MAX_TERMS) break;
  }
  if (seen.size === 0) return null;
  return [...seen].map((t) => (t.length >= 4 ? `"${t}"*` : `"${t}"`)).join(" OR ");
}

/**
 * Abstention rule: return NOTHING (so the agent says "I do not know") when
 *  1. no chunk matches any query term, or
 *  2. the best normalised score (-bm25) is below MIN_SCORE.
 * The threshold comes from eval/rag-cases.json (npm run rag:eval): out-of-scope questions only matched a
 * generic word ("equipo") and scored <= 1.5; every answerable question scored >= 4.3. 3.0 sits in that gap.
 * It is a value for this small corpus, not a constant: recalibrate it when the corpus or tokenizer changes.
 */
export const MIN_SCORE = 3.0;

export interface SearchOptions {
  limit?: number;
  /** Only chunks whose source starts with this prefix, e.g. "docs/adr/". */
  pathPrefix?: string;
  minScore?: number;
}

export function searchDocs(db: RagDb, query: string, opts: SearchOptions = {}): SearchHit[] {
  const match = sanitizeQuery(query);
  if (match === null) return [];
  const limit = opts.limit ?? 5;
  const rows = matchChunks(db, match, opts.pathPrefix, limit);
  // SQLite bm25() is negative and lower is better; negate so a higher score is better.
  const hits = rows.map<SearchHit>((r) => ({
    source: r.source,
    heading: r.heading,
    startLine: r.start_line,
    endLine: r.end_line,
    score: -r.bm25,
    text: r.text,
  }));
  const best = hits[0]?.score ?? 0;
  return best < (opts.minScore ?? MIN_SCORE) ? [] : hits;
}

export class IndexMissingError extends Error {
  constructor() {
    super("The docs index does not exist. Ask the user to run `npm run rag:index`, then try again.");
  }
}

/** SearchFn over the on-disk index. Opens it read-only per call so a reindex while the server runs is picked up. */
export function createSearchFn(
  root: string,
  dbPath: string = defaultDbPath(root),
  opts: Pick<SearchOptions, "minScore"> = {},
): SearchFn {
  return async (query, limit) => {
    if (!existsSync(dbPath)) throw new IndexMissingError();
    const db = openDb(dbPath, { readOnly: true });
    try {
      return searchDocs(db, query, { limit, ...opts });
    } finally {
      closeDb(db);
    }
  };
}
