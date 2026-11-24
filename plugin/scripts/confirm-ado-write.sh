#!/usr/bin/env bash
# PreToolUse (mcp__plugin_brujula_ado__.*): every write to Azure DevOps asks the user first, in any
# project, because a plugin cannot ship permission rules. Read-only tools pass. Bypassing branch
# policies and voting on a pull request are denied: a person does those in the web.
# Style: exit 0 + JSON decision (the reason is shown to the model and to the user).
set -u

json="$(dirname "${BASH_SOURCE[0]}")/lib/json.mjs"
# When the input cannot be inspected (node missing or failing), fail closed. Claude Code only calls
# this hook for the ado server's tools (hooks.json matcher), so asking is right.
unchecked() {
  printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"node is missing or failed, so this Azure DevOps call cannot be checked: read it before approving."}}'
  exit 0
}
command -v node >/dev/null 2>&1 || unchecked
# One node call for every field this hook reads. It prints exactly four NUL-terminated fields;
# anything else means it failed.
fields=()
mapfile -d '' -t fields < <(node "$json" get tool_name tool_input.action tool_input.savePath tool_input.bypassPolicy=false 2>/dev/null)
[ "${#fields[@]}" -eq 4 ] || unchecked
tool="${fields[0]}" action="${fields[1]}" save_path="${fields[2]}" bypass_policy="${fields[3]}"
prefix="mcp__plugin_brujula_ado__"
[[ "$tool" == "$prefix"* ]] || exit 0
name="${tool#"$prefix"}"

decide() {   # decide <ask|deny> <reason>
  node "$json" decision "$1" "$2" 2>/dev/null || unchecked
  exit 0
}

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
    [[ "$save_path" == "" ]] && exit 0 ;;
esac

if [[ "$bypass_policy" == "true" ]]; then
  decide deny "bypassPolicy is blocked: a pull request completes through the branch policy, never around it."
fi
if [[ "$name" == "repo_pull_request_write" && "$action" == "vote" ]]; then
  decide deny "Voting on a pull request (vote) is blocked: approvals are a person's decision, made in the web."
fi
decide ask "Write to Azure DevOps ($name). Read the exact payload before approving: it cannot be cleanly undone."
