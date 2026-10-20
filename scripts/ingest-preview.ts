// Usage: npx tsx scripts/ingest-preview.ts <docs-dir> [--maxChars 800] [--overlap 2] [--json]
import { join } from "node:path";
import { chunkMarkdown } from "../src/ingest/chunker.js";
import { chunkId } from "../src/ingest/chunk-id.js";
import { loadMarkdown } from "../src/ingest/loader.js";
import { findMarkdownFiles } from "../src/ingest/walk.js";

function flag(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const raw = i === -1 ? undefined : process.argv[i + 1];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const root = process.argv[2];
if (!root || root.startsWith("--")) {
  console.error("usage: tsx scripts/ingest-preview.ts <docs-dir> [--maxChars N] [--overlap N] [--json]");
  process.exit(2);
}
const maxChars = flag("maxChars", 800);
const overlapLines = flag("overlap", 2);
const asJson = process.argv.includes("--json");

const files = await findMarkdownFiles(root);
const all: Array<ReturnType<typeof chunkMarkdown>[number] & { id: string }> = [];
const failed: string[] = [];

for (const rel of files) {
  try {
    const doc = await loadMarkdown(join(root, rel));
    for (const c of chunkMarkdown({ ...doc, path: rel }, { maxChars, overlapLines })) {
      all.push({ ...c, id: chunkId(c) });
    }
  } catch (err) {
    failed.push(`${rel}: ${(err as Error).message.split("\n")[0]}`);
  }
}

if (asJson) {
  for (const c of all) console.log(JSON.stringify(c));
} else {
  const sizes = all.map((c) => c.text.length).sort((a, b) => a - b);
  const pct = (p: number) => sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * p))] ?? 0;
  console.log(`files: ${files.length}  chunks: ${all.length}  failed: ${failed.length}`);
  console.log(`chunk size (chars): min ${sizes[0] ?? 0}  p50 ${pct(0.5)}  p90 ${pct(0.9)}  max ${sizes.at(-1) ?? 0}`);
  console.log(`duplicate ids: ${all.length - new Set(all.map((c) => c.id)).size}`);
  for (const f of failed) console.log(`FAILED ${f}`);
  for (const c of all.slice(0, 5)) {
    console.log(`\n${c.id}  ${c.docPath}:${c.startLine}-${c.endLine}  ${c.headingPath.join(" > ") || "(preamble)"}`);
  }
}
process.exit(failed.length ? 1 : 0);