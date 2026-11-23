#!/usr/bin/env bash
# Usage: scripts/ado-pr-comment.sh [review-dir]      post the review (incremental, idempotent)
#        scripts/ado-pr-comment.sh --last-reviewed   print the last reviewed commit sha (or nothing)
# Posting:
#   - Idempotent per source commit: a hidden marker <!-- brujula-review:<sha> --> is checked first.
#   - The summary goes as a new comment in the existing summary thread (one conversation per PR);
#     the first review opens that thread.
#   - Up to 5 inline threads, each with a hidden key (path + evidence). A finding whose key already has
#     an open thread is not posted again. An open finding thread whose evidence is no longer in the
#     file at the source commit is set to "fixed". Run it from the repository checkout.
# Env (set by Azure Pipelines): SYSTEM_COLLECTIONURI, SYSTEM_TEAMPROJECTID, BUILD_REPOSITORY_ID,
#   SYSTEM_PULLREQUEST_PULLREQUESTID, SYSTEM_PULLREQUEST_SOURCECOMMITID, SYSTEM_ACCESSTOKEN
set -euo pipefail
set +x   # never trace: the token travels in a header

: "${SYSTEM_ACCESSTOKEN:?map System.AccessToken into the step env}"
: "${SYSTEM_PULLREQUEST_PULLREQUESTID:?not a PR build (is the build triggered by a branch policy?)}"

base="${SYSTEM_COLLECTIONURI}${SYSTEM_TEAMPROJECTID}/_apis/git/repositories/${BUILD_REPOSITORY_ID}/pullRequests/${SYSTEM_PULLREQUEST_PULLREQUESTID}/threads"
api="api-version=7.1"
sha="${SYSTEM_PULLREQUEST_SOURCECOMMITID:-}"

call() {
  curl -sS --fail-with-body \
    -H "Authorization: Bearer ${SYSTEM_ACCESSTOKEN}" \
    -H "Content-Type: application/json" "$@"
}

threads="$(call "${base}?${api}")"

if [[ "${1:-}" == "--last-reviewed" ]]; then
  jq -r '[.value[]?.comments[]?
          | select((.content // "") | test("brujula-review:[0-9a-f]+"))
          | {d: (.publishedDate // ""), s: ((.content | capture("brujula-review:(?<s>[0-9a-f]+)")).s)}]
         | sort_by(.d) | last | .s // empty' <<<"$threads"
  exit 0
fi

: "${sha:?SYSTEM_PULLREQUEST_SOURCECOMMITID is required to post}"
dir="${1:-review-out}"
marker="<!-- brujula-review:${sha} -->"

if jq -e --arg m "$marker" 'any(.value[]?.comments[]?; (.content // "") | contains($m))' >/dev/null <<<"$threads"; then
  echo "already reviewed ${sha}; nothing to post"
  exit 0
fi
[ -s "${dir}/review.json" ] || { echo "no review.json; nothing to post"; exit 0; }

# Commit whose files decide whether an old finding is still there.
ref="HEAD"
git cat-file -e "${sha}^{commit}" 2>/dev/null && ref="$sha"

# --- 1. Resolve open finding threads whose evidence disappeared ---
jq -c '.value[]? | select(.status == "active" or .status == "pending")
       | {id, key: ([.comments[]?.content // "" | capture("brujula-finding:(?<k>[A-Za-z0-9+/=]+)").k] | first)}
       | select(.key != null)' <<<"$threads" | while read -r t; do
  id="$(jq -r .id <<<"$t")"
  key="$(jq -r '.key | @base64d' <<<"$t")"
  path="$(jq -r .path <<<"$key")"; evidence="$(jq -r .evidence <<<"$key")"
  if git show "${ref}:${path}" 2>/dev/null | grep -qF -- "$evidence"; then
    continue
  fi
  jq -n '{status: "fixed"}' | call -X PATCH "${base}/${id}?${api}" --data @- >/dev/null \
    && echo "fixed thread ${id} (${path}: evidence no longer present)" \
    || echo "warn: could not mark thread ${id} as fixed" >&2
done

# --- 2. Summary: reply in the existing summary thread, or open it ---
blockers="$(jq '[.findings[] | select(.severity == "blocker")] | length' "${dir}/review.json")"
status="closed"; (( blockers > 0 )) && status="active"
content="${marker}"$'\n'"$(cat "${dir}/review.md")"
summary_id="$(jq -r '[.value[]? | select(any(.comments[]?; (.content // "") | contains("brujula-review:"))) | .id] | max // empty' <<<"$threads")"

if [[ -n "$summary_id" ]]; then
  jq -n --arg c "$content" '{parentCommentId: 1, content: $c, commentType: 1}' \
    | call -X POST "${base}/${summary_id}/comments?${api}" --data @- >/dev/null
  jq -n --arg s "$status" '{status: $s}' | call -X PATCH "${base}/${summary_id}?${api}" --data @- >/dev/null
  echo "summary added to thread ${summary_id} (status ${status})"
else
  jq -n --arg c "$content" --arg s "$status" \
    '{comments: [{parentCommentId: 0, content: $c, commentType: 1}], status: $s}' \
    | call -X POST "${base}?${api}" --data @- | jq '{summary_thread: .id, status}'
fi

# --- 3. Inline threads: best effort, never duplicated ---
open_keys="$(jq -c '[.value[]? | select(.status == "active" or .status == "pending")
                     | .comments[]?.content // "" | capture("brujula-finding:(?<k>[A-Za-z0-9+/=]+)").k]' <<<"$threads")"

jq -c '[.findings[] | select(.severity != "minor")][:5][]
       | . + {key: ({path, evidence} | tojson | @base64)}' "${dir}/review.json" | while read -r f; do
  if jq -e --argjson keys "$open_keys" '.key as $k | $keys | index($k)' >/dev/null <<<"$f"; then
    echo "skip duplicate finding $(jq -r '.path + ":" + (.line|tostring)' <<<"$f")"
    continue
  fi
  jq -n --argjson f "$f" '{
      comments: [{parentCommentId: 0, commentType: 1,
                  content: "<!-- brujula-finding:\($f.key) -->\n**\($f.severity)**: \($f.problem)\n\nArreglo: \($f.fix)"}],
      status: "active",
      threadContext: {filePath: ("/" + $f.path),
                      rightFileStart: {line: $f.line, offset: 1},
                      rightFileEnd: {line: $f.line, offset: 2}}}' \
    | call -X POST "${base}?${api}" --data @- >/dev/null \
    || echo "warn: inline thread failed for $(jq -r '.path + ":" + (.line|tostring)' <<<"$f") (kept in summary)" >&2
done
