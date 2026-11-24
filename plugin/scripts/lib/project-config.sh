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

# Read with jq -s: exactly one JSON document, an object whose known keys have the right type.
_brujula_config_valid='length == 1 and (.[0] | type == "object"
  and ((has("pullRequests") | not) or (.pullRequests | type) == "boolean")
  and ([.baseBranch, .testCmd, .lintCmd, .adoProject] | all(. == null or type == "string")))'

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

# project_config_json <dir>: merged settings as compact JSON; exit 1 + reason on stderr if a file is invalid.
project_config_json() {
  local dir="$1" shared local_file merged='{}' file
  shared="$dir/.claude/brujula.json"
  local_file="$(_brujula_main_checkout "$dir")/.claude/brujula.local.json"
  [[ -f "$local_file" ]] || local_file="$dir/.claude/brujula.local.json"
  for file in "$shared" "$local_file"; do
    [[ -f "$file" ]] || continue
    if ! jq -s -e "$_brujula_config_valid" "$file" >/dev/null 2>&1; then
      echo "$file is invalid: it must be a JSON object like {\"pullRequests\": true, \"testCmd\": \"./mvnw test\"}" >&2
      return 1
    fi
    if [[ "$file" == "$shared" ]]; then
      merged=$(jq -c --argjson base "$merged" '$base + del(.testCmd, .lintCmd)' "$file")
    else
      merged=$(jq -c --argjson base "$merged" '$base + .' "$file")
    fi
  done
  printf '%s\n' "$merged"
}

# pull_requests_setting <dir>: prints true | false | unset | invalid
pull_requests_setting() {
  local merged
  merged=$(project_config_json "$1" 2>/dev/null) || { echo invalid; return 0; }
  jq -r 'if has("pullRequests") then .pullRequests else "unset" end' <<<"$merged"
}

# project_setting <dir> <key>: the string value of <key>, or nothing (also when the files are invalid).
project_setting() {
  local merged
  merged=$(project_config_json "$1" 2>/dev/null) || return 0
  jq -r --arg k "$2" '.[$k] // empty' <<<"$merged"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  project_config_json "${1:-${CLAUDE_PROJECT_DIR:-$PWD}}" | jq .
fi
