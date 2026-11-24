import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runHook, scriptsDir } from "./helpers.js";

const ado = (tool: string) => `mcp__plugin_brujula_ado__${tool}`;

function decide(tool: string, input: Record<string, unknown> = {}, env: Record<string, string> = {}) {
  const r = runHook("confirm-ado-write.sh", { hook_event_name: "PreToolUse", tool_name: tool, tool_input: input }, env);
  expect(r.code).toBe(0); // JSON style: always exit 0
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput : undefined;
}

describe("confirm-ado-write hook", () => {
  it.each([
    "wit_work_item_write",
    "wit_work_item_comment_write",
    "wit_work_item_link_write",
    "wit_work_item_attachment_upload",
    "repo_pull_request_write",
    "repo_pull_request_thread_write",
    "repo_create_branch",
    "repo_file_write",
    "wiki_upsert_page",
    "work_iteration_write",
    "some_future_tool",
  ])("asks the user before %s, in any project", (tool) => {
    const out = decide(ado(tool), { action: "create" });
    expect(out.permissionDecision).toBe("ask");
    expect(out.permissionDecisionReason).toContain("Azure DevOps");
  });

  it.each([
    "wit_work_item",
    "wit_query",
    "repo_pull_request",
    "repo_pull_request_thread",
    "repo_branch",
    "core_list_projects",
    "work",
    "wiki",
  ])("lets the read-only tool %s through", (tool) => {
    expect(decide(ado(tool))).toBeUndefined();
  });

  it("asks before reordering the backlog, and lets listing it through", () => {
    expect(decide(ado("wit_backlog"), { action: "reorder", ids: [1] }).permissionDecision).toBe("ask");
    expect(decide(ado("wit_backlog"), { action: "list" })).toBeUndefined();
  });

  it("asks before saving an attachment to disk, and lets reading it through", () => {
    expect(decide(ado("wit_work_item_attachment"), { id: 1, savePath: "src" }).permissionDecision).toBe("ask");
    expect(decide(ado("wit_work_item_attachment"), { id: 1 })).toBeUndefined();
  });

  it("asks (fails closed) when node is missing", () => {
    const bin = mkdtempSync(join(tmpdir(), "no-jq-"));
    symlinkSync(execFileSync("bash", ["-c", "command -v cat"], { encoding: "utf8" }).trim(), join(bin, "cat"));
    const r = spawnSync("/bin/bash", [join(scriptsDir, "confirm-ado-write.sh")], {
      input: JSON.stringify({ tool_name: ado("wit_work_item_write"), tool_input: {} }),
      encoding: "utf8",
      env: { PATH: bin },
    });
    rmSync(bin, { recursive: true, force: true });
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision).toBe("ask");
  });

  it("asks (fails closed) when node is present but cannot run the helper", () => {
    const r = runHook(
      "confirm-ado-write.sh",
      { hook_event_name: "PreToolUse", tool_name: ado("wit_work_item_write"), tool_input: {} },
      { NODE_OPTIONS: "--require=/nonexistent/broken.js" },
    );
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision).toBe("ask");
  });

  it("keeps denying when a value hides a NUL character", () => {
    for (const input of [{ action: "x\u0000", bypassPolicy: true }, { action: "\u0000vote" }]) {
      expect(decide(ado("repo_pull_request_write"), input)?.permissionDecision, JSON.stringify(input)).toBe("deny");
    }
  });

  it("ignores tools of other servers", () => {
    expect(decide("mcp__other__wit_work_item_write")).toBeUndefined();
  });

  it("denies bypassing branch policies and voting on a pull request", () => {
    const bypass = decide(ado("repo_pull_request_write"), { action: "update", bypassPolicy: true });
    expect(bypass.permissionDecision).toBe("deny");
    expect(bypass.permissionDecisionReason).toContain("bypassPolicy");
    const vote = decide(ado("repo_pull_request_write"), { action: "vote", vote: "Approved" });
    expect(vote.permissionDecision).toBe("deny");
    expect(vote.permissionDecisionReason).toContain("vote");
  });
});
