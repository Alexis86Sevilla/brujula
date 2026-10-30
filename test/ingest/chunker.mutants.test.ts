// test/ingest/chunker.mutants.test.ts
// Tests written from surviving Stryker mutants. Each one pins a rule of docs/specs/ingest.md.
import { describe, expect, it } from "vitest";
import { chunkMarkdown } from "../../src/ingest/chunker.js";
import type { MarkdownDoc } from "../../src/ingest/types.js";

function doc(body: string, bodyStartLine = 1): MarkdownDoc {
  return { path: "wiki/guia.md", frontmatter: {}, title: "Guía", body, bodyStartLine };
}

const A = "a".repeat(100);
const B = "b".repeat(100);

describe("chunkMarkdown: boundaries (surviving mutants)", () => {
  it("keeps two blocks together when they fit maxChars exactly, and splits at one char less", () => {
    const body = `${A}\n\n${B}`; // 202 chars
    expect(chunkMarkdown(doc(body), { maxChars: 202, overlapLines: 0 })).toHaveLength(1);
    expect(chunkMarkdown(doc(body), { maxChars: 201, overlapLines: 0 })).toHaveLength(2);
  });

  it("joins the blocks of one chunk with the original blank line", () => {
    const [chunk] = chunkMarkdown(doc(`${A}\n\n${B}`), { maxChars: 500, overlapLines: 0 });
    expect(chunk?.text).toBe(`${A}\n\n${B}`);
    expect(chunk?.endLine).toBe(3);
  });

  it("repeats the last N non-blank lines, counting through blank lines", () => {
    const body = "x1\n\nx2\n\ny1";
    const one = chunkMarkdown(doc(body), { maxChars: 4, overlapLines: 1 });
    expect(one.map((c) => c.text)).toEqual(["x1", "x1\n\nx2", "x2\n\ny1"]);
    expect(one.map((c) => c.startLine)).toEqual([1, 1, 3]);
  });
});

describe("chunkMarkdown: what is (not) a heading or a fence", () => {
  const paths = (body: string) => chunkMarkdown(doc(body)).map((c) => c.headingPath);

  it("requires a space after the hashes and at most six of them", () => {
    expect(paths("# Doc\n\n#hashtag\n\n####### siete")).toEqual([["Doc"]]);
  });

  it("only treats a line that STARTS with # as a heading", () => {
    expect(paths("# Doc\n\nver ## Instalar para más")).toEqual([["Doc"]]);
  });

  it("understands ~~~ fences and ignores a ~~~ line inside a ``` fence", () => {
    expect(paths("# Doc\n\n~~~\n# no\n~~~\n\ntexto")).toEqual([["Doc"]]);
    expect(paths("# Doc\n\n```\n~~~\n# no\n```\n\ntexto")).toEqual([["Doc"]]);
  });

  it("accepts a fence indented up to 3 spaces but not 4", () => {
    expect(paths("# Doc\n\n   ```\n# no\n   ```")).toEqual([["Doc"]]);
    expect(paths("# Doc\n\n    ```\n\n# Sí es heading\n\ntexto")).toEqual([["Doc"], ["Sí es heading"]]);
  });
});
