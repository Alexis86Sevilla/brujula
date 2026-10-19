import { describe, expect, it } from "vitest";
import { chunkMarkdown } from "../../src/ingest/chunker.js";
import type { MarkdownDoc } from "../../src/ingest/types.js";

function doc(body: string, bodyStartLine = 1): MarkdownDoc {
  return { path: "wiki/guia.md", frontmatter: {}, title: "Guía", body, bodyStartLine };
}

const A = "a".repeat(100);
const B = "b".repeat(100);
const C = "c".repeat(100);
const D = "d".repeat(100);
const E = "e".repeat(100);
const F = "f".repeat(100);
const LONG = [A, B, C, D, E, F].join("\n\n");

describe("chunkMarkdown: structure", () => {
  const body = [
    "Intro text.", //            1
    "", //                       2
    "# Guía", //                 3
    "", //                       4
    "## Instalar", //            5
    "", //                       6
    "Paso uno.", //              7
    "", //                       8
    "## Usar", //                9
    "", //                       10
    "Paso dos.", //              11
  ].join("\n");

  it("splits by heading, keeps the heading path and skips heading-only sections", () => {
    const chunks = chunkMarkdown(doc(body));
    expect(chunks.map((c) => c.headingPath)).toEqual([[], ["Guía", "Instalar"], ["Guía", "Usar"]]);
    expect(chunks[0]).toMatchObject({ text: "Intro text.", startLine: 1, endLine: 1 });
    expect(chunks[1]).toMatchObject({ text: "## Instalar\n\nPaso uno.", startLine: 5, endLine: 7 });
    expect(chunks[2]).toMatchObject({ text: "## Usar\n\nPaso dos.", startLine: 9, endLine: 11 });
    expect(chunks.every((c) => c.docPath === "wiki/guia.md")).toBe(true);
  });

  it("reports line numbers relative to the original file, not to the body", () => {
    const [chunk] = chunkMarkdown(doc("# A\n\ntexto", 5));
    expect(chunk).toMatchObject({ startLine: 5, endLine: 7 });
  });

  it("pops the heading path when a heading of the same or higher level appears", () => {
    const chunks = chunkMarkdown(doc("# A\n\n## B\n\nb\n\n### C\n\nc\n\n## D\n\nd\n\n# E\n\ne"));
    expect(chunks.map((c) => c.headingPath)).toEqual([["A", "B"], ["A", "B", "C"], ["A", "D"], ["E"]]);
  });

  it("returns no chunks for an empty or whitespace-only body", () => {
    expect(chunkMarkdown(doc(""))).toEqual([]);
    expect(chunkMarkdown(doc("\n\n  \n"))).toEqual([]);
  });

  it("does not treat # lines inside a fenced code block as headings", () => {
    const chunks = chunkMarkdown(doc("# Doc\n\n```bash\n# comentario\necho hi\n```\n"));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.headingPath).toEqual(["Doc"]);
    expect(chunks[0]?.text).toContain("# comentario");
  });
});

describe("chunkMarkdown: size and overlap", () => {
  it("packs whole paragraphs up to maxChars and keeps the heading with the first block", () => {
    const chunks = chunkMarkdown(doc(`# Doc\n\n${LONG}`), { maxChars: 250, overlapLines: 0 });
    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.text).toBe(`# Doc\n\n${A}\n\n${B}`);
    expect(chunks[1]?.text).toBe(`${C}\n\n${D}`);
    expect(chunks[2]?.text).toBe(`${E}\n\n${F}`);
    expect(chunks.every((c) => c.headingPath.join() === "Doc")).toBe(true);
  });

  it("repeats the last overlapLines lines of the previous chunk at the start of the next", () => {
    const chunks = chunkMarkdown(doc(`# Doc\n\n${LONG}`), { maxChars: 250, overlapLines: 1 });
    expect(chunks).toHaveLength(3);
    expect(chunks[1]?.startLine).toBe(chunks[0]?.endLine);
    expect(chunks[1]?.text.startsWith(B)).toBe(true);
    expect(chunks[2]?.text.startsWith(D)).toBe(true);
  });

  it("never splits a fenced code block, even if it is larger than maxChars", () => {
    const fence = "```ts\n" + "const x = 1;\n".repeat(40) + "```";
    const chunks = chunkMarkdown(doc(`# Doc\n\n${fence}\n\nDespués.`), { maxChars: 100, overlapLines: 0 });
    const withFence = chunks.filter((c) => c.text.includes("```"));
    expect(withFence).toHaveLength(1);
    expect(withFence[0]?.text.match(/```/g)).toHaveLength(2);
    expect(chunks.at(-1)?.text).toBe("Después.");
  });

  it("uses sane defaults", () => {
    const chunks = chunkMarkdown(doc(`# Doc\n\n${LONG.repeat(3)}`));
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.every((c) => c.text.length > 0)).toBe(true);
  });

  it("invariant: every chunk is the exact slice of the file between startLine and endLine", () => {
    const body = ["Pre", "", "# T", "", "## S1", "", LONG, "", "## S2", "", "```", "# x", "```", "", LONG].join("\n");
    const start = 4;
    const lines = body.split("\n");
    for (const overlapLines of [0, 1, 2]) {
      const chunks = chunkMarkdown(doc(body, start), { maxChars: 220, overlapLines });
      expect(chunks.length).toBeGreaterThan(3);
      for (const c of chunks) {
        expect(c.startLine).toBeLessThanOrEqual(c.endLine);
        expect(lines.slice(c.startLine - start, c.endLine - start + 1).join("\n")).toBe(c.text);
      }
    }
  });
});
