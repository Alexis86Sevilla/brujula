#!/usr/bin/env bash
# UserPromptSubmit: (1) refuse prompts that contain secrets, (2) hint work items.
set -u

input=$(cat)
prompt=$(printf '%s' "$input" | jq -r '.prompt // empty')
[ -z "$prompt" ] && exit 0

. "$(dirname "$0")/lib/secret-patterns.sh"
if [[ $prompt =~ $secret_re ]]; then
  jq -n '{decision: "block", reason: "This prompt looks like it contains a secret (key, token or PAT). It was NOT sent. Remove it and use an environment variable instead."}'
  exit 0
fi

ids=$(printf '%s' "$prompt" | grep -oE '(^|[^[:alnum:]_])(AB)?#[0-9]+' | grep -oE '#[0-9]+' | sort -u | tr '\n' ' ')
if [ -n "$ids" ]; then
  jq -n --arg ids "$ids" '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: ("The user referenced Azure Boards work items: " + $ids + "Read each one with the ado MCP tools (if connected) before planning. Do not guess its content.")}}'
fi
exit 0