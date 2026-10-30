import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface AdrInput {
  title: string;
  context: string;
  decision: string;
  consequences: string;
  status: "proposed" | "accepted";
}

export function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Next ADR number = highest existing NNNN prefix + 1. */
export async function nextAdrNumber(dir: string): Promise<number> {
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    // directory does not exist yet
  }
  const numbers = files
    .map((f) => /^(\d{4})-/.exec(f)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

export function renderAdr(n: number, input: AdrInput, date: string): string {
  return [
    `# ADR-${String(n).padStart(4, "0")}: ${input.title}`,
    "",
    `- Status: ${input.status}`,
    `- Date: ${date}`,
    "",
    "## Context",
    input.context.trim(),
    "",
    "## Decision",
    input.decision.trim(),
    "",
    "## Consequences",
    input.consequences.trim(),
    "",
  ].join("\n");
}

/** Writes docs/adr/NNNN-slug.md under `root`. Returns the repo-relative path. */
export async function createAdr(root: string, input: AdrInput, now = new Date()): Promise<string> {
  const slug = slugify(input.title);
  if (!slug) throw new Error("title has no usable characters");
  const dir = join(root, "docs", "adr");
  await mkdir(dir, { recursive: true });
  const n = await nextAdrNumber(dir);
  const name = `${String(n).padStart(4, "0")}-${slug}.md`;
  // flag "wx": fail instead of overwriting if two calls race on the same number.
  await writeFile(join(dir, name), renderAdr(n, input, now.toISOString().slice(0, 10)), { flag: "wx" });
  return `docs/adr/${name}`;
}
