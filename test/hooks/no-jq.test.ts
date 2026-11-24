import { execFileSync, execSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bash, edit, runHook, scriptsDir } from "./helpers.js";

// Built by concatenation so this test file itself never trips the scanner.
const awsKey = "AKIA" + "IOSFODNN7EXAMPLE";

/** Tools the hook scripts may call. jq is deliberately absent (native Windows has none). */
const TOOLS = [
  "node",
  "git",
  "bash",
  "sed",
  "grep",
  "tr",
  "cat",
  "dirname",
  "basename",
  "sha1sum",
  "xargs",
  "mktemp",
  "head",
  "tail",
  "wc",
  "sort",
];

const dirs: string[] = [];
let bin = "";

beforeAll(() => {
  bin = mkdtempSync(join(tmpdir(), "no-jq-bin-"));
  dirs.push(bin);
  for (const tool of TOOLS) {
    const path = execFileSync("bash", ["-c", `command -v ${tool}`], { encoding: "utf8" }).trim();
    symlinkSync(path, join(bin, tool));
  }
});
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const noJq = (env: Record<string, string> = {}) => ({ PATH: bin, ...env });
const decision = (stdout: string) => JSON.parse(stdout).hookSpecificOutput.permissionDecision as string;

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "no-jq-repo-"));
  dirs.push(dir);
  execSync("git init -q -b main && git config user.email t@t && git config user.name t", { cwd: dir });
  execSync("git config commit.gpgsign false && git commit -q --allow-empty -m init", { cwd: dir });
  return dir;
}

describe("hooks without jq on the PATH", () => {
  it("has no jq on the test PATH", () => {
    expect(spawnSync("bash", ["-c", "command -v jq"], { env: { PATH: bin } }).status).not.toBe(0);
  });

  it("guard-bash denies a recursive rm", () => {
    const r = runHook("guard-bash.sh", bash("rm -rf x"), noJq());
    expect(r.code).toBe(0);
    expect(decision(r.stdout)).toBe("deny");
  });

  it("guard-bash reads the project settings to deny a push to main", () => {
    const dir = repo();
    mkdirSync(join(dir, ".claude"));
    writeFileSync(join(dir, ".claude/brujula.json"), '{ "pullRequests": true }');
    const r = runHook("guard-bash.sh", bash("git push origin main"), noJq({ CLAUDE_PROJECT_DIR: dir }));
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason).toContain("uses pull requests");
  });

  it("protect-paths blocks an edit to .env", () => {
    const r = runHook("protect-paths.sh", edit("/repo/.env"), noJq());
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("environment file with secrets");
  });

  it("confirm-ado-write asks before a write tool", () => {
    const r = runHook(
      "confirm-ado-write.sh",
      { hook_event_name: "PreToolUse", tool_name: "mcp__plugin_brujula_ado__wit_work_item_write", tool_input: {} },
      noJq(),
    );
    expect(decision(r.stdout)).toBe("ask");
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason).toContain("wit_work_item_write");
  });

  it("secret-scan denies a commit that stages a secret", () => {
    const dir = repo();
    writeFileSync(join(dir, "config.ts"), `const key = "${awsKey}";\n`);
    execSync("git add config.ts", { cwd: dir });
    const r = runHook("secret-scan.sh", bash("git commit -m 'feat: config'"), noJq({ CLAUDE_PROJECT_DIR: dir }));
    expect(decision(r.stdout)).toBe("deny");
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason).toContain("config.ts:1");
  });

  it("user-prompt blocks a prompt with a secret", () => {
    const r = runHook("user-prompt.sh", { hook_event_name: "UserPromptSubmit", prompt: `key ${awsKey}` }, noJq());
    expect(JSON.parse(r.stdout)).toMatchObject({ decision: "block" });
  });

  it("user-prompt hints the work items of a prompt", () => {
    const r = runHook("user-prompt.sh", { hook_event_name: "UserPromptSubmit", prompt: "mira #12" }, noJq());
    expect(JSON.parse(r.stdout).hookSpecificOutput.additionalContext).toContain("#12");
  });

  it("notify reads the title and message", () => {
    const r = runHook(
      "notify.sh",
      { hook_event_name: "Notification", title: "T", message: "M" },
      noJq({ BRUJULA_NOTIFY_DRY_RUN: "1" }),
    );
    expect(r.stdout).toMatch(/^T · .*\|M\n$/);
  });

  it("project-config.sh prints the merged settings", () => {
    const dir = repo();
    mkdirSync(join(dir, ".claude"));
    writeFileSync(join(dir, ".claude/brujula.json"), '{ "pullRequests": true, "testCmd": "x" }');
    writeFileSync(join(dir, ".claude/brujula.local.json"), '{ "pullRequests": false }');
    const r = spawnSync(join(bin, "bash"), [join(scriptsDir, "lib/project-config.sh"), dir], {
      encoding: "utf8",
      env: { PATH: bin },
    });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ pullRequests: false });
  });
});
