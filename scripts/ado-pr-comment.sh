#!/usr/bin/env bash
# Usage: scripts/ado-pr-comment.sh [review-dir]      post the review (incremental, idempotent)
#        scripts/ado-pr-comment.sh --last-reviewed   print the last reviewed commit sha (or nothing)
# Trust:
#   - Only comments written by the job identity itself (connectionData) count, and only markers at
#     the start of a comment line. Deleted comments are ignored.
#   - Model text (summary, problems, fixes, paths) is sanitized before posting: it can never contain
#     an HTML comment (so it cannot forge a marker) nor an Azure Pipelines logging command (##vso).
# Posting:
#   - Inline threads first (up to 5 NEW findings), then the summary. The summary carries the marker
#     <!-- brujula-review:<sha> --> only when the review is complete (not failed, not truncated):
#     otherwise the next run reviews that commit again.
#   - One summary thread per PR (marked <!-- brujula-summary -->). New blockers reopen it; it is never
#     closed automatically.
#   - Every inline thread carries <!-- brujula-seen:<key> --> (key = path + evidence) so it is never
#     posted twice while its thread is not "fixed". When the evidence is in the file it also carries
#     <!-- brujula-finding:<key> -->, and the thread is set to "fixed" once the evidence disappears from
#     the file at the source commit. Run it from the repository checkout.
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
# Neutralize model text: no HTML comments (marker forgery), no logging commands in our own log.
sanitize() { sed -e 's/<!--/< !--/g' -e 's/-->/-- >/g' -e 's/##vso\[/# #vso[/g'; }
# Marker regexes: anchored at the start of a line of the comment.
RE_REVIEW='(^|\n)<!-- brujula-review:(?<s>[0-9a-f]{7,40}) -->'
RE_KEY='(^|\n)<!-- brujula-(finding|seen):(?<k>[A-Za-z0-9+/=]+) -->'

me="$(call "${SYSTEM_COLLECTIONURI}_apis/connectionData" | jq -r '.authenticatedUser.id // empty')"
[[ -n "$me" ]] || { echo "cannot resolve the job identity (connectionData)" >&2; exit 2; }

