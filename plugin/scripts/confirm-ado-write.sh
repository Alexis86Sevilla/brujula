#!/usr/bin/env bash
# PreToolUse (mcp__plugin_brujula_ado__.*): every write to Azure DevOps asks the user first, in any
# project, because a plugin cannot ship permission rules. Read-only tools pass. Bypassing branch
# policies and voting on a pull request are denied: a person does those in the web.
# Style: exit 0 + JSON decision (the reason is shown to the model and to the user).
set -u

input=$(cat)
# Without jq nothing can be inspected: fail closed. Claude Code only calls this hook for the ado
# server's tools (hooks.json matcher), so asking is right.
if ! command -v jq >/dev/null 2>&1; then
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"jq is missing, so this Azure DevOps call cannot be checked: read it before approving."}}'
  exit 0
fi
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
prefix="mcp__plugin_brujula_ado__"
[[ "$tool" == "$prefix"* ]] || exit 0
name="${tool#"$prefix"}"

decide() {   # decide <ask|deny> <reason>
  jq -n --arg d "$1" --arg r "$2" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: $d, permissionDecisionReason: $r}}'
  exit 0
}

action=$(printf '%s' "$input" | jq -r '.tool_input.action // empty')
# Known read-only tools (checked against @azure-devops/mcp 2.11.0, the version in plugin/.mcp.json).
# Anything else, including tools added in a future server version, asks.
case "$name" in
  core_get_identity_ids|core_list_project_teams|core_list_projects) exit 0 ;;
  repo_branch|repo_file|repo_pull_request|repo_pull_request_org|repo_pull_request_thread) exit 0 ;;
  repo_repository|repo_search_commits) exit 0 ;;
  wit_query|wit_work_item|work|wiki) exit 0 ;;
  # wit_backlog can also "reorder" (a write); the attachment tool writes to disk with savePath.
  wit_backlog) [[ "$action" == "list" || "$action" == "list_work_items" ]] && exit 0 ;;
  wit_work_item_attachment)
    [[ "$(printf '%s' "$input" | jq -r '.tool_input.savePath // empty')" == "" ]] && exit 0 ;;
esac

if [[ "$(printf '%s' "$input" | jq -r '.tool_input.bypassPolicy // false')" == "true" ]]; then
  decide deny "bypassPolicy is blocked: a pull request completes through the branch policy, never around it."
fi
if [[ "$name" == "repo_pull_request_write" && "$action" == "vote" ]]; then
  decide deny "Voting on a pull request (vote) is blocked: approvals are a person's decision, made in the web."
fi
decide ask "Write to Azure DevOps ($name). Read the exact payload before approving: it cannot be cleanly undone."
