import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { bash, runHook, scriptsDir } from "./helpers.js";

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

function repo(files: { shared?: string; local?: string } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "brujula-config-"));
  dirs.push(dir);
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  execFileSync("git", [
    "-C",
    dir,
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
  mkdirSync(join(dir, ".claude"));
  if (files.shared !== undefined) writeFileSync(join(dir, ".claude/brujula.json"), files.shared);
  if (files.local !== undefined) writeFileSync(join(dir, ".claude/brujula.local.json"), files.local);
  return dir;
}

/** The CLI form the skills use: prints the merged settings as JSON. */
function settings(dir: string) {
  const r = spawnSync("bash", [join(scriptsDir, "lib/project-config.sh"), dir], { encoding: "utf8" });
  return { status: r.status, json: r.status === 0 ? JSON.parse(r.stdout) : undefined, stderr: r.stderr };
}

describe("project settings (lib/project-config.sh)", () => {
  it("prints an empty object when the project declares nothing", () => {
    expect(settings(repo())).toMatchObject({ status: 0, json: {} });
  });

  it("merges the personal brujula.local.json over the shared brujula.json, key by key", () => {
    const dir = repo({
      shared: '{ "pullRequests": true, "adoProject": "Equipo", "baseBranch": "develop" }',
      local: '{ "pullRequests": false, "testCmd": "./mvnw -q test" }',
    });
    expect(settings(dir).json).toEqual({
      pullRequests: false,
      adoProject: "Equipo",
      baseBranch: "develop",
      testCmd: "./mvnw -q test",
    });
  });

  it("reads the personal file of the main checkout from inside a git worktree", () => {
    const dir = repo({ local: '{ "testCmd": "./gradlew test" }' });
    const wt = join(mkdtempSync(join(tmpdir(), "brujula-wt-")), "wt");
    dirs.push(wt);
    execFileSync("git", ["-C", dir, "worktree", "add", "-q", "-b", "feature/1-x", wt]);
    expect(settings(wt).json).toEqual({ testCmd: "./gradlew test" });
  });

  it("fails and names the file when a value has the wrong type or the file is not JSON", () => {
    for (const bad of [
      '{ "pullRequests": "no" }',
      '{ "pullRequests": null }',
      '{ "testCmd": 3 }',
      "not json",
      "[]",
      '{} { "pullRequests": false }',
    ]) {
      const r = settings(repo({ local: bad }));
      expect(r.status, bad).toBe(1);
      expect(r.stderr).toContain(".claude/brujula.local.json");
    }
  });

  it("takes testCmd and lintCmd only from the personal file: a cloned repo cannot make the gate run its commands", () => {
    const dir = repo({ shared: '{ "testCmd": "touch /tmp/pwned", "lintCmd": "x", "adoProject": "Equipo" }' });
    expect(settings(dir).json).toEqual({ adoProject: "Equipo" });
  });

  it("does not take the folder above a bare repository for the main checkout", () => {
    const origin = repo();
    const top = mkdtempSync(join(tmpdir(), "brujula-bare-"));
    dirs.push(top);
    execFileSync("git", ["clone", "-q", "--bare", origin, join(top, "proj.git")]);
    execFileSync("git", ["-C", join(top, "proj.git"), "worktree", "add", "-q", join(top, "wt"), "main"]);
    mkdirSync(join(top, ".claude"));
    writeFileSync(join(top, ".claude/brujula.local.json"), '{ "pullRequests": false }');
    expect(settings(join(top, "wt")).json).toEqual({});
  });

  it("lets guard-bash allow the push to main when only the personal file says there are no pull requests", () => {
    const dir = repo({ local: '{ "pullRequests": false }' });
    const r = runHook("guard-bash.sh", bash("git push origin main"), { CLAUDE_PROJECT_DIR: dir });
    expect(r.stdout.trim()).toBe("");
  });

  it("tells the model it can keep the answer personal when the setting is missing", () => {
    const r = runHook("guard-bash.sh", bash("git push origin main"), { CLAUDE_PROJECT_DIR: repo() });
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason).toContain(".claude/brujula.local.json");
  });
});

describe("quality-gate with the project's test command", () => {
  function gate(dir: string) {
    return spawnSync(join(scriptsDir, "run-hook.sh"), ["quality-gate.sh"], {
      input: JSON.stringify({ hook_event_name: "Stop" }),
      encoding: "utf8",
      env: {
        ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("BRUJULA_"))),
        CLAUDE_PROJECT_DIR: dir,
        BRUJULA_GATE_FORCE: "1",
      },
    });
  }

  it("runs testCmd in a project of any stack and blocks the turn when it fails", () => {
    const r = gate(repo({ local: `{ "testCmd": "echo 'BUILD FAILURE' && exit 1" }` }));
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("BUILD FAILURE");
  });

  it("lets the turn end when testCmd passes", () => {
    expect(gate(repo({ local: '{ "testCmd": "true" }' }))).toMatchObject({ status: 0, stderr: "" });
  });
});
