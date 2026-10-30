import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { citationLabel, readLines } from "../../src/ingest/read-lines.js";

let parent: string;
let root: string;

beforeEach(() => {
  parent = mkdtempSync(join(tmpdir(), "brujula-"));
  root = join(parent, "wiki");
  mkdirSync(root);
  mkdirSync(join(parent, "wiki-evil"));
  writeFileSync(join(root, "guia.md"), "uno\ndos\ntres\ncuatro\n");
  writeFileSync(join(parent, "wiki-evil", "secreto.md"), "secreto\n");
});

describe("readLines", () => {
  it("returns exactly the requested lines, both ends included", () => {
    expect(readLines(root, "guia.md", 2, 3)).toBe("dos\ntres");
    expect(readLines(root, "guia.md", 1, 1)).toBe("uno");
  });

  it("rejects a path that escapes the root, including a sibling that shares the prefix", () => {
    expect(() => readLines(root, "../wiki-evil/secreto.md", 1, 1)).toThrow(/escapes root/);
    expect(() => readLines(root, join(parent, "wiki-evil", "secreto.md"), 1, 1)).toThrow(/escapes root/);
  });

  it("treats shell metacharacters in the path as plain characters", () => {
    const marker = join(parent, "pwned");
    expect(() => readLines(root, `guia.md" ; touch "${marker}`, 1, 1)).toThrow();
    expect(existsSync(marker)).toBe(false); // the injected command never ran
  });

  it.each([
    [0, 1],
    [3, 2],
  ])("rejects the invalid range %s-%s", (a, b) => {
    expect(() => readLines(root, "guia.md", a, b)).toThrow(RangeError);
  });
});

describe("citationLabel", () => {
  it("uses the real end line", () => {
    expect(citationLabel({ docPath: "wiki/guia.md", startLine: 5, endLine: 7 })).toBe("wiki/guia.md#L5-L7");
  });
});
