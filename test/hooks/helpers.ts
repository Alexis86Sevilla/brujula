import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export const projectDir = resolve(import.meta.dirname, "../..");

export interface HookResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Run a hook script exactly like Claude Code does: JSON on stdin, env vars set. */
export function runHook(
  script: string,
  input: unknown,
  env: Record<string, string> = {},
): HookResult {
  const r = spawnSync(resolve(projectDir, ".claude/hooks", script), {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, ...env },
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