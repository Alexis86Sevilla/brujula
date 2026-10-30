#!/usr/bin/env bash
# Usage: ADO_ORG=myorg ADO_PROJECT=MyProject scripts/backlog-digest.sh [out-dir]
# Writes digests/YYYY-MM-DD.md. Idempotent: does nothing if today's file exists (FORCE=1 overrides).
source "$(dirname "$0")/lib.sh"

: "${ADO_ORG:?set ADO_ORG (organization name, not URL)}"
: "${ADO_PROJECT:?set ADO_PROJECT}"
ADO_AUTH="${ADO_AUTH:-azcli}"   # azcli | pat | envvar ; 'interactive' would hang a headless run
here="$(cd "$(dirname "$0")" && pwd)"
[[ -n "${ADO_MCP_PKG:-}" || -s "$here/ado-mcp.version" ]] \
  || { echo "missing scripts/ado-mcp.version (npm view @azure-devops/mcp version > scripts/ado-mcp.version)" >&2; exit 2; }
ado_pkg="${ADO_MCP_PKG:-@azure-devops/mcp@$(tr -d '[:space:]' < "$here/ado-mcp.version")}"

out_dir="${1:-digests}"
out="$out_dir/$(date +%F).md"
mkdir -p "$out_dir"

if [[ -s "$out" && "${FORCE:-0}" != "1" ]]; then
  echo "exists: $out (FORCE=1 to regenerate)" >&2
  exit 0
fi

mcp_cfg="$(mktemp)"; tmp="$out.tmp"; workdir="$(mktemp -d)"
trap 'rm -rf "$mcp_cfg" "$tmp" "$workdir"' EXIT

jq -n --arg pkg "$ado_pkg" --arg org "$ADO_ORG" --arg auth "$ADO_AUTH" '{
  mcpServers: { ado: {
    command: "npx",
    args: ["-y", $pkg, $org, "--authentication", $auth, "-d", "core", "work", "work-items"]
  } }
}' > "$mcp_cfg"

read -r -d '' PROMPT <<EOF || true
Project: ${ADO_PROJECT}. Using ONLY the ado MCP tools available to you (read-only),
write a Markdown digest of the current sprint backlog with exactly these sections:

# Digest ${ADO_PROJECT} $(date +%F)
## En curso   (state Active/Doing: "#ID title - assignee")
## Estancadas (no change in the last 7 days: "#ID title - days idle")
## Sin criterios de aceptación (cards whose description lacks acceptance criteria)
## Tres para refinar hoy (pick 3, one line of reasoning each)

Rules: every item cites its work item ID as #ID. Never invent items. If a tool call fails,
write "NO SE PUDO LEER: <reason>" in that section instead of guessing. Output only the Markdown.
EOF

# `|| true`: a failed run must reach assert_ok, which prints the reason; otherwise set -e exits silently.
env_json="$(cd "$workdir" && run_claude "$PROMPT" \
  --mcp-config "$mcp_cfg" --strict-mcp-config \
  --allowedTools "mcp__ado__wit_backlog,mcp__ado__wit_query,mcp__ado__wit_work_item,mcp__ado__core_list_projects")" || true

assert_ok "$env_json"
log_cost "$env_json"
jq -r '.result' <<<"$env_json" > "$tmp"

# Independent verification: shape of the output, checked with code, not with the model.
grep -q '^# Digest ' "$tmp" || { echo "digest has no title; refusing to write" >&2; exit 1; }
grep -q '^## Tres para refinar' "$tmp" || { echo "digest is incomplete; refusing to write" >&2; exit 1; }
mv "$tmp" "$out"
echo "wrote $out"