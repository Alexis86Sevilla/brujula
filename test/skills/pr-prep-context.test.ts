import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = resolve("plugin/skills/pr-prep/scripts/context.sh");
let repo: string;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" });
}
function run(): string {
  return execFileSync("bash", [script], { cwd: repo, encoding: "utf8" });
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "brujula-prep-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  writeFileSync(join(repo, "a.txt"), "a\n");
  git("add", ".");
  git("commit", "-qm", "chore: init");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("pr-prep context.sh", () => {
  it("extracts the work item id from the branch name and lists branch commits", () => {
    git("switch", "-qc", "feature/1234-add-chunker");
    writeFileSync(join(repo, "b.txt"), "b\n");
    git("add", ".");
    git("commit", "-qm", "feat(ingest): add chunker");
    const out = run();
    expect(out).toContain("branch: feature/1234-add-chunker");
    expect(out).toContain("base: main");
    expect(out).toContain("work-item: 1234");
    expect(out).toContain("feat(ingest): add chunker");
    expect(out).toContain("b.txt");
  });

  it("reports whether the project uses pull requests, or unset when it has not said", () => {
    expect(run()).toContain("pull-requests: unset");
    mkdirSync(join(repo, ".claude"));
    writeFileSync(join(repo, ".claude/brujula.json"), '{ "pullRequests": false }');
    expect(run()).toContain("pull-requests: false");
    writeFileSync(join(repo, ".claude/brujula.json"), '{ "pullRequests": true }');
    expect(run()).toContain("pull-requests: true");
    writeFileSync(join(repo, ".claude/brujula.json"), "not json");
    expect(run()).toContain("pull-requests: invalid");
  });

  it("reports work-item none and still works on the base branch", () => {
    const out = run();
    expect(out).toContain("work-item: none");
    expect(out).toContain("## last commits");
  });

  it("shows staged files", () => {
    writeFileSync(join(repo, "c.txt"), "c\n");
    git("add", "c.txt");
    expect(run()).toMatch(/## staged diff stat[\s\S]*c\.txt/);
  });
});
