import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scriptsDir } from "../hooks/helpers.js";

const script = resolve("plugin/skills/configurar/scripts/repo-info.sh");
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const run = (cwd: string) =>
  execFileSync("bash", [script], { cwd, encoding: "utf8", env: { ...process.env, BRUJULA_SCRIPTS_DIR: scriptsDir } });

describe("configurar/empezar repo-info.sh", () => {
  it("names the main checkout from a worktree and prints the merged settings", () => {
    const repo = mkdtempSync(join(tmpdir(), "brujula-info-"));
    dirs.push(repo);
    execFileSync("git", ["init", "-q", "-b", "main", repo]);
    execFileSync("git", [
      "-C",
      repo,
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@t",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "c",
    ]);
    mkdirSync(join(repo, ".claude"));
    writeFileSync(join(repo, ".claude/brujula.local.json"), '{ "testCmd": "./mvnw -q test" }');
    writeFileSync(join(repo, "pom.xml"), "<project/>");
    const wt = join(mkdtempSync(join(tmpdir(), "brujula-info-wt-")), "wt");
    dirs.push(wt);
    execFileSync("git", ["-C", repo, "worktree", "add", "-q", "-b", "feature/7-x", wt]);

    const out = run(wt);
    expect(out).toContain(`main-checkout: ${repo}`);
    expect(out).toContain("branch: feature/7-x");
    expect(out).toContain("origin: none");
    expect(out).toContain('"testCmd": "./mvnw -q test"');
    expect(run(repo)).toContain("pom.xml");
  });
});
