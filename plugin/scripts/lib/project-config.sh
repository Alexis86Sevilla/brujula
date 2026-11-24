#!/usr/bin/env bash
# Per-project Brujula settings, the single source of truth for their format. Two files:
#   .claude/brujula.json        shared with the team, versioned
#   .claude/brujula.local.json  personal, never versioned (zero footprint in someone else's repo);
#                               it wins key by key
# Inside a git worktree the personal file is read from the main checkout: a worktree does not
# get untracked files.
# Keys: pullRequests (boolean), baseBranch, testCmd, lintCmd, adoProject (strings). testCmd and lintCmd
# are commands the quality gate runs outside the sandbox, so they are taken only from the personal
# file: a cloned repository cannot make Brújula run its commands.
#
# Sourced by guard-bash.sh, run-hook.sh and the pr-prep context script. As a command it prints the
# merged settings as JSON, for skills and doctor.mjs:
#   bash project-config.sh [project-dir]   -> JSON on stdout, exit 0; exit 1 + reason on stderr if invalid

# Validation and merging live in json.mjs (no jq needed): exactly one JSON document per file, an
# object whose known keys have the right type. Resolved now: inside a function BASH_SOURCE may differ.
_brujula_json="$(dirname "${BASH_SOURCE[0]}")/json.mjs"

# _brujula_main_checkout <dir>: the main checkout of the repository that contains <dir> (the first
# entry of `git worktree list`), or <dir> itself when there is none (a bare repository).
_brujula_main_checkout() {
  local list first
  list=$(git -C "$1" worktree list --porcelain 2>/dev/null) || { echo "$1"; return 0; }
  first=$(sed -n '1,3p' <<<"$list")
  if [[ "$first" != worktree\ * ]] || grep -qx 'bare' <<<"$first"; then
    echo "$1"
    return 0
  fi
  sed -n '1s/^worktree //p' <<<"$first"
}

# _brujula_local_file <dir>: the personal settings file of <dir>.
_brujula_local_file() {
  local local_file
  local_file="$(_brujula_main_checkout "$1")/.claude/brujula.local.json"
  [[ -f "$local_file" ]] || local_file="$1/.claude/brujula.local.json"
  printf '%s\n' "$local_file"
}

# project_config_json <dir> [--pretty]: merged settings as compact JSON; exit 1 + reason on stderr if
# a file is invalid.
project_config_json() {
  node "$_brujula_json" config "$1/.claude/brujula.json" "$(_brujula_local_file "$1")" ${2:+"$2"}
}

# pull_requests_setting <dir>: prints true | false | unset | invalid
pull_requests_setting() {
  node "$_brujula_json" pull-requests "$1/.claude/brujula.json" "$(_brujula_local_file "$1")" 2>/dev/null || echo invalid
}

# project_setting <dir> <key>: the string value of <key>, or nothing (also when the files are invalid).
project_setting() {
  node "$_brujula_json" setting "$1/.claude/brujula.json" "$(_brujula_local_file "$1")" "$2" 2>/dev/null
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  project_config_json "${1:-${CLAUDE_PROJECT_DIR:-$PWD}}" --pretty
fi
