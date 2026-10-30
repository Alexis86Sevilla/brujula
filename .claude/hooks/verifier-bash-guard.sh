#!/usr/bin/env bash
# PreToolUse(Bash) hook scoped to the `verificador` subagent (see its frontmatter).
set -euo pipefail

command -v jq >/dev/null || { echo "verifier-bash-guard: jq is required" >&2; exit 2; }

cmd="$(jq -r '.tool_input.command // empty')"
[ -n "$cmd" ] || exit 0

if printf '%s' "$cmd" | grep -qE '[;&|<>`]|\$\(|\$\{|\\$'; then
  echo "Blocked: the verificador runs one plain command (no ; & | < > \` \$()). Split it." >&2
  exit 2
fi

allowed='^(npm test|npm run (test|typecheck|lint|check)|npx vitest run|npx tsc --noEmit|git (diff|log|show|status)|git rev-parse)( |$)'
if printf '%s' "$cmd" | grep -qE "$allowed"; then
  exit 0
fi

echo "Blocked: the verificador may only run tests, typecheck, lint and read-only git. Got: $cmd" >&2
exit 2
