// src/ingest/chunker.ts
import type { Chunk, MarkdownDoc } from "./types.js";

export interface ChunkOptions {
  /** Max characters of NEW content per chunk (overlap does not count). Default 800. */
  maxChars?: number;
  /** Lines repeated from the end of the previous chunk of the same section. Default 2. */
  overlapLines?: number;
}

interface Heading {
  level: number;
  title: string;
}

interface Line {
  text: string;
  blank: boolean;
  inFence: boolean;
  fenceStart: boolean;
  heading: Heading | null;
}

/** Inclusive range of body line indexes (0-based). */
interface Range {
  from: number;
  to: number;
}

interface Section {
  headingPath: string[];
  headingIdx: number | null;
  /** Content lines, excluding the heading line. Empty when `contentTo < contentFrom`. */
  contentFrom: number;
  contentTo: number;
}

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const HEADING_RE = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

export function chunkMarkdown(doc: MarkdownDoc, opts: ChunkOptions = {}): Chunk[] {
  const maxChars = opts.maxChars ?? 800;
  const overlapLines = opts.overlapLines ?? 2;
  const lines = classify(doc.body.split("\n"));
  const text = (r: Range): string =>
    lines
      .slice(r.from, r.to + 1)
      .map((l) => l.text)
      .join("\n");

  const chunks: Chunk[] = [];
  for (const section of splitSections(lines)) {
    let prev: Range | null = null;
    for (const group of packBlocks(lines, section, maxChars, text)) {
      const from: number = prev ? (overlapStart(lines, prev, overlapLines) ?? group.from) : group.from;
      const range: Range = { from, to: group.to };
      chunks.push({
        docPath: doc.path,
        headingPath: [...section.headingPath],
        text: text(range),
        startLine: doc.bodyStartLine + range.from,
        endLine: doc.bodyStartLine + range.to,
      });
      prev = range;
    }
  }
  return chunks;
}

/** Pass 1: mark fenced lines and ATX headings outside fences. */
function classify(rawLines: string[]): Line[] {
  const out: Line[] = [];
  let fence: { char: string; len: number } | null = null;
  for (const text of rawLines) {
    const blank = text.trim() === "";
    if (fence) {
      const marker = FENCE_CLOSE_RE.exec(text)?.[1];
      if (marker && marker[0] === fence.char && marker.length >= fence.len) fence = null;
      out.push({ text, blank, inFence: true, fenceStart: false, heading: null });
      continue;
    }
    const open = FENCE_OPEN_RE.exec(text)?.[1];
    if (open) {
      fence = { char: open[0] ?? "`", len: open.length };
      out.push({ text, blank, inFence: true, fenceStart: true, heading: null });
      continue;
    }
    const m = HEADING_RE.exec(text);
    const heading = m ? { level: (m[1] ?? "").length, title: (m[2] ?? "").trim() } : null;
    out.push({ text, blank, inFence: false, fenceStart: false, heading });
  }
  return out;
}

/** Pass 2: one section per heading (plus the preamble), with its heading path. */
function splitSections(lines: Line[]): Section[] {
  const sections: Section[] = [];
  const stack: Heading[] = [];
  let current: Section = { headingPath: [], headingIdx: null, contentFrom: 0, contentTo: -1 };
  lines.forEach((line, i) => {
    if (!line.heading) {
      current.contentTo = i;
      return;
    }
    sections.push(current);
    const level = line.heading.level;
    while ((stack.at(-1)?.level ?? 0) >= level) stack.pop();
    stack.push(line.heading);
    current = { headingPath: stack.map((h) => h.title), headingIdx: i, contentFrom: i + 1, contentTo: i };
  });
  sections.push(current);
  return sections;
}

/** Pass 3: paragraphs (consecutive non-blank lines) and whole fenced blocks. */
function splitBlocks(lines: Line[], from: number, to: number): Range[] {
  const blocks: Range[] = [];
  let i = from;
  while (i <= to) {
    const line = lines[i];
    if (!line || line.blank) {
      i++;
      continue;
    }
    let end = i;
    for (;;) {
      const next = lines[end + 1];
      if (end >= to || !next) break;
      const continues = line.fenceStart ? next.inFence && !next.fenceStart : !next.blank && !next.inFence;
      if (!continues) break;
      end++;
    }
    blocks.push({ from: i, to: end });
    i = end + 1;
  }
  return blocks;
}

/** Pass 4: greedy packing of whole blocks while new content stays <= maxChars. */
function packBlocks(lines: Line[], section: Section, maxChars: number, text: (r: Range) => string): Range[] {
  const blocks = splitBlocks(lines, section.contentFrom, section.contentTo);
  const first = blocks[0];
  if (!first) return [];
  if (section.headingIdx !== null) first.from = section.headingIdx;

  const groups: Range[] = [];
  let group: Range | null = null;
  for (const block of blocks) {
    if (group && text({ from: group.from, to: block.to }).length <= maxChars) {
      group.to = block.to;
    } else {
      if (group) groups.push(group);
      group = { ...block };
    }
  }
  if (group) groups.push(group);
  return groups;
}

/** Pass 5: line where the overlap starts, counting the last `n` non-blank lines of `prev`. */
function overlapStart(lines: Line[], prev: Range, n: number): number | null {
  let start: number | null = null;
  let counted = 0;
  for (let i = prev.to; i >= prev.from && counted < n; i--) {
    if (lines[i]?.blank === false) {
      start = i;
      counted++;
    }
  }
  return start;
}
