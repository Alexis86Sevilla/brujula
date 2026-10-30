import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chunkMarkdown } from "../ingest/chunker.js";
import { loadMarkdown } from "../ingest/loader.js";
import type { Chunk as IngestChunk } from "../ingest/types.js";
import { findMarkdownFiles } from "../ingest/walk.js";
import type { Chunk } from "./types.js";

/** Same value as `git hash-object <file>`: sha1 of "blob <bytes>\0" + content. No .git needed. */
export function gitBlobHash(content: Buffer | string): string {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  return createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
}

/** Maps the ingest chunk (docPath, headingPath[]) to the RAG contract (source, heading). */
export function toChunk(c: IngestChunk): Chunk {
  return {
    source: c.docPath,
    heading: c.headingPath.join(" > "),
    startLine: c.startLine,
    endLine: c.endLine,
    text: c.text,
  };
}

const EXCLUDED_SEGMENTS = new Set(["clientes", "customers", "secrets"]);

/** Explicit exclusion list from .claude/rules/rag.md: secrets files and customer folders. */
export function isExcludedPath(source: string): boolean {
  const parts = source.split("/");
  const name = (parts.at(-1) ?? "").toLowerCase();
  if (name.startsWith(".env") || name.endsWith(".pem") || name.endsWith(".key")) return true;
  return parts.slice(0, -1).some((p) => EXCLUDED_SEGMENTS.has(p.toLowerCase()));
}

const CREDENTIAL_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/,
  /\b(?:password|passwd|pwd|secret|token|api[_-]?key|client[_-]?secret)\b["']?\s*[:=]\s*["']?[^\s"'<>$]{8,}/i,
];

/** True when a chunk looks like it contains a credential; such chunks are never indexed. */
export function looksLikeCredential(text: string): boolean {
  return CREDENTIAL_PATTERNS.some((re) => re.test(text));
}

export interface CorpusFile {
  source: string;
  hash: string;
  chunks: Chunk[];
  /** Chunks dropped because they looked like credentials. */
  rejected: number;
}

/** Lists the indexable files of `<root>/<dir>`: sorted, exclusion list applied, sources relative to `root`. */
export async function listCorpusSources(root: string, dir = "docs"): Promise<string[]> {
  const found = await findMarkdownFiles(join(root, dir));
  const prefix = dir === "" || dir === "." ? "" : `${dir.replace(/\/+$/, "")}/`;
  return found.map((f) => `${prefix}${f}`).filter((s) => !isExcludedPath(s));
}

/** Reads, hashes and chunks one file. `doc.path` is forced to the relative source so citations never leak absolute paths. */
export async function loadCorpusFile(root: string, source: string): Promise<CorpusFile> {
  const full = join(root, source);
  const hash = gitBlobHash(await readFile(full));
  const doc = await loadMarkdown(full);
  doc.path = source;
  const all = chunkMarkdown(doc, { maxChars: 1200 }).map(toChunk);
  const chunks = all.filter((c) => !looksLikeCredential(c.text));
  return { source, hash, chunks, rejected: all.length - chunks.length };
}
