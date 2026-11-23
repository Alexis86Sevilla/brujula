---
name: pr-prep
description: Prepares a Conventional Commit message for the current branch from its diff, linking the Azure Boards work item, plus a pull request description when the project uses pull requests or the local merge commands when it does not. Run it yourself with /brujula:pr-prep before committing, opening a pull request or merging.
argument-hint: [work-item-id]
arguments: [item]
disable-model-invocation: true
allowed-tools: Read Bash(bash *scripts/context.sh*) Bash(git diff *) Bash(git log *) Bash(git status *)
---

## Branch context

!`bash "${CLAUDE_SKILL_DIR}/scripts/context.sh"`

## Task

Work item: use "$item" if it is not empty, otherwise the `work-item:` line above.
If there is none, ask for it once.

Pull requests: read the `pull-requests:` line above. If it is `unset` or `invalid`, ask once
"¿Este proyecto usa pull requests?", offer to write `.claude/brujula.json` with
`{ "pullRequests": true }` or `{ "pullRequests": false }` (the team shares it, so it goes in git),
and continue with the answer.

1. Read the changes: `git diff --cached` if something is staged, otherwise `git diff <base>...HEAD`
   with the base shown above. Open only the files you need to understand the intent.
2. Propose the commit message in Conventional Commits: `type(scope): subject`, imperative, at most
   72 characters, with a body that explains why, not what. If the diff mixes unrelated concerns,
   propose a split as a list of files per commit instead. No attribution or "Co-Authored-By" lines.
3. If the project uses pull requests, write the pull request description in Spanish with these
   sections: `## Qué cambia`, `## Por qué`, `## Cómo se ha probado` (only commands that appear in
   the diff or that you ran; never invent results), `## Riesgos`. The last line must be
   `Work item: #<id>` (the Azure Repos syntax that links the work item).
   If it does not, write no pull request description: propose the local merge instead,
   `git switch <base> && git merge --no-ff <branch> -m "merge: <subject>"` and then
   `git push origin <base>`, with `<base>` without the `origin/` prefix, and put the
   `Work item: #<id>` line in the commit body.
   When the branch above is the base itself (`branch: main` and `base: origin/main`, for example):
   without pull requests there is nothing to merge, so propose only the commit and
   `git push origin <base>`; with pull requests, propose first moving the work to a new branch
   (`git switch -c <type>/<id>-<slug>`), because the push to the base is blocked.
4. Do not run `git commit`, `git merge` or `git push`. End by asking which proposal I want to use.