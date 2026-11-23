#!/usr/bin/env bash
# PreToolUse (Bash): deny a short list of destructive or bypass commands.
# Style: exit 0 + JSON decision (the reason is shown to the model).
# This catches honest mistakes, not an adversary: the sandbox is the hard barrier.
set -u

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

check() {   # check <extended-regex> <reason>
  if [[ $cmd =~ $1 ]]; then deny "$2"; fi
}

check '(^|[^[:alnum:]_.-])rm[[:space:]]+(-[[:alnum:]]*[rR]|--recursive)' \
  "Recursive rm is blocked. Delete specific files, or ask the user to run it."
check 'git[[:space:]]+push[^;&|]*[[:space:]](-f|--force)([[:space:]]|$)' \
  "Force push is blocked. Use --force-with-lease only after asking the user."
# Pushing to main depends on the project: some teams use pull requests, others do not.
push_main='git[[:space:]]+push[^;&|]*[[:space:]](main|master)([[:space:]]|$)'
if [[ $cmd =~ $push_main ]]; then
  # shellcheck source=lib/project-config.sh
  source "$(dirname "$0")/lib/project-config.sh"
  case "$(pull_requests_setting "${CLAUDE_PROJECT_DIR:-.}")" in
    false) ;;
    true) deny "Direct push to main/master is blocked: this project uses pull requests. Push a feature branch and open a pull request." ;;
    unset) deny 'Direct push to main/master is blocked until the project says how it integrates changes. Ask the user once whether this project uses pull requests, then write .claude/brujula.json with {"pullRequests": true} or {"pullRequests": false} and retry.' ;;
    *) deny '.claude/brujula.json is invalid: it must be a JSON object like {"pullRequests": true} or {"pullRequests": false}. Fix it, then retry.' ;;
  esac
fi
check 'git[[:space:]]+reset[[:space:]]+--hard' \
  "git reset --hard discards work. Use git stash or ask the user."
check 'git[[:space:]]+commit[^;&|]*--no-verify' \
  "Skipping commit hooks is blocked. Fix the failing check instead."
check '(curl|wget)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?(ba|z)?sh' \
  "Piping a download into a shell is blocked. Download, read it, then ask the user."
check 'chmod[[:space:]]+(-R[[:space:]]+)?777' \
  "chmod 777 is blocked. Pick the minimum permissions."

exit 0