# Brújula

**English** · [Español](README.es.md)

A team assistant for [Claude Code](https://claude.com/claude-code) that works with Azure DevOps.
It helps make sure work is well defined before it starts and well reviewed before it ships,
without leaving Claude and without having to learn commands.

The plugin is downloaded from this GitHub repository and works against your own Azure DevOps
organization. It runs on Windows (`cmd` or PowerShell), WSL and Linux.

## What it does

**For whoever manages the work (PM)**

- Turns a rough idea into a clear work item: outcome, why, what changes and how to tell it is
  done. A format checker validates it.
- Builds a full backlog for a topic (one Feature with its stories) and publishes it to Azure Boards.
- Splits a story into one-day tasks.

**For the tech lead**

- Judges whether a work item is ready to implement and says what is missing.
- Records architecture decisions (ADRs).

**For developers**

- Sets up any repository without leaving a trace in it.
- Starts a work item: quotes its criteria, proposes the branch, runs the baseline tests and
  plans one test per criterion.
- Prepares the commit and, when the project uses them, the pull request linked to the work item.
- Reviews code before it is pushed and explains unfamiliar parts of the codebase.

**In the background**

- Will not let a change finish with failing tests.
- Blocks secrets, sensitive files (`.env`, lockfiles, configuration) and dangerous commands
  (`rm -r`, `git push --force`, pushing to `main` in projects that use pull requests).
- **Always asks for confirmation** before writing to Azure Boards or to a pull request.

> Work items and messages are written in Spanish: the team that uses it works in Spanish.

## How it works

Brújula is a Claude Code plugin made of four pieces:

| Piece       | What it is                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Skills      | Guided flows Claude follows: `tarjeta`, `backlog`, `publicar`, `empezar`, `pr-prep`, `bienvenida`, `doctor`…                        |
| Agents      | Read-only specialists: `refinador` (judges work items), `revisor` (reviews code), `explorer` (maps the repository)                  |
| Hooks       | Automatic guards that run before and after each Claude action                                                                       |
| MCP servers | `ado`, Microsoft's official Azure DevOps server, and `brujula`, with the project's own tools (conventions, ADRs, work item checker) |

On the first session Claude welcomes you and guides you. After that, ask in your own words
("create a card for…", "build a backlog about…") or use the command (`/brujula:tarjeta`).

## Installation

Requirements: Node.js 22 or later, Git (on Windows, Git for Windows) and Claude Code with your
session started.

    claude plugin marketplace add Alexis86Sevilla/brujula
    claude plugin install brujula@brujula-equipo

When you open `claude`, it asks for your Azure DevOps organization (the name in
`https://dev.azure.com/<organization>`) and the sign-in method (keep the browser). If it does not
ask, type `/plugin configure brujula@brujula-equipo`. If something fails, run `/brujula:doctor`.

Step-by-step installation, updates and troubleshooting: [ONBOARDING.md](ONBOARDING.md) (Spanish).
What to use for each task: [docs/USO.md](docs/USO.md) (Spanish).

## Development

Node 22 and TypeScript (ESM), tested with vitest and validated with zod.

    npm install
    npm run check         # typecheck, lint, format and tests
    npm run check:plugin  # also validates the built plugin

Architecture decisions live in `docs/adr/`; conventions in `CLAUDE.md` and `.claude/rules/`.

The `secret-scan` hook blocks commits that add secrets. To skip it for one session (a human
decision, after confirming a false positive), start with `BRUJULA_ALLOW_SECRETS=1 claude`.
