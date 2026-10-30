#!/usr/bin/env bash
# Shared helpers for headless Claude scripts. Source it; do not execute it.
set -euo pipefail

# Isolated config dir: no orchestrator CLAUDE.md, no personal hooks or MCP.
# In CI this directory is empty and CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY authenticate.
export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude-automation}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing dependency: $1" >&2; exit 127; }
}
require "$CLAUDE_BIN"
require jq

# run_claude <prompt> [extra claude flags...]
# Prints the JSON envelope on stdout. Caps are overridable per script.
run_claude() {
  local prompt="$1"; shift
  "$CLAUDE_BIN" -p "$prompt" \
    --output-format json \
    --permission-mode dontAsk \
    --max-turns "${MAX_TURNS:-10}" \
    --max-budget-usd "${MAX_BUDGET_USD:-0.50}" \
    "$@"
}

# assert_ok <envelope>: fail if the run reported an error or returned nothing.
assert_ok() {
  local env="$1"
  if ! jq -e '(.is_error // false) == false' >/dev/null 2>&1 <<<"$env"; then
    echo "claude run failed: $(jq -r '.result // "no result"' <<<"$env" 2>/dev/null || echo "$env")" >&2
    return 1
  fi
}

# log_cost <envelope>: one line to stderr, never to stdout.
log_cost() {
  jq -r '"cost_usd=\(.total_cost_usd // "n/a") turns=\(.num_turns // "n/a")"' <<<"$1" >&2 || true
}