#!/usr/bin/env bash
# Fake claude: consumes stdin and prints a canned JSON envelope. Never calls the network.
#   FAKE_CLAUDE_COUNTER=<file>  append one line per call (to prove a run made no calls)
#   FAKE_CLAUDE_CARD=<file>     when invoked with --agent (card refiner), return this file as the card
[[ -n "${FAKE_CLAUDE_COUNTER:-}" ]] && echo "call" >> "$FAKE_CLAUDE_COUNTER"
cat >/dev/null

for arg in "$@"; do
  if [[ "$arg" == "--agent" ]]; then
    jq -n --rawfile card "${FAKE_CLAUDE_CARD:?set FAKE_CLAUDE_CARD}" \
      '{is_error: false, result: "", total_cost_usd: 0, num_turns: 1, structured_output: {card: $card}}'
    exit 0
  fi
done

cat <<'JSON'
{"is_error":false,"result":"","total_cost_usd":0,"num_turns":1,
 "structured_output":{"title_is_outcome":true,"criteria_are_testable":true,"issues":[]}}
JSON
