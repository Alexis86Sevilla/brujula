#!/usr/bin/env bash
# SessionStart (startup|resume|clear|compact): plain stdout becomes context.
# Keeps the model oriented after /clear and after compaction.
set -u

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

echo "## Session context (injected by .claude/hooks/session-context.sh)"
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