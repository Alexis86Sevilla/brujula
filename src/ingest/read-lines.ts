import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Chunk } from "./types.js";

/** Returns lines startLine..endLine (1-based, inclusive) of a document under `root`. */
export function readLines(root: string, docPath: string, startLine: number, endLine: number): string {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) {
    throw new RangeError(`Invalid line range: ${startLine}-${endLine}`);
  }
  const base = resolve(root);
  const full = resolve(base, docPath);
  const rel = relative(base, full);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Path escapes root: ${docPath}`);
  }
  const lines = readFileSync(full, "utf8").split("\n");
  return lines.slice(startLine - 1, endLine).join("\n");
}

/** Human-readable citation, e.g. `wiki/guia.md#L5-L7`. */
export function citationLabel(chunk: Pick<Chunk, "docPath" | "startLine" | "endLine">): string {
  return `${chunk.docPath}#L${chunk.startLine}-L${chunk.endLine}`;
}
