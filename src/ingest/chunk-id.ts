import { createHash } from "node:crypto";
import type { Chunk } from "./types.js";

// JSON encoding keeps field boundaries unambiguous (["a b"] vs ["a","b"]).
// Line numbers are left out on purpose: an edit above a chunk must not change its id.
export function chunkId(chunk: Chunk): string {
  const payload = JSON.stringify([chunk.docPath, chunk.headingPath, chunk.text]);
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16);
}
