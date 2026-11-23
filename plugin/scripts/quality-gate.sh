#!/usr/bin/env bash
# Stop: do not let the agent end its turn with a broken typecheck or red tests.
# Style: exit 2 + stderr (the model must keep working).
# Overridable for tests: BRUJULA_TYPECHECK_CMD, BRUJULA_TEST_CMD, BRUJULA_GATE_FORCE=1.
# Human escape hatch for TDD RED phases: BRUJULA_GATE_OFF=1 claude
set -u

[ "${BRUJULA_GATE_OFF:-}" = 1 ] && exit 0

input=$(cat)

# Already continuing because of this hook: do not block again.
# A second red run means the agent could not fix it; stop wasting turns.
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Only when code changed (modified, added or untracked) under src/ or test/.
if [ "${BRUJULA_GATE_FORCE:-}" != "1" ] && [ -z "$(git status --porcelain -- src test 2>/dev/null)" ]; then
  exit 0
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