#!/usr/bin/env bash
# Paths an agent must not write alone. Shared by protect-paths.sh (Edit|Write) and guard-bash.sh
# (shell writes), so both refuse the same files for the same reason.
#
#   protected_reason <path>   prints why <path> is protected, or nothing.
#
# Secrets are never writable. The rest (config-like paths) is writable when the human started
# Claude with BRUJULA_UNLOCK=1.

protected_reason() {
  local file=${1//\\//} # Windows separators
  [[ $file == /* ]] || file="/$file"
  case "${file##*/}" in
    .env.example) ;;
    .env | .env.*)
      echo "environment file with secrets"
      return
      ;;
  esac
  [ "${BRUJULA_UNLOCK:-}" = "1" ] && return
  case "$file" in
    */.git/*) echo "git internals" ;;
    */package-lock.json) echo "lockfile, changes only through npm" ;;
    */pipelines/*) echo "CI definitions need human review" ;;
    */.claude/hooks/* | */plugin/scripts/* | */plugin/hooks/*) echo "guardrails cannot edit themselves" ;;
    */.claude/settings.json) echo "guardrails cannot edit themselves" ;;
  esac
}
