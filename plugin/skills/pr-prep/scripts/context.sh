#!/usr/bin/env bash
# Prints the minimum context needed to write a commit message or a PR description.
# Runs from anywhere inside the repo. Never fails because of a missing base branch.
set -euo pipefail

branch="$(git rev-parse --abbrev-ref HEAD)"

# origin/HEAD is a symbolic ref: resolve it to a real branch name such as origin/main.
default_remote="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || true)"

base=""
for candidate in $default_remote origin/main origin/master main master; do
  if git rev-parse --verify --quiet "$candidate" >/dev/null; then
    base="$candidate"
    break
  fi
done

# Work item id from the branch name: feature/1234-add-chunker, 1234-fix, user/alexis/1234_x
work_item="none"
if [[ "$branch" =~ (^|/)([0-9]{2,})[-_] ]]; then
  work_item="${BASH_REMATCH[2]}"
fi

# Whether the project uses pull requests: true | false | unset | invalid (.claude/brujula.json).
# shellcheck source=../../../scripts/lib/project-config.sh
source "$(dirname "$0")/../../../scripts/lib/project-config.sh"
pull_requests="$(pull_requests_setting "$(git rev-parse --show-toplevel)")"

echo "branch: $branch"
echo "base: ${base:-none}"
echo "work-item: $work_item"
echo "pull-requests: $pull_requests"
echo
echo "## status"
# No "| head" under pipefail: git would die of SIGPIPE (141) and stop the script.
status="$(git status --short)"
printf '%s\n' "${status}" | sed -n '1,30p'
echo
echo "## staged diff stat"
git diff --cached --stat | tail -15
echo
if [ -n "$base" ] && [ "$branch" != "${base#origin/}" ]; then
  echo "## commits on this branch ($base..HEAD)"
  git log -n 30 --oneline "$base..HEAD"
  echo
  echo "## branch diff stat ($base...HEAD)"
  git diff --stat "$base...HEAD" | tail -30
else
  echo "## last commits"
  git log --oneline -5
fi