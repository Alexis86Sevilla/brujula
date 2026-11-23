#!/usr/bin/env bash
# Usage: scripts/ado-pr-comment.sh [review-dir]      post the review (incremental, idempotent)
#        scripts/ado-pr-comment.sh --last-reviewed   print the last reviewed commit sha (or nothing)
# Trust: only comments written by the job identity itself (connectionData) count. A marker typed by
# the PR author is ignored, so the PR cannot claim "already reviewed" or hide a finding.
# Posting:
#   - Idempotent per source commit: hidden marker <!-- brujula-review:<sha> --> in our own comments.
#     A failed review is posted WITHOUT the marker, so the next run reviews that commit again.
#   - The summary is a new comment in our existing summary thread (one conversation per PR). New
#     blockers reopen it; it is never closed automatically.
#   - Up to 5 inline threads. A finding whose evidence is in the file gets a hidden key
#     (path + evidence): it is not posted twice, and its thread is set to "fixed" once the evidence
#     disappears from the file at the source commit. Run it from the repository checkout.
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

me="$(call "${SYSTEM_COLLECTIONURI}_apis/connectionData" | jq -r '.authenticatedUser.id // empty')"
[[ -n "$me" ]] || { echo "cannot resolve the job identity (connectionData)" >&2; exit 2; }

# Keep only the comments written by the job identity.
threads="$(call "${base}?${api}" | jq --arg me "$me" '
  .value |= map(.comments |= map(select(.author.id == $me))) ')"

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

# Commit whose files decide whether a finding's evidence is (still) there.
ref="HEAD"
git cat-file -e "${sha}^{commit}" 2>/dev/null && ref="$sha"
# evidence_present <path> <evidence>: read the file first; grep -q on a pipe can flip under pipefail.
evidence_present() {
  local text
  text="$(git show "${ref}:$1" 2>/dev/null)" || return 1
  grep -qF -- "$2" <<<"$text"
}

# --- 1. Resolve our open finding threads whose evidence disappeared ---
jq -c '.value[]? | select(.status == "active" or .status == "pending")
       | {id, key: ([.comments[]?.content // "" | capture("brujula-finding:(?<k>[A-Za-z0-9+/=]+)").k] | first)}
       | select(.key != null)' <<<"$threads" | while read -r t; do
  id="$(jq -r .id <<<"$t")"
  key="$(jq -r '.key | @base64d' <<<"$t")"
  path="$(jq -r .path <<<"$key")"; evidence="$(jq -r .evidence <<<"$key")"
  evidence_present "$path" "$evidence" && continue
  if jq -n '{status: "fixed"}' | call -X PATCH "${base}/${id}?${api}" --data @- >/dev/null; then
    echo "fixed thread ${id} (${path}: evidence no longer present)"
  else
    echo "warn: could not mark thread ${id} as fixed" >&2
  fi
done

# --- 2. Summary: reply in our summary thread, or open it ---
failed="$(jq -r '.failed // false' "${dir}/review.json")"
stamp="${marker}"$'\n'
[[ "$failed" == "true" ]] && stamp=""   # do not advance the incremental base past an unreviewed commit
blockers="$(jq '[.findings[] | select(.severity == "blocker")] | length' "${dir}/review.json")"
content="${stamp}$(cat "${dir}/review.md")"
summary_id="$(jq -r '[.value[]? | select(any(.comments[]?; (.content // "") | contains("brujula-review:"))) | .id] | max // empty' <<<"$threads")"

if [[ -n "$summary_id" ]]; then
  jq -n --arg c "$content" '{parentCommentId: 1, content: $c, commentType: 1}' \
    | call -X POST "${base}/${summary_id}/comments?${api}" --data @- >/dev/null
  if (( blockers > 0 )); then
    jq -n '{status: "active"}' | call -X PATCH "${base}/${summary_id}?${api}" --data @- >/dev/null
  fi
  echo "summary added to thread ${summary_id} (blockers: ${blockers})"
else
  status="closed"; (( blockers > 0 )) && status="active"
  jq -n --arg c "$content" --arg s "$status" \
    '{comments: [{parentCommentId: 0, content: $c, commentType: 1}], status: $s}' \
    | call -X POST "${base}?${api}" --data @- | jq '{summary_thread: .id, status}'
fi

# --- 3. Inline threads: best effort, never duplicated ---
open_keys="$(jq -c '[.value[]? | select(.status == "active" or .status == "pending")
                     | .comments[]?.content // "" | capture("brujula-finding:(?<k>[A-Za-z0-9+/=]+)").k]' <<<"$threads")"

jq -c '[.findings[] | select(.severity != "minor")][:5][]
       | . + {key: ({path, evidence} | tojson | @base64)}' "${dir}/review.json" | while read -r f; do
  where="$(jq -r '.path + ":" + (.line|tostring)' <<<"$f")"
  if jq -e --argjson keys "$open_keys" '.key as $k | $keys | index($k)' >/dev/null <<<"$f"; then
    echo "skip duplicate finding ${where}"
    continue
  fi
  # Track (key) the finding only if its evidence is really in the file; otherwise the next run would
  # mark it "fixed" just because the model paraphrased the code.
  tag=""
  evidence_present "$(jq -r .path <<<"$f")" "$(jq -r .evidence <<<"$f")" \
    && tag="<!-- brujula-finding:$(jq -r .key <<<"$f") -->"$'\n'
  jq -n --argjson f "$f" --arg tag "$tag" '{
      comments: [{parentCommentId: 0, commentType: 1,
                  content: "\($tag)**\($f.severity)**: \($f.problem)\n\nArreglo: \($f.fix)"}],
      status: "active",
      threadContext: {filePath: ("/" + $f.path),
                      rightFileStart: {line: $f.line, offset: 1},
                      rightFileEnd: {line: $f.line, offset: 2}}}' \
    | call -X POST "${base}?${api}" --data @- >/dev/null \
    || echo "warn: inline thread failed for ${where} (kept in summary)" >&2
done
