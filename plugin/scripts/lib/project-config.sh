# Per-project Brujula settings, read from <project>/.claude/brujula.json.
# Sourced by guard-bash.sh and the pr-prep context script: single source of truth for the format.

# pull_requests_setting <project-dir>: prints true | false | unset | invalid
pull_requests_setting() {
  local file="$1/.claude/brujula.json" value
  if [[ ! -f "$file" ]]; then
    echo unset
    return 0
  fi
  value=$(jq -r 'if type == "object" and (.pullRequests | type) == "boolean" then .pullRequests else "invalid" end' \
    "$file" 2>/dev/null) || value=invalid
  echo "${value:-invalid}"
}
