#!/usr/bin/env bash
# Usage: bash repo-info.sh
# Prints what the configurar and empezar skills need to know about the current repository:
# where it is, its main checkout, branch, remote, default branch, a few changed files and the
# merged Brújula settings. Read-only. BRUJULA_SCRIPTS_DIR lets the tests use another copy of the
# plugin scripts.
set -euo pipefail

top="$(git rev-parse --show-toplevel)"
common="$(git rev-parse --path-format=absolute --git-common-dir)"
default_branch="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || true)"
origin="$(git remote get-url origin 2>/dev/null || true)"
status="$(git status --short)"

echo "repository: $top"
echo "main-checkout: $(dirname "$common")"
echo "branch: $(git branch --show-current)"
echo "origin: ${origin:-none}"
echo "default-branch: ${default_branch#origin/}"
echo "root-files: $(cd "$top" && ls -A | tr '\n' ' ')"
echo
echo "## status (first 10)"
printf '%s\n' "${status}" | sed -n '1,10p'
echo
echo "## brujula settings"
bash "${BRUJULA_SCRIPTS_DIR:-$(dirname "$0")/../../../scripts}/lib/project-config.sh" "$top"
