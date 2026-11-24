import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runHook } from "./helpers.js";

function fakeProject(sprint?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "proj-"));
  execSync(
    "git init -q -b feat/demo && git config user.email t@t && git config user.name t && git commit -q --allow-empty -m 'chore: init'",
    { cwd: dir },
  );
  if (sprint) {
    mkdirSync(join(dir, ".claude/context"), { recursive: true });
    writeFileSync(join(dir, ".claude/context/sprint.md"), sprint);
  }
  return dir;
}

describe("session-context hook", () => {
  it("prints branch, last commits and the sprint file", () => {
    const dir = fakeProject("Sprint 42: goal = ship RAG ingest\n");
    const r = runHook("session-context.sh", { hook_event_name: "SessionStart" }, { CLAUDE_PROJECT_DIR: dir });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Branch: feat/demo");
    expect(r.stdout).toContain("chore: init");
    expect(r.stdout).toContain("Sprint 42: goal = ship RAG ingest");
  });

  describe("first-session welcome", () => {
    const start = (source: string) => ({ hook_event_name: "SessionStart", source });
    const welcome = "brujula:bienvenida";

    it("asks the model to welcome the person on their first session only, even outside a repository", () => {
      const data = mkdtempSync(join(tmpdir(), "plugin-data-"));
      const env = { CLAUDE_PROJECT_DIR: mkdtempSync(join(tmpdir(), "no-repo-")), CLAUDE_PLUGIN_DATA: data };
      const first = runHook("session-context.sh", start("startup"), env);
      expect(first.code).toBe(0);
      expect(first.stdout).toContain(welcome);
      expect(runHook("session-context.sh", start("startup"), env).stdout).not.toContain(welcome);
    });

    it("waits for a new session: a resume, a clear or a compaction does not use up the welcome", () => {
      const env = {
        CLAUDE_PROJECT_DIR: fakeProject(),
        CLAUDE_PLUGIN_DATA: mkdtempSync(join(tmpdir(), "plugin-data-")),
      };
      for (const source of ["resume", "clear", "compact"]) {
        expect(runHook("session-context.sh", start(source), env).stdout, source).not.toContain(welcome);
      }
      expect(runHook("session-context.sh", start("startup"), env).stdout).toContain(welcome);
    });

    it("stays silent when there is no plugin data folder to remember it", () => {
      const r = runHook("session-context.sh", start("startup"), {
        CLAUDE_PROJECT_DIR: fakeProject(),
        CLAUDE_PLUGIN_DATA: "",
      });
      expect(r.stdout).not.toContain(welcome);
    });
  });

  it("works without a sprint file", () => {
    const dir = fakeProject();
    const r = runHook("session-context.sh", { hook_event_name: "SessionStart" }, { CLAUDE_PROJECT_DIR: dir });
    expect(r.code).toBe(0);
    expect(r.stdout).not.toContain("Current sprint");
  });
});

const prompt = (text: string) => ({ hook_event_name: "UserPromptSubmit", prompt: text });

describe("user-prompt hook", () => {
  it.each([
    "mira esto AKIAIOSFODNN7EXAMPLE",
    "token ghp_" + "a".repeat(36),
    "-----BEGIN RSA PRIVATE KEY-----",
    "pat " + "abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrst",
  ])("blocks a prompt with a secret: %s", (text) => {
    const r = runHook("user-prompt.sh", prompt(text));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).decision).toBe("block");
  });

  it("adds work item context for #id and AB#id references", () => {
    const r = runHook("user-prompt.sh", prompt("planifica #1234 y AB#1250, y otra vez #1234"));
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext as string;
    expect(ctx).toContain("#1234 #1250");
    expect(ctx.match(/#1234/g)).toHaveLength(1);
  });

  it("stays silent for a normal prompt", () => {
    const r = runHook("user-prompt.sh", prompt("refactoriza el chunker"));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });
});

describe("notify hook", () => {
  const env = { BRUJULA_NOTIFY_DRY_RUN: "1", CLAUDE_PROJECT_DIR: "/home/u/repos/brujula" };

  it("uses the notification message", () => {
    const r = runHook("notify.sh", { hook_event_name: "Notification", message: "Claude needs your permission" }, env);
    expect(r.stdout.trim()).toBe("Claude Code · brujula|Claude needs your permission");
  });

  it("says the turn finished on Stop", () => {
    const r = runHook("notify.sh", { hook_event_name: "Stop" }, env);
    expect(r.stdout.trim()).toBe("Claude Code · brujula|Turn finished");
  });
});
