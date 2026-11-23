import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const fake = join(process.cwd(), "test/scripts/fake-claude.sh");
const fixtures = join(process.cwd(), "test/fixtures/cards");

function setup(cards: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "fix-"));
  const cardsDir = join(dir, "cards");
  spawnSync("mkdir", ["-p", cardsDir]);
  for (const [name, fixture] of Object.entries(cards)) copyFileSync(join(fixtures, fixture), join(cardsDir, name));
  const report = join(dir, "lint.json");
  spawnSync("scripts/card-lint.sh", [cardsDir, report], { env: { ...process.env, CLAUDE_BIN: fake } });
  return { dir, report, out: join(dir, "suggestions"), counter: join(dir, "calls.log") };
}

function run(ctx: ReturnType<typeof setup>, proposalFixture: string) {
  const r = spawnSync("scripts/card-fix-suggestions.sh", [ctx.report, ctx.out], {
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_BIN: fake,
      FAKE_CLAUDE_COUNTER: ctx.counter,
      FAKE_CLAUDE_CARD: join(fixtures, proposalFixture),
    },
  });
  return { status: r.status, stderr: r.stderr };
}

const calls = (counter: string) =>
  existsSync(counter) ? readFileSync(counter, "utf8").split("\n").filter(Boolean).length : 0;

describe("card-fix-suggestions.sh", () => {
  it("does nothing and calls no model when every card passes", () => {
    const ctx = setup({ "a.md": "good.md" });
    const r = run(ctx, "good.md");
    expect(r.status).toBe(0);
    expect(calls(ctx.counter)).toBe(0);
    expect(existsSync(ctx.out) && existsSync(join(ctx.out, "a.md"))).toBe(false);
  });

  it("writes a verified suggestion for a failing card and leaves the original untouched", () => {
    const ctx = setup({ "b.md": "bad.md" });
    const original = readFileSync(join(ctx.dir, "cards/b.md"), "utf8");
    const r = run(ctx, "good.md");
    expect(r.status).toBe(0);
    expect(readFileSync(join(ctx.out, "b.md"), "utf8")).toContain(
      readFileSync(join(fixtures, "good.md"), "utf8").split("\n")[0],
    );
    expect(readFileSync(join(ctx.dir, "cards/b.md"), "utf8")).toBe(original);
    // one call for the refiner, one for the lint judgement of the (structurally valid) proposal
    expect(calls(ctx.counter)).toBe(2);
  });

  it("is idempotent: a second run on the same report makes no model calls", () => {
    const ctx = setup({ "b.md": "bad.md" });
    run(ctx, "good.md");
    writeFileSync(ctx.counter, "");
    const r = run(ctx, "good.md");
    expect(r.status).toBe(0);
    expect(calls(ctx.counter)).toBe(0);
  });

  it("rejects a proposal that still fails the linter and exits 1", () => {
    const ctx = setup({ "b.md": "bad.md" });
    const r = run(ctx, "bad.md");
    expect(r.status).toBe(1);
    expect(existsSync(join(ctx.out, "b.rejected.md"))).toBe(true);
    expect(existsSync(join(ctx.out, "b.md"))).toBe(false);
    // the broken proposal is caught by code: only the refiner call happened
    expect(calls(ctx.counter)).toBe(1);
  });
});
