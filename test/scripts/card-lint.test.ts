import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const fake = join(process.cwd(), "test/scripts/fake-claude.sh");

const run = (dir: string, claudeBin = fake) => {
  const report = join(mkdtempSync(join(tmpdir(), "lint-")), "report.json");
  const r = spawnSync("scripts/card-lint.sh", [dir, report], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_BIN: claudeBin },
  });
  return { status: r.status, report: JSON.parse(readFileSync(report, "utf8")) };
};

const only = (name: string) => {
  const d = mkdtempSync(join(tmpdir(), "cards-"));
  copyFileSync(join("test/fixtures/cards", name), join(d, name));
  return d;
};

describe("card-lint.sh", () => {
  it("passes a complete card", () => {
    const { status, report } = run(only("good.md"));
    expect(status).toBe(0);
    expect(report.failed).toBe(0);
  });

  it("fails a structurally broken card even if the model would approve", () => {
    const { status, report } = run(only("bad.md"));
    expect(status).toBe(1);
    expect(report.cards[0].structural_errors).toContain("missing section: ## Fuera de alcance");
  });

  it("does not call the model for a structurally broken card", () => {
    // /bin/false exits 1: if the script called it, it would exit with a tooling error (2+), not 1.
    const { status, report } = run(only("bad.md"), "/bin/false");
    expect(status).toBe(1);
    expect(report.cards[0].model).toBeNull();
  });
});
