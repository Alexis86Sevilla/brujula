import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface WalkOptions {
  /** Directory names to skip at any depth. Default: [".git", ".attachments", "node_modules"]. */
  ignoreDirs?: string[];
}

const DEFAULT_IGNORE_DIRS = [".git", ".attachments", "node_modules"];

export async function findMarkdownFiles(root: string, opts: WalkOptions = {}): Promise<string[]> {
  const ignore = new Set(opts.ignoreDirs ?? DEFAULT_IGNORE_DIRS);
  const found: string[] = [];

  // `rel` is kept as POSIX segments so results are stable across platforms.
  async function walk(rel: string[]): Promise<void> {
    const entries = await readdir(join(root, ...rel), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!ignore.has(entry.name)) await walk([...rel, entry.name]);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        found.push([...rel, entry.name].join("/"));
      }
    }
  }

  await walk([]);
  // Code-unit order, not locale order, so the output is deterministic.
  return found.sort();
}
