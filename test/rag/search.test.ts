import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { closeDb, getFileHashes, openDb, type RagDb } from "../../src/rag/db.js";
import { defaultDbPath, indexCorpus } from "../../src/rag/index-docs.js";
import { gitBlobHash } from "../../src/rag/chunks.js";
import { MIN_SCORE, sanitizeQuery, searchDocs } from "../../src/rag/search.js";
import { put, removeRoot, tempRoot } from "./helpers.js";

let root: string;
beforeEach(async () => {
  root = await tempRoot();
});
afterEach(() => removeRoot(root));

const open = (): RagDb => openDb(defaultDbPath(root), { readOnly: true });

describe("incremental index", () => {
  it("indexes, skips unchanged, updates changed and removes deleted files", async () => {
    await put(root, "docs/a.md", "# A\n\nAlpha rollback procedure.\n");
    await put(root, "docs/b.md", "# B\n\nBeta deploy procedure.\n");
    expect(await indexCorpus({ root })).toMatchObject({ added: 2, updated: 0, removed: 0, unchanged: 0 });
    expect(await indexCorpus({ root })).toMatchObject({ added: 0, updated: 0, removed: 0, unchanged: 2 });

    await put(root, "docs/a.md", "# A\n\nAlpha rollback procedure changed with gamma.\n");
    const { rm } = await import("node:fs/promises");
    await rm(join(root, "docs/b.md"));
    expect(await indexCorpus({ root })).toMatchObject({ added: 0, updated: 1, removed: 1, unchanged: 0 });

    const db = open();
    expect(getFileHashes(db).get("docs/a.md")).toBe(
      gitBlobHash("# A\n\nAlpha rollback procedure changed with gamma.\n"),
    );
    expect(getFileHashes(db).has("docs/b.md")).toBe(false);
    expect(searchDocs(db, "gamma", { minScore: 0 }).map((h) => h.source)).toEqual(["docs/a.md"]);
    expect(searchDocs(db, "beta deploy", { minScore: 0 })).toEqual([]);
    closeDb(db);
  });
});

describe("sanitizeQuery", () => {
  it("returns null when only stopwords or punctuation remain", () => {
    expect(sanitizeQuery("¿Qué es el?")).toBeNull();
    expect(sanitizeQuery('"" ( ) * : ^')).toBeNull();
  });

  it("quotes terms so FTS5 operators are inert", () => {
    expect(sanitizeQuery("rollback AND NOT near(x)")).toBe('"rollback"* OR "not" OR "near"*');
  });
});

describe("searchDocs", () => {
  beforeEach(async () => {
    await put(root, "docs/adr/0001.md", "# Store\n\nWe chose sqlite for the index. Árbol de decisión.\n");
    await put(root, "docs/plans/p.md", "# Plan\n\nThe rollout plan uses sqlite too, with a pipeline.\n");
    await indexCorpus({ root });
  });

  it("never throws on punctuation, quotes or operators", () => {
    const db = open();
    for (const q of ['sqlite"', "sqlite)", "NEAR(", "a OR", "'; DROP TABLE chunks; --", "col:sqlite", "sqlite*^-"]) {
      expect(() => searchDocs(db, q, { minScore: 0 })).not.toThrow();
    }
    closeDb(db);
  });

  it("scores higher-is-better and ignores diacritics", () => {
    const db = open();
    const hits = searchDocs(db, "arbol decision", { minScore: 0 });
    expect(hits[0]?.source).toBe("docs/adr/0001.md");
    expect(hits[0]?.score).toBeGreaterThan(0);
    const two = searchDocs(db, "sqlite", { minScore: 0 });
    expect(two.length).toBe(2);
    expect(two[0]!.score).toBeGreaterThanOrEqual(two[1]!.score);
    closeDb(db);
  });

  it("filters by path prefix", () => {
    const db = open();
    expect(searchDocs(db, "sqlite", { pathPrefix: "docs/plans/", minScore: 0 }).map((h) => h.source)).toEqual([
      "docs/plans/p.md",
    ]);
    expect(searchDocs(db, "sqlite", { pathPrefix: "docs/nope/", minScore: 0 })).toEqual([]);
    closeDb(db);
  });

  it("abstains when nothing matches or the best score is below the threshold", () => {
    const db = open();
    expect(searchDocs(db, "kubernetes helm")).toEqual([]);
    expect(searchDocs(db, "pipeline", { minScore: 1000 })).toEqual([]);
    expect(MIN_SCORE).toBeGreaterThan(0);
    closeDb(db);
  });
});
