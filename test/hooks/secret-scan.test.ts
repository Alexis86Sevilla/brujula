import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bash, runHook } from "./helpers.js";

// Built by concatenation so this test file itself never trips the scanner.
const awsKey = "AKIA" + "IOSFODNN7EXAMPLE";

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** Temporary git repo with one committed file, `app.txt`. */
function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "secret-scan-"));
  dirs.push(dir);
  execSync("git init -q && git config user.email t@t && git config user.name t && git config commit.gpgsign false", {
    cwd: dir,
  });
  writeFileSync(join(dir, "app.txt"), "one\ntwo\n");
  execSync("git add app.txt && git commit -q -m 'chore: init'", { cwd: dir });
  return dir;
}

function scan(dir: string, command: string, env: Record<string, string> = {}) {
  const r = runHook("secret-scan.sh", bash(command), { CLAUDE_PROJECT_DIR: dir, ...env });
  expect(r.code).toBe(0); // JSON style: always exit 0
  const out = r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : undefined;
  return {
    decision: out?.permissionDecision as string | undefined,
    reason: (out?.permissionDecisionReason ?? "") as string,
  };
}

describe("secret-scan hook", () => {
  it("denies a commit whose staged diff adds an AWS key", () => {
    const dir = repo();
    writeFileSync(join(dir, "config.ts"), `const region = "eu-west-1";\nconst key = "${awsKey}";\n`);
    execSync("git add config.ts", { cwd: dir });
    expect(scan(dir, "git commit -m 'feat: config'").decision).toBe("deny");
  });

  it("cites file:line in the reason and never the secret value", () => {
    const dir = repo();
    writeFileSync(join(dir, "app.txt"), `one\ntwo\nthree\nkey=${awsKey}\n`);
    execSync("git add app.txt", { cwd: dir });
    const { reason } = scan(dir, "git commit -m 'feat: key'");
    expect(reason).toContain("app.txt:4");
    expect(reason).not.toContain(awsKey);
    expect(reason).not.toContain("IOSFODNN7EXAMPLE");
  });

  it("lets a clean commit through", () => {
    const dir = repo();
    writeFileSync(join(dir, "app.txt"), "one\ntwo\nthree\n");
    execSync("git add app.txt", { cwd: dir });
    expect(scan(dir, "git commit -m 'feat: three'").decision).toBeUndefined();
  });

  it("ignores Bash commands that are not a commit", () => {
    const dir = repo();
    writeFileSync(join(dir, "app.txt"), `key=${awsKey}\n`);
    execSync("git add app.txt", { cwd: dir });
    expect(scan(dir, "git status --short").decision).toBeUndefined();
  });

  it("scans unstaged tracked changes for git commit -am", () => {
    const dir = repo();
    writeFileSync(join(dir, "app.txt"), `one\nkey=${awsKey}\n`);
    const { decision, reason } = scan(dir, "git commit -am 'feat: key'");
    expect(decision).toBe("deny");
    expect(reason).toContain("app.txt:2");
  });

  it("denies git add and git commit chained in one command", () => {
    const dir = repo();
    const { decision, reason } = scan(dir, "git add . && git commit -m 'feat: all'");
    expect(decision).toBe("deny");
    expect(reason).toContain("separate");
  });

  it("is bypassed when the human launched claude with BRUJULA_ALLOW_SECRETS=1", () => {
    const dir = repo();
    writeFileSync(join(dir, "app.txt"), `key=${awsKey}\n`);
    execSync("git add app.txt", { cwd: dir });
    expect(scan(dir, "git commit -m 'feat: key'", { BRUJULA_ALLOW_SECRETS: "1" }).decision).toBeUndefined();
  });
});
