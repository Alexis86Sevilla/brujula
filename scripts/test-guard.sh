#!/usr/bin/env bash
# Fails if any test file changed between a base commit (the RED commit) and the working tree.
# Usage: scripts/test-guard.sh <red-commit> [pathspec]
set -euo pipefail

base="${1:?usage: test-guard.sh <red-commit> [pathspec]}"
spec="${2:-test/}"

git rev-parse --verify --quiet "$base^{commit}" >/dev/null \
  || { echo "test-guard: '$base' is not a commit" >&2; exit 2; }

# files modified or deleted since the RED commit (new test files are allowed)
changed="$(git diff --name-only --diff-filter=MD "$base" -- "$spec")"

if [ -n "$changed" ]; then
  echo "test-guard: tests changed since $base:" >&2
  echo "$changed" | sed 's/^/  - /' >&2
  exit 1
fi
echo "test-guard: OK, no test modified since $base"