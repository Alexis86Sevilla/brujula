#!/usr/bin/env bash
# Usage: run-hook.sh <hook-script>   (hook JSON on stdin, passed through)
# Plugin hooks run in EVERY project of the user, not only in brujula. This wrapper decides
# whether a hook applies to the current project and otherwise does nothing (exit 0).
set -u
name="${1:?usage: run-hook.sh <hook-script>}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
proj="${CLAUDE_PROJECT_DIR:-$PWD}"

# Personal escape hatch: BRUJULA_HOOKS_OFF=1 claude. It never disables the secret guards
# (protect-paths blocks .env files, secret-scan blocks secrets in commits) nor the confirmation of
# writes to Azure DevOps (confirm-ado-write).
if [ "${BRUJULA_HOOKS_OFF:-}" = 1 ]; then
  case "$name" in protect-paths.sh|secret-scan.sh|confirm-ado-write.sh) ;; *) exit 0 ;; esac
fi

case "$name" in
  # Node-stack hooks: only where the project actually has the tools they call.
  format-file.sh)
    [ -x "$proj/node_modules/.bin/prettier" ] || exit 0 ;;
  quality-gate.sh)
    if [ -z "${BRUJULA_TYPECHECK_CMD:-}${BRUJULA_TEST_CMD:-}" ]; then
      # A project of any stack can declare its test command (testCmd in .claude/brujula*.json).
      # shellcheck source=lib/project-config.sh
      source "$here/lib/project-config.sh"
      test_cmd="$(project_setting "$proj" testCmd)"
      if [ -n "$test_cmd" ]; then
        export BRUJULA_TEST_CMD="$test_cmd" BRUJULA_TYPECHECK_CMD=true
      else
      # Without a root tsconfig.json (a monorepo, say) tsc prints its usage and fails every turn.
      [ -f "$proj/package.json" ] && [ -f "$proj/tsconfig.json" ] && [ -x "$proj/node_modules/.bin/tsc" ] \
        && [ -x "$proj/node_modules/.bin/vitest" ] || exit 0
      fi
    fi ;;
esac

[ -x "$here/$name" ] || { echo "run-hook.sh: no such hook script: $name" >&2; exit 0; }
exec "$here/$name"
