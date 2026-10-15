#!/usr/bin/env bash
# Local environment sanity check. No network, no API key, < 5s.
# Prints one line per check ("ok" or "FAIL") and exits non-zero if any fails.
set -u

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILURES=0

ok() { printf 'ok    %s\n' "$1"; }
fail() {
  printf 'FAIL  %s: %s\n' "$1" "$2"
  FAILURES=$((FAILURES + 1))
}

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    fail "node >= 22" "node not found in PATH"
    return
  fi
  local version major
  version="$(node --version 2>/dev/null)"
  major="${version#v}"
  major="${major%%.*}"
  if [[ "$major" =~ ^[0-9]+$ ]] && ((major >= 22)); then
    ok "node >= 22 ($version)"
  else
    fail "node >= 22" "found ${version:-unknown version}"
  fi
}

check_jq() {
  if command -v jq >/dev/null 2>&1; then
    ok "jq installed ($(jq --version 2>/dev/null))"
  else
    fail "jq installed" "jq not found in PATH"
  fi
}

check_claude() {
  if ! command -v claude >/dev/null 2>&1; then
    fail "claude in PATH" "claude not found in PATH"
    fail "claude doctor" "skipped, claude not found"
    return
  fi
  local version
  version="$(timeout 3 claude --version 2>/dev/null | head -n 1)"
  if [[ "$version" =~ [0-9]+\.[0-9]+\.[0-9]+ ]]; then
    ok "claude in PATH ($version)"
  else
    fail "claude in PATH" "could not read version (got '${version}')"
  fi

  local status
  timeout 3 claude doctor </dev/null >/dev/null 2>&1
  status=$?
  if ((status == 0)); then
    ok "claude doctor"
  elif ((status == 124)); then
    fail "claude doctor" "timed out after 3s"
  else
    fail "claude doctor" "exited with code $status"
  fi
}

check_statusline() {
  local statusline="$HOME/.claude/statusline.sh"
  if [[ ! -e "$statusline" ]]; then
    fail "statusline executable" "$statusline does not exist (see Module 0b)"
  elif [[ ! -x "$statusline" ]]; then
    fail "statusline executable" "$statusline is not executable (chmod +x)"
  else
    ok "statusline executable ($statusline)"
  fi
}

check_not_under_mnt() {
  if [[ "$REPO_ROOT" == /mnt/* ]]; then
    fail "repo outside /mnt/" "repo is at $REPO_ROOT; move it to the Linux filesystem"
  else
    ok "repo outside /mnt/ ($REPO_ROOT)"
  fi
}

check_origin() {
  local url
  if ! url="$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null)"; then
    fail "origin points to Azure DevOps" "no 'origin' remote configured"
    return
  fi
  # Accepts https://[user@]dev.azure.com/... and [ssh://]git@ssh.dev.azure.com[:/]...
  if [[ "$url" =~ ^https://([^@/]+@)?dev\.azure\.com/ || "$url" =~ ^(ssh://)?[^@/]+@ssh\.dev\.azure\.com[:/] ]]; then
    ok "origin points to Azure DevOps"
  else
    fail "origin points to Azure DevOps" "origin is '$url'"
  fi
}

check_settings_json() {
  local settings="$REPO_ROOT/.claude/settings.json"
  if [[ ! -f "$settings" ]]; then
    fail ".claude/settings.json valid" "file not found"
    return
  fi
  local err
  # Uses node rather than jq so this check stays independent of the jq check.
  if err="$(node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$settings" 2>&1)"; then
    ok ".claude/settings.json valid"
  else
    fail ".claude/settings.json valid" "$(printf '%s' "$err" | grep -m1 -E 'SyntaxError' || echo 'invalid JSON')"
  fi
}

check_node
check_jq
check_claude
check_statusline
check_not_under_mnt
check_origin
check_settings_json

if ((FAILURES > 0)); then
  printf '\n%d check(s) failed\n' "$FAILURES"
  exit 1
fi
printf '\nall checks passed\n'
