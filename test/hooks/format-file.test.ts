import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runHook } from "./helpers.js";

const post = (file_path: string) => ({
  hook_event_name: "PostToolUse",
  tool_name: "Write",
  tool_input: { file_path },
  tool_response: { filePath: file_path, type: "create" },
});

describe("format-file hook", () => {
  it("formats a TypeScript file in place and stays silent", () => {
    const f = join(mkdtempSync(join(tmpdir(), "fmt-")), "a.ts");
    writeFileSync(f, "const   a={x:1}\n");
    const r = runHook("format-file.sh", post(f));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
    expect(readFileSync(f, "utf8")).toBe("const a = { x: 1 };\n");
  });

  it("does not touch markdown or other extensions", () => {
    const f = join(mkdtempSync(join(tmpdir(), "fmt-")), "notes.md");
    writeFileSync(f, "a   b\n");
    expect(runHook("format-file.sh", post(f)).code).toBe(0);
    expect(readFileSync(f, "utf8")).toBe("a   b\n");
  });

  it("reports syntax errors to the model as a block reason", () => {
    const f = join(mkdtempSync(join(tmpdir(), "fmt-")), "broken.ts");
    writeFileSync(f, "const = ;\n");
    const r = runHook("format-file.sh", post(f));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).decision).toBe("block");
  });

  it("ignores files that do not exist", () => {
    expect(runHook("format-file.sh", post("/nonexistent/x.ts")).code).toBe(0);
  });
});