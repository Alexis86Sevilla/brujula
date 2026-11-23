#!/usr/bin/env bash
# Usage: scripts/ado-pr-comment.sh [review-dir]
# Posts review.md as a PR thread and up to 5 inline threads. Idempotent per source commit.
# Env (set by Azure Pipelines): SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECTID, BUILD_REPOSITORY_ID,
#   SYSTEM_PULLREQUEST_PULLREQUESTID, SYSTEM_PULLREQUEST_SOURCECOMMITID, SYSTEM_ACCESSTOKEN
set -euo pipefail
set +x   # never trace: the token travels in a header

dir="${1:-review-out}"
: "${SYSTEM_ACCESSTOKEN:?map System.AccessToken into the step env}"
: "${SYSTEM_PULLREQUEST_PULLREQUESTID:?not a PR build (is the build triggered by a branch policy?)}"

base="${SYSTEM_COLLECTIONURI}${SYSTEM_TEAMPROJECTID}/_apis/git/repositories/${BUILD_REPOSITORY_ID}/pullRequests/${SYSTEM_PULLREQUEST_PULLREQUESTID}/threads"
api="api-version=7.1"
marker="<!-- brujula-review:${SYSTEM_PULLREQUEST_SOURCECOMMITID} -->"

call() {
  curl -sS --fail-with-body \
    -H "Authorization: Bearer ${SYSTEM_ACCESSTOKEN}" \
    -H "Content-Type: application/json" "$@"
}

# Idempotence: skip if a thread for this commit already exists.
if call "${base}?${api}" | jq -e --arg m "$marker" \
     'any(.value[]?.comments[]?; (.content // "") | contains($m))' >/dev/null; then
  echo "already reviewed ${SYSTEM_PULLREQUEST_SOURCECOMMITID}; nothing to post"
  exit 0
fi

[ -s "${dir}/review.json" ] || { echo "no review.json; nothing to post"; exit 0; }

blockers="$(jq '[.findings[] | select(.severity == "blocker")] | length' "${dir}/review.json")"
status="closed"; (( blockers > 0 )) && status="active"

jq -n --arg c "${marker}"$'\n'"$(cat "${dir}/review.md")" --arg s "$status" \
  '{comments: [{parentCommentId: 0, content: $c, commentType: 1}], status: $s}' \
  | call -X POST "${base}?${api}" --data @- | jq '{summary_thread: .id, status}'

# Inline threads: best effort. A failure here must not hide the summary that already posted.
jq -c '[.findings[] | select(.severity != "minor")][:5][]' "${dir}/review.json" | while read -r f; do
  jq -n --argjson f "$f" '{
      comments: [{parentCommentId: 0, commentType: 1,
                  content: "**\($f.severity)**: \($f.problem)\n\nArreglo: \($f.fix)"}],
      status: "active",
      threadContext: {filePath: ("/" + $f.path),
                      rightFileStart: {line: $f.line, offset: 1},
                      rightFileEnd: {line: $f.line, offset: 2}}}' \
    | call -X POST "${base}?${api}" --data @- >/dev/null \
    || echo "warn: inline thread failed for $(jq -r '.path + ":" + (.line|tostring)' <<<"$f") (kept in summary)" >&2
done
