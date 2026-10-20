#!/usr/bin/env bash
# Fails if CLAUDE.md cites a missing npm script or grows past 200 lines.
set -euo pipefail

file="${1:-CLAUDE.md}"
fail=0

while read -r script; do
  [ -z "$script" ] && continue
  if ! jq -e --arg s "$script" '.scripts[$s]' package.json >/dev/null; then
    echo "FAIL: $file cites 'npm run $script' but package.json has no such script" >&2
    fail=1
  fi
done < <(grep -oE 'npm run [a-zA-Z0-9:_-]+' "$file" | awk '{print $3}' | sort -u)

lines=$(wc -l < "$file")
if [ "$lines" -ge 200 ]; then
  echo "FAIL: $file has $lines lines (target: under 200)" >&2
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "ok: $file ($lines lines)"
fi
exit "$fail"