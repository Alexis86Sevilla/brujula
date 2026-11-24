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
# The plugin runs without the Azure DevOps organization (an update can clear it): Claude Code then
# drops the ado server without a word, and the person only sees that Azure DevOps does not answer.
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -z "${CLAUDE_PLUGIN_OPTION_ADO_ORG:-}" ]; then
  echo "The Brújula plugin has no Azure DevOps organization set, so Azure DevOps is not connected." \
    "Tell the person, in plain Spanish and before anything else, to type /plugin configure brujula@brujula-equipo" \
    "in this chat, fill in the organization (the name in https://dev.azure.com/<organization>) and restart Claude."
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