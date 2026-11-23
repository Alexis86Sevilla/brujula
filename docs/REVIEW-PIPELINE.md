# Review pipeline

Who verifies what, when, and what stops the work.
Every `Where it lives` cell points to a real file or command; `test/docs/review-pipeline.test.ts` checks it.
Rows marked `(M9)` depend on pipelines built in module 9 and are skipped by that test until then.

| # | Layer | Owner | When | Blocks if | Where it lives |
|---|-------|-------|------|-----------|----------------|
| 0 | Permissions, sandbox, protected paths, dangerous Bash, secrets in commits | Claude Code and hooks (deterministic) | Every tool call | A `deny` matches, or a hook exits 2 | `.claude/settings.json`, `plugin/scripts/protect-paths.sh`, `plugin/scripts/guard-bash.sh`, `plugin/scripts/secret-scan.sh` |
| 1 | Format after each edit; typecheck and tests when the turn ends | Hooks (deterministic) | PostToolUse on Edit/Write (format); Stop event (gate) | Typecheck or tests fail | `plugin/scripts/format-file.sh`, `plugin/scripts/quality-gate.sh` |
| 2 | Tests do not move while implementing | Author | GREEN phase of TDD | A test file changed since the RED commit | `scripts/test-guard.sh` |
| 3 | Independent verifier against the card | `verificador` (clean context) | Before the PR | A criterion FAILs, or is UNCOVERED and nobody decides | `.claude/agents/verificador.md`, `/verificar docs/cards/<card>.md` |
| 4 | Diff review and security review | `/code-review`, `/security-review`, Gentle AI RDD when due | Before the PR | A finding is real and not fixed (RDD never blocks) | `/code-review high`, `/security-review` |
| 5 | CI and automatic PR review | Azure Pipelines | PR opened or updated | Build validation fails; the review only comments | `pipelines/ci.yml`, `pipelines/pr-review.yml` (M9) |
| 6 | Human review | A teammate | PR | Required reviewer has not approved | Azure Repos branch policy |

## Rules

1. Layers 0-2 are deterministic and always on.
2. Layers 3-5 give findings, not approvals: a person decides what to do with each one.
3. Nothing here replaces layer 6. When a layer misses a real bug, add the test that would have caught it, not another layer.
