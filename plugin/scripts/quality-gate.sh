#!/usr/bin/env bash
# Stop: do not let the agent end its turn with a broken typecheck or red tests.
# Style: exit 2 + stderr (the model must keep working).
# Overridable for tests: BRUJULA_TYPECHECK_CMD, BRUJULA_TEST_CMD, BRUJULA_GATE_FORCE=1.
# Human escape hatch for TDD RED phases: BRUJULA_GATE_OFF=1 claude
set -u

[ "${BRUJULA_GATE_OFF:-}" = 1 ] && exit 0

input=$(cat)

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Fingerprint of the working tree: tracked changes against HEAD plus untracked (not ignored) files.
fingerprint() {
  {
    git diff HEAD --no-ext-diff --binary 2>/dev/null
    git ls-files -z --others --exclude-standard 2>/dev/null | xargs -0 -r sha1sum 2>/dev/null
  } | sha1sum
}

# One starting point per session, so a turn is judged by what IT changed, not by red code left
# over from an earlier turn (or a question that touched nothing).
session=$(printf '%s' "$input" | jq -r '.session_id // empty' | tr -cd 'A-Za-z0-9_-')
snapshot=""
[ -n "$session" ] && snapshot="${TMPDIR:-/tmp}/brujula-gate-$session"

if [ "$(printf '%s' "$input" | jq -r '.hook_event_name // empty')" = "UserPromptSubmit" ]; then
  [ -n "$snapshot" ] && fingerprint >"$snapshot" 2>/dev/null
  exit 0
fi

# Already continuing because of this hook: do not block again.
# A second red run means the agent could not fix it; stop wasting turns.
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0

if [ "${BRUJULA_GATE_FORCE:-}" != "1" ]; then
  if [ -n "$snapshot" ] && [ -f "$snapshot" ]; then
    # Nothing changed during this turn: nothing to check.
    [ "$(fingerprint)" = "$(cat "$snapshot")" ] && exit 0
  elif [ -z "$(git status --porcelain -- src test 2>/dev/null)" ]; then
    # No starting point (session older than this hook): only when code changed under src/ or test/.
    exit 0
  fi
fi

typecheck=${BRUJULA_TYPECHECK_CMD:-npx --no-install tsc --noEmit}
tests=${BRUJULA_TEST_CMD:-npx --no-install vitest run --reporter=dot}
log=$(mktemp)
trap 'rm -f "$log"' EXIT

if ! bash -c "$typecheck" >"$log" 2>&1; then
  { echo "Typecheck fails after your changes. Fix it before finishing. Last lines:"; tail -n 30 "$log"; } >&2
  exit 2
fi
if ! bash -c "$tests" >"$log" 2>&1; then
  { echo "Tests fail after your changes. Fix the code (not the tests) before finishing. Last lines:"; tail -n 40 "$log"; } >&2
  exit 2
fi
exit 0