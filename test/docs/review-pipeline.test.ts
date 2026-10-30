import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rows = readFileSync("docs/REVIEW-PIPELINE.md", "utf8")
  .split("\n")
  .filter((l) => /^\| \d+ \|/.test(l))
  .map((l) => l.split("|").map((c) => c.trim()))
  .map((cells) => ({ n: cells[1] as string, layer: cells[2] as string, where: cells[6] as string }));

// Backticked tokens that look like repo paths (a "/" and an extension).
function paths(where: string): string[] {
  return [...where.matchAll(/`([^`]+)`/g)]
    .map((m) => m[1] as string)
    .filter((t) => /^[\w.-]+(\/[\w.-]+)+\.\w+$/.test(t));
}

describe("docs/REVIEW-PIPELINE.md", () => {
  it("has the expected columns and at least 8 layers", () => {
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const r of rows) expect(r.where, `layer ${r.n} has no location`).not.toBe("");
  });

  it("points every layer (except M9 ones) to files that exist", () => {
    for (const r of rows.filter((r) => !r.where.includes("(M9)"))) {
      for (const p of paths(r.where)) {
        expect(existsSync(p), `layer ${r.n} (${r.layer}) -> ${p} does not exist`).toBe(true);
      }
    }
  });
});
