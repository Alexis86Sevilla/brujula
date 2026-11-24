import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHook } from "./helpers.js";

const stop = (stop_hook_active = false) => ({ hook_event_name: "Stop", stop_hook_active });
const force = { BRUJULA_GATE_FORCE: "1" };

describe("quality-gate hook", () => {
  it("passes when typecheck and tests pass", () => {
    const r = runHook("quality-gate.sh", stop(), { ...force, BRUJULA_TYPECHECK_CMD: "true", BRUJULA_TEST_CMD: "true" });
    expect(r.code).toBe(0);
  });

  it("blocks with exit 2 and the log tail when typecheck fails", () => {
    const r = runHook("quality-gate.sh", stop(), {
      ...force,
      BRUJULA_TYPECHECK_CMD: "echo 'TS2322 boom'; exit 1",
      BRUJULA_TEST_CMD: "true",
    });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Typecheck fails");
    expect(r.stderr).toContain("TS2322 boom");
  });

  it("lets the turn end when BRUJULA_GATE_OFF=1 even if everything fails", () => {
    const r = runHook("quality-gate.sh", stop(), {
      ...force,
      BRUJULA_GATE_OFF: "1",
      BRUJULA_TYPECHECK_CMD: "exit 1",
      BRUJULA_TEST_CMD: "exit 1",
    });
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  });

  it("blocks with exit 2 when tests fail", () => {
    const r = runHook("quality-gate.sh", stop(), {
      ...force,
      BRUJULA_TYPECHECK_CMD: "true",
      BRUJULA_TEST_CMD: "echo 'FAIL chunk.test.ts'; exit 1",
    });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("FAIL chunk.test.ts");
  });

  it("does not block again when already continuing because of the hook", () => {
    const r = runHook("quality-gate.sh", stop(true), {
      ...force,
      BRUJULA_TYPECHECK_CMD: "exit 1",
      BRUJULA_TEST_CMD: "exit 1",
    });
    expect(r.code).toBe(0);
  });
});

describe("quality-gate only checks turns that changed files", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  /** A repo with uncommitted code left over from an earlier turn, plus an isolated TMPDIR. */
  function setup() {
    const repo = mkdtempSync(join(tmpdir(), "brujula-gate-repo-"));
    const tmp = mkdtempSync(join(tmpdir(), "brujula-gate-tmp-"));
    dirs.push(repo, tmp);
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
    mkdirSync(join(repo, "src"));
    writeFileSync(join(repo, "src/a.ts"), "export const a = 1;\n");
    const env = {
      CLAUDE_PROJECT_DIR: repo,
      TMPDIR: tmp,
      BRUJULA_TYPECHECK_CMD: "true",
      BRUJULA_TEST_CMD: "echo 'red from before'; exit 1",
    };
    return { repo, env };
  }
  const prompt = { hook_event_name: "UserPromptSubmit", session_id: "s1", prompt: "hi" };
  const stopIn = (session_id: string) => ({ hook_event_name: "Stop", stop_hook_active: false, session_id });

  it("records the starting point silently when the user sends a prompt", () => {
    const { env } = setup();
    expect(runHook("quality-gate.sh", prompt, env)).toMatchObject({ code: 0, stdout: "", stderr: "" });
  });

  it("lets a turn that changed nothing end, even with red tests from an earlier turn", () => {
    const { env } = setup();
    runHook("quality-gate.sh", prompt, env);
    expect(runHook("quality-gate.sh", stopIn("s1"), env)).toMatchObject({ code: 0, stderr: "" });
  });

  it("blocks a turn that edited a file, in any folder of any stack", () => {
    const { repo, env } = setup();
    runHook("quality-gate.sh", prompt, env);
    mkdirSync(join(repo, "app"));
    writeFileSync(join(repo, "app/Main.java"), "class Main {}\n");
    const r = runHook("quality-gate.sh", stopIn("s1"), env);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("red from before");
  });

  it("checks as before when the session has no starting point (changes under src or test)", () => {
    const { env } = setup();
    runHook("quality-gate.sh", prompt, env);
    expect(runHook("quality-gate.sh", stopIn("other-session"), env).code).toBe(2);
  });
});
