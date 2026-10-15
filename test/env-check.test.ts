import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../scripts/env-check.sh", import.meta.url));

// Every external command env-check.sh relies on, except the one under test.
const TOOLS = ["bash", "env", "node", "jq", "claude", "timeout", "head", "git", "grep", "dirname"];

function resolve(tool: string): string | undefined {
  const result = spawnSync("bash", ["-c", `command -v ${tool}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

let binDir: string | undefined;

afterEach(() => {
  if (binDir) rmSync(binDir, { recursive: true, force: true });
  binDir = undefined;
});

function runWithPathWithout(missing: string) {
  binDir = mkdtempSync(join(tmpdir(), "env-check-bin-"));
  for (const tool of TOOLS) {
    const target = resolve(tool);
    if (tool !== missing && target) symlinkSync(target, join(binDir, tool));
  }
  return spawnSync(join(binDir, "bash"), [script], {
    encoding: "utf8",
    env: { ...process.env, PATH: binDir },
    timeout: 10_000,
  });
}

describe("env-check.sh", () => {
  it("reports jq as ok when it is in the PATH", () => {
    const result = runWithPathWithout("none");
    expect(result.stdout).toMatch(/^ok\s+jq installed/m);
  });

  it("fails with a non-zero exit code when jq is missing from the PATH", () => {
    const result = runWithPathWithout("jq");
    expect(result.stdout).toMatch(/^FAIL\s+jq installed: jq not found in PATH$/m);
    expect(result.status).not.toBe(0);
  });
});
