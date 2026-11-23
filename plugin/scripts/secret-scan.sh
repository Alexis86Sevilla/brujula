#!/usr/bin/env bash
# PreToolUse (Bash): deny `git commit` when the diff about to be committed adds a secret.
# Style: exit 0 + JSON decision. The reason cites file:line only, never the value.
# Human override for one session: BRUJULA_ALLOW_SECRETS=1 claude
#   The hook reads the claude process env, so `BRUJULA_ALLOW_SECRETS=1 git commit` does nothing.
#
# What gets scanned (changes not yet in the index are handled explicitly):
# - `git commit`            -> git diff --cached
# - `git commit -a/-am/--all` -> git diff HEAD (tracked files, staged + unstaged: what -a commits)
# - `git add ... && git commit` in one command -> denied: the files are not staged yet, so the
#   scan would see the wrong diff. Guessing what `git add .` would stage is fragile; run it first.
set -u

input=$(cat)
# Cheap exit for every other Bash command, before spawning jq or git.
[[ $input == *commit* ]] || exit 0
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
commit_re='git[^;&|]*[[:space:]]commit([^;&|]*)'
[[ $cmd =~ $commit_re ]] || exit 0
commit_args=${BASH_REMATCH[1]}

[ "${BRUJULA_ALLOW_SECRETS:-}" = "1" ] && exit 0

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

add_then_commit_re='git[[:space:]]+add[[:space:]].*git[^;&|]*[[:space:]]commit'
if [[ $cmd =~ $add_then_commit_re ]]; then
  deny "Run git add as a separate command first, then git commit: the secret scan reads the staged diff, and these files are not staged yet."
fi

git_dir=${CLAUDE_PROJECT_DIR:-.}
range=(--cached)
all_re='(^|[[:space:]])(-[[:alpha:]]*a[[:alpha:]]*|--all)([[:space:]]|$)'
if [[ $commit_args =~ $all_re ]] && git -C "$git_dir" rev-parse -q --verify HEAD >/dev/null; then
  range=(HEAD)
fi

. "$(dirname "$0")/lib/secret-patterns.sh"

hits=()
file='' line=0 in_header=0
while IFS= read -r l; do
  case $l in
    'diff --git '*) in_header=1; continue ;;
    '@@ '*)
      in_header=0
      [[ $l =~ \+([0-9]+) ]] && line=${BASH_REMATCH[1]}
      continue
      ;;
  esac
  if [ "$in_header" = 1 ]; then
    # Header lines (index, ---, +++): only +++ matters, it names the new file.
    [[ $l == '+++ '* ]] && { file=${l#+++ }; file=${file#b/}; }
  elif [[ $l == +* ]]; then
    [[ ${l:1} =~ $secret_re ]] && hits+=("$file:$line")
    line=$((line + 1))
  fi
done < <(git -C "$git_dir" diff "${range[@]}" -U0 --no-color --no-ext-diff 2>/dev/null)

[ ${#hits[@]} -eq 0 ] && exit 0
deny "Commit blocked: the changes add what looks like a secret at $(IFS=,; echo "${hits[*]}" | sed 's/,/, /g'). The value is not shown. Remove it (read it from an environment variable instead), restage and retry. If it is a false positive, tell the user: only a human can bypass this check."
