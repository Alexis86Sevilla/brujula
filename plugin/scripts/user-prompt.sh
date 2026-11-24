#!/usr/bin/env bash
# UserPromptSubmit: (1) refuse prompts that contain secrets, (2) hint work items.
set -u

json="$(dirname "${BASH_SOURCE[0]}")/lib/json.mjs"
IFS= read -r -d '' prompt < <(node "$json" get prompt)
[ -z "$prompt" ] && exit 0

. "$(dirname "$0")/lib/secret-patterns.sh"
if [[ $prompt =~ $secret_re ]]; then
  node "$json" block "This prompt looks like it contains a secret (key, token or PAT). It was NOT sent. Remove it and use an environment variable instead."
  exit 0
fi

ids=$(printf '%s' "$prompt" | grep -oE '(^|[^[:alnum:]_])(AB)?#[0-9]+' | grep -oE '#[0-9]+' | sort -u | tr '\n' ' ')
if [ -n "$ids" ]; then
  node "$json" context UserPromptSubmit \
    "The user referenced Azure Boards work items: ${ids}Read each one with the ado MCP tools (if connected) before planning. Do not guess its content."
fi
exit 0