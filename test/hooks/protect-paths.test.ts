import { describe, expect, it } from "vitest";
import { edit, projectDir, runHook } from "./helpers.js";

const p = (rel: string) => `${projectDir}/${rel}`;

describe("protect-paths hook", () => {
  it("blocks .env and .env.local with exit 2 and a reason for the model", () => {
    for (const f of [".env", ".env.local", "sub/.env.production"]) {
      const r = runHook("protect-paths.sh", edit(p(f)));
      expect(r.code, f).toBe(2);
      expect(r.stderr).toContain("Blocked");
    }
  });

  it("allows .env.example and normal source files", () => {
    expect(runHook("protect-paths.sh", edit(p(".env.example"))).code).toBe(0);
    expect(runHook("protect-paths.sh", edit(p("src/mcp/server.ts"))).code).toBe(0);
  });

  it("blocks config-like paths", () => {
    for (const f of [
      ".git/config",
      "package-lock.json",
      "pipelines/pr.yml",
      ".claude/hooks/x.sh",
      "plugin/scripts/guard-bash.sh",
      "plugin/hooks/hooks.json",
      ".claude/settings.json",
    ]) {
      expect(runHook("protect-paths.sh", edit(p(f))).code, f).toBe(2);
    }
  });

  it("BRUJULA_UNLOCK=1 opens config-like paths but never .env", () => {
    const env = { BRUJULA_UNLOCK: "1" };
    expect(runHook("protect-paths.sh", edit(p(".claude/settings.json")), env).code).toBe(0);
    expect(runHook("protect-paths.sh", edit(p(".env")), env).code).toBe(2);
  });

  it("normalises Windows separators", () => {
    expect(runHook("protect-paths.sh", edit("C:\\work\\brujula\\.env")).code).toBe(2);
  });

  it("ignores input without a file path", () => {
    expect(runHook("protect-paths.sh", { tool_input: {} }).code).toBe(0);
  });
});
