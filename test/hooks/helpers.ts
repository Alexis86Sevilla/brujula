import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export const projectDir = resolve(import.meta.dirname, "../..");

/**
 * The hook scripts under test. BRUJULA_TEST_SCRIPTS points the tests at a draft copy of
 * plugin/scripts (that directory is protected from the agent's edits, so changes are drafted
 * elsewhere and installed by the user).
 */
export const scriptsDir = resolve(projectDir, process.env.BRUJULA_TEST_SCRIPTS ?? "plugin/scripts");

export interface HookResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Run a hook script exactly like Claude Code does: JSON on stdin, env vars set. */
export function runHook(script: string, input: unknown, env: Record<string, string> = {}): HookResult {
  // Drop human overrides (BRUJULA_UNLOCK, BRUJULA_ALLOW_SECRETS) inherited from the session
  // that runs the tests; a test opts into them explicitly through `env`.
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("BRUJULA_")));
  const r = spawnSync(resolve(scriptsDir, script), {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...inherited, CLAUDE_PROJECT_DIR: projectDir, ...env },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

export const edit = (file_path: string) => ({
  hook_event_name: "PreToolUse",
  tool_name: "Edit",
  tool_input: { file_path },
});

export const bash = (command: string) => ({
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command },
});
