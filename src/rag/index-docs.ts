import { closeDb, getFileHashes, openDb, removeFile, replaceFile, countChunks } from "./db.js";
import { listCorpusSources, loadCorpusFile } from "./chunks.js";

export interface IndexOptions {
  /** Repo root; sources are relative to it. */
  root: string;
  /** Corpus directory relative to root. Default "docs". */
  dir?: string;
  /** Index file. Default `<root>/.cache/brujula-rag.sqlite`. */
  dbPath?: string;
}

export interface IndexReport {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  chunks: number;
  rejectedChunks: number;
}

export function defaultDbPath(root: string): string {
  return `${root.replace(/\/+$/, "")}/.cache/brujula-rag.sqlite`;
}

/** Incremental: a file is re-chunked only when its git blob hash changed; vanished files lose their chunks. */
export async function indexCorpus(opts: IndexOptions): Promise<IndexReport> {
  const db = openDb(opts.dbPath ?? defaultDbPath(opts.root));
  try {
    const known = getFileHashes(db);
    const sources = await listCorpusSources(opts.root, opts.dir ?? "docs");
    const report: IndexReport = { added: 0, updated: 0, removed: 0, unchanged: 0, chunks: 0, rejectedChunks: 0 };
    for (const source of sources) {
      const file = await loadCorpusFile(opts.root, source);
      const old = known.get(source);
      if (old === file.hash) {
        report.unchanged++;
        continue;
      }
      replaceFile(db, source, file.hash, file.chunks);
      report.rejectedChunks += file.rejected;
      if (old === undefined) report.added++;
      else report.updated++;
    }
    const present = new Set(sources);
    for (const source of known.keys()) {
      if (!present.has(source)) {
        removeFile(db, source);
        report.removed++;
      }
    }
    report.chunks = countChunks(db);
    return report;
  } finally {
    closeDb(db);
  }
}
