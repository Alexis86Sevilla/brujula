// src/ingest/chunker.ts
import type { Chunk, MarkdownDoc } from "./types.js";

export interface ChunkOptions {
  /** Max characters of NEW content per chunk (overlap does not count). Default 800. */
  maxChars?: number;
  /** Lines repeated from the end of the previous chunk of the same section. Default 2. */
  overlapLines?: number;
}

export function chunkMarkdown(_doc: MarkdownDoc, _opts: ChunkOptions = {}): Chunk[] {
  throw new Error("not implemented");
}
