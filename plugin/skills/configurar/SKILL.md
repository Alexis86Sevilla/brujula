---
name: configurar
description: Sets up the current repository for Brújula without leaving a trace in it - asks whether it uses pull requests, detects its test command, base branch and Azure DevOps project, writes the personal .claude/brujula.local.json (never versioned) and, if wanted, a CLAUDE.local.md with the repository's commands and conventions. Use when the user runs /brujula:configurar, usually the first time in a repository that is not theirs.
disable-model-invocation: true
allowed-tools: Read Glob Write Bash(bash *repo-info.sh*) Bash(bash *project-config.sh*) Bash(git log *) Bash(git branch *)
---

## Repository and current settings

!`bash "${CLAUDE_SKILL_DIR}/scripts/repo-info.sh"`

## Task

Talk to the user in Spanish. Goal: Brújula works in this repository and `git status` stays exactly
as it was. Work in these steps:

1. DETECT, reading only. Root build files decide the test command:
   `mvnw` -> `./mvnw -q test`; `pom.xml` -> `mvn -q test`; `gradlew` -> `./gradlew test`;
   `package.json` with a `test` script -> `npm test`; `pyproject.toml` or `pytest.ini` -> `pytest -q`;
   `go.mod` -> `go test ./...`; `*.sln` or `*.csproj` -> `dotnet test`. Lint command only if the
   repository clearly has one. Base branch: `default-branch` above. Azure DevOps
   project: the `<project>` of an origin URL `https://dev.azure.com/<org>/<project>/_git/<repo>`
   (URL-decoded). Read the repository's README or CONTRIBUTING for the real commands if they exist,
   and prefer them. Never invent a command: if unsure, leave it out and say so.
2. PROPOSE in one message: a table with `pullRequests`, `baseBranch`, `testCmd`, `lintCmd`,
   `adoProject` and where each value came from, plus the question "¿Este repositorio usa pull
   requests?". Stop and wait. The user may correct any value.
3. WRITE, after the answer: `.claude/brujula.local.json` in the main checkout (`main-checkout` above,
   so worktrees share it) with only the confirmed keys, for example
   `{ "pullRequests": true, "baseBranch": "main", "testCmd": "./mvnw -q test", "adoProject": "Fabrikam" }`.
   Offer also a `CLAUDE.local.md` with the exact test, lint and build commands, the branch naming
   and commit format seen in `git log --oneline -20` and `git branch -r`, and the folders not to
   touch. Write it only after "sí".
4. KEEP IT INVISIBLE. Writing inside `.git/` is blocked for you, so give the user this single
   command to run with `!` (only the files you wrote):
   `printf '%s\n' .claude/brujula.local.json CLAUDE.local.md >> "$(git rev-parse --git-common-dir)/info/exclude"`
5. CHECK: run the project settings command again and show its output; ask the user to confirm that
   `git status --short` shows nothing new. Mention that writes to Azure Boards and pull requests
   always ask for confirmation, in any repository.

Never edit versioned files of the repository, never commit, and never write `.claude/brujula.json`
(that one is shared: it is the team's decision).
