#!/usr/bin/env bash
# PreToolUse (Bash): deny a short list of destructive or bypass commands.
# Style: exit 0 + JSON decision (the reason is shown to the model).
# This catches honest mistakes, not an adversary: the sandbox is the hard barrier.
set -u

json="$(dirname "${BASH_SOURCE[0]}")/lib/json.mjs"
IFS= read -r -d '' cmd < <(node "$json" get tool_input.command)
[ -z "$cmd" ] && exit 0

deny() {
  node "$json" decision deny "$1"
  exit 0
}

check() {   # check <extended-regex> <reason>
  if [[ $cmd =~ $1 ]]; then deny "$2"; fi
}

# `git rm -r` removes tracked files that git can restore: only plain rm counts here.
if [[ ${cmd//git rm/git-rm} =~ (^|[^[:alnum:]_.-])rm([[:space:]]+-[^[:space:]]*)*[[:space:]]+(-[[:alnum:]]*[rR]|--recursive) ]]; then
  deny "Recursive rm is blocked. Delete specific files, or ask the user to run it."
fi
git_push='git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push[^;&|]*'
check "${git_push}"'[[:space:]](-f|--force|["'\'']?\+[^[:space:]]+)([[:space:]]|$)' \
  "Force push is blocked. Use --force-with-lease only after asking the user."
# Pushing to main depends on the project: some teams use pull requests, others do not.
# The destination is main when the last refspec part is main: "main", "HEAD:main", "x:refs/heads/main".
push_main="${git_push}"'[[:space:]:+"'\''](refs/heads/)?(main|master)([[:space:]"'\'']|$)'
to_main=0
if [[ $cmd =~ $push_main ]]; then
  to_main=1
elif [[ $cmd =~ $git_push ]]; then
  # No destination, or only HEAD ("git push", "git push -u origin HEAD"): it goes to the current
  # branch. The branch is read before the command runs, so only guess it when the command cannot
  # change it or point elsewhere (cd, checkout, switch, git -C) and pushes a branch at all.
  push_args="${BASH_REMATCH[0]%%$'\n'*}"
  moves='(^|[^[:alnum:]_-])(cd|checkout|switch)([[:space:]]|$)'
  no_branch='[[:space:]](--tags|--delete|-d|--dry-run|-n|--all|--mirror)([[:space:]=]|$)'
  if [[ ! $cmd =~ $moves && ! $push_args =~ ^git[[:space:]]+-C && ! $push_args =~ $no_branch ]]; then
    read -ra words <<<"${push_args#*push}"
    positional=()
    takes_value=0
    for w in ${words[@]+"${words[@]}"}; do
      if [[ $takes_value == 1 ]]; then
        takes_value=0
        continue
      fi
      case $w in
        -o | --push-option | --repo | --receive-pack | --exec) takes_value=1 ;;
        -* | [0-9]\>* | [0-9]\<* | \>* | \<* | \&\>*) ;; # options and redirections
        *) positional+=("${w//[\"\']/}") ;;
      esac
    done
    refspecs=()
    [[ ${#positional[@]} -gt 1 ]] && refspecs=("${positional[@]:1}")
    if [[ ${#refspecs[@]} -eq 0 || "${refspecs[*]}" =~ ^(HEAD[[:space:]]*)+$ ]]; then
      branch=$(git -C "${CLAUDE_PROJECT_DIR:-.}" branch --show-current 2>/dev/null)
      [[ $branch == main || $branch == master ]] && to_main=1
    fi
  fi
fi
if [[ $to_main == 1 ]]; then
  # shellcheck source=lib/project-config.sh
  source "$(dirname "$0")/lib/project-config.sh"
  case "$(pull_requests_setting "${CLAUDE_PROJECT_DIR:-.}")" in
    false) ;;
    true) deny "Direct push to main/master is blocked: this project uses pull requests. Push a feature branch and open a pull request." ;;
    unset) deny 'Direct push to main/master is blocked until the project says how it integrates changes. Ask the user once whether this project uses pull requests, then write .claude/brujula.json with {"pullRequests": true} or {"pullRequests": false} (shared with the team, versioned) or the same in .claude/brujula.local.json (personal, never versioned: the choice in a repo that is not yours) and retry.' ;;
    *) deny 'The project settings are invalid (.claude/brujula.json or .claude/brujula.local.json): each must be a JSON object like {"pullRequests": true}. Fix it, then retry.' ;;
  esac
fi
check 'git[[:space:]]+reset[[:space:]]+--hard' \
  "git reset --hard discards work. Use git stash or ask the user."
nl=$'\n'
if [[ $cmd =~ git[[:space:]]+commit([^;&|$nl]*) ]]; then
  args="${BASH_REMATCH[1]}"
  args="$(printf '%s' "$args" | sed -E "s/\"[^\"]*\"//g; s/'[^']*'//g")"
  if [[ " $args " =~ [[:space:]](--no-verify|-[apsvqeio]*n[apsvqeio]*m?)[[:space:]] ]]; then
    deny "Skipping commit hooks (-n or --no-verify) is blocked. Fix the failing check instead."
  fi
fi
check '(curl|wget)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?(ba|z)?sh' \
  "Piping a download into a shell is blocked. Download, read it, then ask the user."
check 'chmod[[:space:]]+(-R[[:space:]]+)?777' \
  "chmod 777 is blocked. Pick the minimum permissions."


# Writes to the paths protect-paths.sh guards (lockfile, .env, .git, pipelines, guardrails), made
# from the shell instead of Edit/Write: redirections and the usual file-writing commands. A
# heuristic for honest shortcuts (": > package-lock.json"), not a parser.
# shellcheck source=lib/protected.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib/protected.sh"
check_target() {   # check_target <path>
  local reason
  reason=$(protected_reason "$1")
  [ -n "$reason" ] && deny "Blocked: $1 is protected ($reason), also from the shell. Do not retry or work around it. Tell the user what change you need and why; a human will make it."
}
# Quoted text with spaces is a message or a script, not a path ("fix > .env handling").
# -z reads the whole command at once, so a quoted message can span lines.
scan=$(printf '%s' "$cmd" | sed -zE "s/\"[^\"]*[[:space:]][^\"]*\"//g; s/'[^']*[[:space:]][^']*'//g" | tr -d '\0')
# Duplications (2>&1, >&2) write no file; every other redirection becomes a lone ">".
scan=$(printf '%s' "$scan" | sed -E 's/[0-9]*>&[0-9-]//g; s/(&>>?|[0-9]*>>?\|?)/ > /g')
scan=${scan//[\"\']/}
while IFS= read -r segment; do
  read -ra words <<<"$segment"
  [[ ${#words[@]} -eq 0 ]] && continue
  # The command word, past sudo, env and VAR=value prefixes.
  i=0
  while [[ $i -lt ${#words[@]} && ${words[$i]} =~ ^(sudo|env|command|exec|nohup|time|[A-Za-z_][A-Za-z0-9_]*=.*)$ ]]; do
    i=$((i + 1))
  done
  name=${words[$i]:-}
  name=${name##*/}
  args=()
  in_place=0
  redirect=0
  script=0 # sed/perl: the script came with -e/-f, so no positional word is the script
  skip=0
  for w in ${words[@]+"${words[@]:$((i + 1))}"}; do
    if [[ $redirect == 1 ]]; then
      check_target "$w"
      redirect=0
      continue
    fi
    if [[ $skip == 1 ]]; then
      skip=0
      continue
    fi
    if [[ $name == sed || $name == perl ]]; then
      [[ $w =~ ^-[A-Za-z]*i || $w == --in-place* ]] && in_place=1
      if [[ $w =~ ^-[A-Za-z]*[ef]$ || $w == --expression || $w == --file ]]; then
        script=1
        skip=1
        continue
      fi
    fi
    case $w in
      ">") redirect=1 ;;
      of=*) [[ $name == dd ]] && check_target "${w#of=}" ;;
      -*) ;;
      *) args+=("$w") ;;
    esac
  done
  # A segment that starts with the redirection ("> .env", "<<EOF > .env").
  [[ ${words[$i]:-} == ">" && -n ${words[$((i + 1))]:-} ]] && check_target "${words[$((i + 1))]}"
  [[ ${#args[@]} -eq 0 ]] && continue
  case $name in
    tee | touch | truncate | mv) for a in "${args[@]}"; do check_target "$a"; done ;;
    cp | ln | install) check_target "${args[${#args[@]} - 1]}" ;;
    sed | perl)
      [[ $script == 0 ]] && args=("${args[@]:1}") # the first word is the script ("s/a/b/")
      [[ $in_place == 1 ]] && for a in ${args[@]+"${args[@]}"}; do check_target "$a"; done
      ;;
  esac
done < <(printf '%s\n' "$scan" | sed -E 's/(\|\||&&|[;|&])/\n/g')

exit 0