# Keep only live comments written by the job identity.
threads="$(call "${base}?${api}" | jq --arg me "$me" '
  .value |= map(.comments |= map(select(.author.id == $me and (.isDeleted // false) == false)))')"

if [[ "${1:-}" == "--last-reviewed" ]]; then
  jq -r --arg re "$RE_REVIEW" '[.value[]?.comments[]?
          | select((.content // "") | test($re))
          | {d: (.publishedDate // ""), s: ((.content | capture($re)).s)}]
         | sort_by(.d) | last | .s // empty' <<<"$threads"
  exit 0
fi

: "${sha:?SYSTEM_PULLREQUEST_SOURCECOMMITID is required to post}"
dir="${1:-review-out}"

if jq -e --arg re "$RE_REVIEW" --arg sha "$sha" \
     'any(.value[]?.comments[]?; (.content // "") | test($re) and (capture($re).s == $sha))' >/dev/null <<<"$threads"; then
  echo "already reviewed ${sha}; nothing to post"
  exit 0
fi
[ -s "${dir}/review.json" ] || { echo "no review.json; nothing to post"; exit 0; }

# Commit whose files decide whether a finding's evidence is (still) there.
ref="HEAD"
git cat-file -e "${sha}^{commit}" 2>/dev/null && ref="$sha"
# evidence_present <path> <evidence>: the WHOLE evidence (it may span lines) is a substring of the file.
evidence_present() {
  local text evidence="$2"
  [[ -n "${evidence//[[:space:]]/}" ]] || return 1
  text="$(git show "${ref}:$1" 2>/dev/null)" || return 1
  [[ "$text" == *"$evidence"* ]]
}

# --- 1. Resolve our open finding threads whose evidence disappeared ---
jq -c --arg re "$RE_KEY" '.value[]? | select(.status == "active" or .status == "pending")
       | {id, key: ([.comments[]?.content // "" | select(test($re)) | capture($re) | select(.k) | .k] | first)}
       | select(.key != null)' <<<"$threads" | while read -r t; do
  id="$(jq -r .id <<<"$t")"
  key="$(jq -r '.key | @base64d' <<<"$t" 2>/dev/null)" || continue
  path="$(jq -r '.path // empty' <<<"$key" 2>/dev/null)" || continue
  evidence="$(jq -r '.evidence // empty' <<<"$key")"
  # Only finding threads (evidence was in the file when posted) are auto-resolved.
  jq -e --arg id "$id" --arg k "$(jq -r .key <<<"$t")" \
    '.value[] | select((.id|tostring) == $id) | any(.comments[]?; .content | contains("<!-- brujula-finding:" + $k + " -->"))' \
    >/dev/null <<<"$threads" || continue
  evidence_present "$path" "$evidence" && continue
  if jq -n '{status: "fixed"}' | call -X PATCH "${base}/${id}?${api}" --data @- >/dev/null; then
    echo "fixed thread ${id} ($(sanitize <<<"$path"): evidence no longer present)"
  else
    echo "warn: could not mark thread ${id} as fixed" >&2
  fi
done

# --- 2. Inline threads: new findings only, never duplicated (any status but "fixed") ---
known_keys="$(jq -c --arg re "$RE_KEY" '[.value[]? | select(.status != "fixed")
                     | .comments[]?.content // "" | select(test($re)) | [match($re; "g").captures[] | select(.name == "k") | .string][]]
                    | unique' <<<"$threads")"

jq -c --argjson known "$known_keys" '[.findings[] | select(.severity != "minor")
       | . + {key: ({path, evidence} | tojson | @base64)}
       | select(.key as $k | $known | index($k) | not)][:5][]' "${dir}/review.json" | while read -r f; do
  key="$(jq -r .key <<<"$f")"
  tag="<!-- brujula-seen:${key} -->"$'\n'
  if evidence_present "$(jq -r .path <<<"$f")" "$(jq -r .evidence <<<"$f")"; then
    tag+="<!-- brujula-finding:${key} -->"$'\n'
  fi
  body="$(jq -r '"**\(.severity)**: \(.problem)\n\nArreglo: \(.fix)"' <<<"$f" | sanitize)"
  where="$(jq -r '.path + ":" + (.line|tostring)' <<<"$f" | sanitize)"
  jq -n --argjson f "$f" --arg c "${tag}${body}" '{
      comments: [{parentCommentId: 0, commentType: 1, content: $c}],
      status: "active",
      threadContext: {filePath: ("/" + $f.path),
                      rightFileStart: {line: $f.line, offset: 1},
                      rightFileEnd: {line: $f.line, offset: 2}}}' \
    | call -X POST "${base}?${api}" --data @- >/dev/null \
    || echo "warn: inline thread failed for ${where} (kept in summary)" >&2
done

# --- 3. Summary last: reply in our summary thread, or open it ---
complete="$(jq -r 'if (.failed // false) or (.truncated // false) then "false" else "true" end' "${dir}/review.json")"
stamp=""
[[ "$complete" == "true" ]] && stamp="<!-- brujula-review:${sha} -->"$'\n'
blockers="$(jq '[.findings[] | select(.severity == "blocker")] | length' "${dir}/review.json")"
content="${stamp}<!-- brujula-summary -->"$'\n'"$(sanitize < "${dir}/review.md")"
summary_id="$(jq -r '[.value[]? | select(any(.comments[]?; (.content // "") | test("(^|\n)<!-- brujula-summary -->"))) | .id] | max // empty' <<<"$threads")"

if [[ -n "$summary_id" ]]; then
  jq -n --arg c "$content" '{parentCommentId: 1, content: $c, commentType: 1}' \
    | call -X POST "${base}/${summary_id}/comments?${api}" --data @- >/dev/null
  if (( blockers > 0 )); then
    jq -n '{status: "active"}' | call -X PATCH "${base}/${summary_id}?${api}" --data @- >/dev/null \
      || echo "warn: could not reopen summary thread ${summary_id}" >&2
  fi
  echo "summary added to thread ${summary_id} (blockers: ${blockers}, complete: ${complete})"
else
  status="closed"; (( blockers > 0 )) && status="active"
  jq -n --arg c "$content" --arg s "$status" \
    '{comments: [{parentCommentId: 0, content: $c, commentType: 1}], status: $s}' \
    | call -X POST "${base}?${api}" --data @- | jq '{summary_thread: .id, status}'
fi
