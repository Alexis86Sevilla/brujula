import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import {
  gitBlobHash,
  isExcludedPath,
  listCorpusSources,
  loadCorpusFile,
  looksLikeCredential,
  toChunk,
} from "../../src/rag/chunks.js";
import { put, removeRoot, tempRoot } from "./helpers.js";

let root: string;
beforeEach(async () => {
  root = await tempRoot();
});
afterEach(() => removeRoot(root));

describe("toChunk", () => {
  it("maps docPath and headingPath to source and heading breadcrumb", () => {
    expect(
      toChunk({ docPath: "docs/a.md", headingPath: ["Deploy", "Rollback"], text: "x", startLine: 3, endLine: 4 }),
    ).toEqual({ source: "docs/a.md", heading: "Deploy > Rollback", startLine: 3, endLine: 4, text: "x" });
  });
});

describe("gitBlobHash", () => {
  it("matches git hash-object", async () => {
    const content = "# Título\n\nÁrbol, ñandú y acentos.\n";
    await put(root, "f.md", content);
    const expected = execFileSync("git", ["hash-object", join(root, "f.md")])
      .toString()
      .trim();
    expect(gitBlobHash(content)).toBe(expected);
    expect(gitBlobHash(Buffer.from(content))).toBe(expected);
  });

  it("hashes the empty file like git", () => {
    expect(gitBlobHash("")).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
  });
});

describe("exclusions", () => {
  it("excludes secret files and customer folders", () => {
    for (const p of ["docs/.env.md", "a/key.pem", "x/id.key", "docs/clientes/acme.md", "docs/Secrets/a.md"]) {
      expect(isExcludedPath(p)).toBe(true);
    }
    expect(isExcludedPath("docs/adr/0001.md")).toBe(false);
  });

  it("detects credential-looking text", () => {
    expect(looksLikeCredential("password = hunter2hunter2")).toBe(true);
    expect(looksLikeCredential("AKIAABCDEFGHIJKLMNOP")).toBe(true);
    expect(looksLikeCredential("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
    expect(looksLikeCredential("Rotate the password every 90 days.")).toBe(false);
  });

  it("drops credential chunks and excluded folders from the corpus", async () => {
    await put(root, "docs/ok.md", "# Ok\n\nHello.\n");
    await put(root, "docs/clientes/acme.md", "# Acme\n\nData.\n");
    await put(root, "docs/leak.md", "# Leak\n\napi_key: sk_live_abcdef123456\n");
    expect(await listCorpusSources(root)).toEqual(["docs/leak.md", "docs/ok.md"]);
    const leak = await loadCorpusFile(root, "docs/leak.md");
    expect(leak.chunks).toEqual([]);
    expect(leak.rejected).toBe(1);
  });

  it("uses the relative source and file lines for citations", async () => {
    await put(root, "docs/a.md", "---\ntitle: T\n---\n# A\n\nBody text.\n");
    const file = await loadCorpusFile(root, "docs/a.md");
    expect(file.chunks[0]).toMatchObject({ source: "docs/a.md", heading: "A", startLine: 4 });
  });
});
