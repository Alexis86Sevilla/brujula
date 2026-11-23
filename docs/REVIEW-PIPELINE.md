# Review pipeline

Who verifies what, when, and what stops the work.
Every `Where it lives` cell points to a real file or command; `test/docs/review-pipeline.test.ts` checks it.
Brújula has no CI pipeline: the checks run on each machine, and this repo pushes straight to `main`
(`.claude/brujula.json` says `"pullRequests": false`).

| # | Layer | Owner | When | Blocks if | Where it lives |
|---|-------|-------|------|-----------|----------------|
| 0 | Permissions, sandbox, protected paths, dangerous Bash, secrets in commits | Claude Code and hooks (deterministic) | Every tool call | A `deny` matches, or a hook exits 2 | `.claude/settings.json`, `plugin/scripts/protect-paths.sh`, `plugin/scripts/guard-bash.sh`, `plugin/scripts/secret-scan.sh` |
| 1 | Format after each edit; typecheck and tests when the turn ends | Hooks (deterministic) | PostToolUse on Edit/Write (format); Stop event (gate) | Typecheck or tests fail | `plugin/scripts/format-file.sh`, `plugin/scripts/quality-gate.sh` |
| 2 | Tests do not move while implementing | Author | GREEN phase of TDD | A test file changed since the RED commit | `scripts/test-guard.sh` |
| 3 | Independent verifier against the card | `verificador` (clean context) | Before pushing to `main` (or before the PR) | A criterion FAILs, or is UNCOVERED and nobody decides | `.claude/agents/verificador.md`, `/verificar docs/cards/<card>.md` |
| 4 | Diff review and security review | `revisor` agent, `/code-review`, `/security-review`, Gentle AI RDD when due | Before pushing to `main` (or before the PR) | A finding is real and not fixed (RDD never blocks) | `plugin/agents/revisor.md`, `/code-review high`, `/security-review` |
| 5 | Human review | A teammate | Only in projects that use pull requests | Required reviewer has not approved | `.claude/brujula.json` and the branch policy of that project |

## Rules

1. Layers 0-2 are deterministic and always on.
2. Layers 3-4 give findings, not approvals: a person decides what to do with each one.
3. Without pull requests, `npm run check` green and layers 3-4 are the last check before `main`.
   Nothing here replaces a human reviewer where the project has one. When a layer misses a real bug, add the test that would have caught it, not another layer.
