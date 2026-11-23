#!/usr/bin/env bash
# Fake claude: ignores its arguments, consumes stdin, prints a canned JSON envelope.
cat >/dev/null
cat <<'JSON'
{"is_error":false,"result":"","total_cost_usd":0,"num_turns":1,
 "structured_output":{"title_is_outcome":true,"criteria_are_testable":true,"issues":[]}}
JSON