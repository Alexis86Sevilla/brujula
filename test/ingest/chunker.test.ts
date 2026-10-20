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

describe("chunkMarkdown: tables", () => {
  it("keeps a table larger than maxChars in one chunk and sends the next paragraph to the following chunk", () => {
    const table = ["| h1 | h2 |", "| -- | -- |", "| r1 | x |", "| r2 | y |"];
    const body = ["# Doc", "", ...table, "", "After para"].join("\n");
    const chunks = chunkMarkdown(doc(body), { maxChars: 20, overlapLines: 0 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ text: `# Doc\n\n${table.join("\n")}`, startLine: 1, endLine: 6 });
    expect(chunks[1]).toMatchObject({ text: "After para", startLine: 8, endLine: 8 });
  });

  it("separates a paragraph line from a table that follows it without a blank line", () => {
    const table = ["| a | b |", "| - | - |", "| 1 | 2 |"];
    const body = ["# Doc", "", "Intro line", ...table].join("\n");
    const chunks = chunkMarkdown(doc(body), { maxChars: 30, overlapLines: 0 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ text: "# Doc\n\nIntro line", startLine: 1, endLine: 3 });
    expect(chunks[1]).toMatchObject({ text: table.join("\n"), startLine: 4, endLine: 6 });
  });

  it("gives no overlap to a chunk that follows a chunk ending in a table", () => {
    const body = [
      "# Doc", //        1
      "", //             2
      "| a | b |", //    3
      "| - | - |", //    4
      "| 1 | 2 |", //    5
      "| 3 | 4 |", //    6
      "", //             7
      "Tail one", //     8
      "Tail two", //     9
    ].join("\n");
    const chunks = chunkMarkdown(doc(body), { maxChars: 30, overlapLines: 2 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ startLine: 1, endLine: 6 });
    expect(chunks[1]).toMatchObject({ text: "Tail one\nTail two", startLine: 8, endLine: 9 });
    expect(chunks[1]?.text.startsWith("|")).toBe(false);
  });
});

describe("chunkMarkdown: setext headings", () => {
  it("creates sections from setext headings; the chunk starts at the title line", () => {
    const body = [
      "Title", //   1
      "=====", //   2
      "", //        3
      "intro", //   4
      "", //        5
      "Sub", //     6
      "-----", //   7
      "", //        8
      "body", //    9
    ].join("\n");
    const chunks = chunkMarkdown(doc(body));
    expect(chunks.map((c) => c.headingPath)).toEqual([["Title"], ["Title", "Sub"]]);
    expect(chunks[0]).toMatchObject({ text: "Title\n=====\n\nintro", startLine: 1, endLine: 4 });
    expect(chunks[1]).toMatchObject({ text: "Sub\n-----\n\nbody", startLine: 6, endLine: 9 });
  });

  it("treats a --- line preceded by a blank line as a thematic break, not a heading", () => {
    const body = ["# Doc", "", "para one", "", "---", "para two"].join("\n");
    const chunks = chunkMarkdown(doc(body));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ headingPath: ["Doc"], text: body, startLine: 1, endLine: 6 });
  });

  it("does not create sections from setext-looking lines inside a fenced block", () => {
    const body = ["# Doc", "", "```md", "Fake", "=====", "Sub", "-----", "```"].join("\n");
    const chunks = chunkMarkdown(doc(body));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ headingPath: ["Doc"], text: body });
  });

  it("pops the heading stack correctly when ATX and setext headings are mixed", () => {
    const body = [
      "Top", //        1
      "===", //        2
      "", //           3
      "## Mid", //     4
      "", //           5
      "mid text", //   6
      "", //           7
      "Deep", //       8
      "----", //       9
      "", //           10
      "deep text", //  11
      "", //           12
      "# Next", //     13
      "", //           14
      "next text", //  15
    ].join("\n");
    const chunks = chunkMarkdown(doc(body));
    expect(chunks.map((c) => c.headingPath)).toEqual([["Top", "Mid"], ["Top", "Deep"], ["Next"]]);
    expect(chunks[0]).toMatchObject({ text: "## Mid\n\nmid text", startLine: 4, endLine: 6 });
    expect(chunks[1]).toMatchObject({ text: "Deep\n----\n\ndeep text", startLine: 8, endLine: 11 });
    expect(chunks[2]).toMatchObject({ text: "# Next\n\nnext text", startLine: 13, endLine: 15 });
  });

  it("never uses a table row as a setext title", () => {
    const body = ["# Doc", "", "| a | b |", "-----", "", "text"].join("\n");
    const chunks = chunkMarkdown(doc(body));
    expect(chunks.map((c) => c.headingPath)).toEqual([["Doc"]]);
  });
});

describe("chunkMarkdown: tables and setext invariants", () => {
  it("every chunk is the exact slice of the file between startLine and endLine", () => {
    const body = [
      "Intro",
      "",
      "Title",
      "=====",
      "",
      "para line",
      "| a | b |",
      "| - | - |",
      "| 1 | 2 |",
      "",
      "Sub",
      "-----",
      "",
      "| x | y |",
      "| - | - |",
      "",
      "tail one",
      "tail two",
      "tail three",
    ].join("\n");
    const start = 3;
    const lines = body.split("\n");
    for (const overlapLines of [0, 1, 2]) {
      const chunks = chunkMarkdown(doc(body, start), { maxChars: 40, overlapLines });
      expect(chunks.length).toBeGreaterThan(3);
      for (const c of chunks) {
        expect(c.startLine).toBeLessThanOrEqual(c.endLine);
        expect(lines.slice(c.startLine - start, c.endLine - start + 1).join("\n")).toBe(c.text);
      }
    }
  });
});
