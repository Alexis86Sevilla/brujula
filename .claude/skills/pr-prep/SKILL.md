---
name: pr-prep
description: Prepares a Conventional Commit message and a pull request description for the current branch from its diff, linking the Azure Boards work item. Run it yourself with /pr-prep before committing or opening a pull request.
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

1. Read the changes: `git diff --cached` if something is staged, otherwise `git diff <base>...HEAD`
   with the base shown above. Open only the files you need to understand the intent.
2. Propose the commit message in Conventional Commits: `type(scope): subject`, imperative, at most
   72 characters, with a body that explains why, not what. If the diff mixes unrelated concerns,
   propose a split as a list of files per commit instead. No attribution or "Co-Authored-By" lines.
3. Write the pull request description in Spanish with these sections: `## Qué cambia`,
   `## Por qué`, `## Cómo se ha probado` (only commands that appear in the diff or that you ran;
   never invent results), `## Riesgos`. The last line must be `Work item: #<id>`
   (the Azure Repos syntax that links the work item).
4. Do not run `git commit` or `git push`. End by asking which proposal I want to use.