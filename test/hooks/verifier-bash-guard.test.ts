import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve(".claude/hooks/verifier-bash-guard.sh");

function run(command: string) {
  const r = spawnSync("bash", [script], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
    encoding: "utf8",
  });
  return { code: r.status, stderr: r.stderr };
}

describe("verifier-bash-guard hook", () => {
  it.each(["npm test", "npx vitest run test/ingest", "git diff main...HEAD", "git log --oneline -5"])(
    "allows %s",
    (cmd) => {
      expect(run(cmd).code).toBe(0);
    },
  );

  it.each([
    "rm -rf build",
    "git push origin main",
    "git checkout -- src",
    "cat .env",
    "npm test && rm -rf build",
    "git diff > patch.txt",
    "npm test $(whoami)",
  ])("blocks %s with exit 2 and a reason on stderr", (cmd) => {
    const r = run(cmd);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^Blocked:/);
  });

  it("lets an empty command through (nothing to validate)", () => {
    expect(run("").code).toBe(0);
  });
});
