import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findMarkdownFiles } from "../../src/ingest/walk.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "brujula-walk-"));
  for (const f of [
    "Home.md",
    "Guias/Despliegue.md",
    "Guias/notas.txt",
    "Guias/Sub/Ci.MD",
    ".attachments/diagrama.md",
    ".git/HEAD.md",
    "node_modules/x/README.md",
    ".order",
  ]) {
    const p = join(root, f);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, "x");
  }
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("findMarkdownFiles", () => {
  it("returns sorted, root-relative POSIX paths of .md files (case-insensitive extension)", async () => {
    expect(await findMarkdownFiles(root)).toEqual(["Guias/Despliegue.md", "Guias/Sub/Ci.MD", "Home.md"]);
  });

  it("skips .git, .attachments and node_modules by default", async () => {
    const files = await findMarkdownFiles(root);
    expect(files.some((f) => /^(\.git|\.attachments|node_modules)\//.test(f))).toBe(false);
  });

  it("accepts a custom list of directory names to ignore", async () => {
    expect(await findMarkdownFiles(root, { ignoreDirs: ["Sub", ".git", ".attachments", "node_modules"] })).toEqual([
      "Guias/Despliegue.md",
      "Home.md",
    ]);
  });

  it("returns an empty list for a directory without markdown", async () => {
    const empty = mkdtempSync(join(tmpdir(), "brujula-empty-"));
    expect(await findMarkdownFiles(empty)).toEqual([]);
    rmSync(empty, { recursive: true });
  });

  it("rejects when the root does not exist", async () => {
    await expect(findMarkdownFiles(join(root, "nope"))).rejects.toThrow();
  });
});
