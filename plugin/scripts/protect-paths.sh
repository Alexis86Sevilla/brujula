#!/usr/bin/env bash
# PreToolUse (Edit|Write): refuse edits to files an agent must not touch alone.
# Style: exit 2 + reason on stderr (stderr goes back to the model).
# Human override for config-like paths: BRUJULA_UNLOCK=1 claude
set -u

json="$(dirname "${BASH_SOURCE[0]}")/lib/json.mjs"
IFS= read -r -d '' file < <(node "$json" get tool_input.file_path)
[ -z "$file" ] && exit 0
file=${file//\\//}   # normalise Windows separators

block() {
  echo "Blocked: $file is protected ($1). Do not retry or work around it. Tell the user what change you need and why; a human will make it." >&2
  exit 2
}

# shellcheck source=lib/protected.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/protected.sh"
reason=$(protected_reason "$file")
[ -n "$reason" ] && block "$reason"
exit 0
