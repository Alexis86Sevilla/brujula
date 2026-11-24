#!/usr/bin/env bash
# SessionStart (startup|resume|clear|compact): plain stdout becomes context.
# Keeps the model oriented after /clear and after compaction.
set -u

json="$(dirname "${BASH_SOURCE[0]}")/lib/json.mjs"
IFS= read -r -d '' source < <(node "$json" get source 2>/dev/null)

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

echo "## Session context (injected by the brujula plugin session-context.sh)"

# First new session of this person with Brújula: let Claude guide them (many users do not use a
# terminal). The marker lives in the plugin data folder, which survives updates.
data="${CLAUDE_PLUGIN_DATA:-}"
if [ -n "$data" ] && [ "$source" = "startup" ] && [ ! -e "$data/welcomed" ]; then
  if mkdir -p "$data" 2>/dev/null && : >"$data/welcomed" 2>/dev/null; then
    echo "First session of this person with Brújula: before anything else, use the brujula:bienvenida skill" \
      "to welcome them, unless their first message is already a concrete task (then do it, and offer the" \
      "welcome at the end)."
  fi
fi
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Branch: $(git branch --show-current)"
  echo "Last commits:"
  git log -3 --oneline 2>/dev/null | sed 's/^/- /'
  echo "Uncommitted files: $(git status --porcelain | wc -l | tr -d ' ')"
fi

sprint=.claude/context/sprint.md
if [ -f "$sprint" ]; then
  echo
  echo "Current sprint (from $sprint, first 40 lines):"
  head -n 40 "$sprint"
fi
exit 0