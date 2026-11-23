#!/usr/bin/env bash
# PostToolUse (Edit|Write): run prettier on the file the agent just wrote.
# Silent on success. On failure, tell the model through a JSON "block" reason.
set -u

input=$(cat)
file=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

case "$file" in
  */node_modules/*) exit 0 ;;
  *.ts | *.tsx | *.js | *.mjs | *.css) ;;   # not .md/.json: SKILL.md and cards stay as written
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
if ! out=$(npx --no-install prettier --write --log-level warn "$file" 2>&1); then
  jq -n --arg r "prettier could not format $file: $out" '{decision: "block", reason: $r}'
fi
exit 0