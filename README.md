# Brújula

Team assistant for Claude Code on Azure DevOps: well-defined work cards, backlog publishing in
Azure Boards, and help for programmers to start, prepare and review their work. It ships as the
`brujula` plugin (folder `plugin/`) through the `brujula-equipo` marketplace.

- Install it: [ONBOARDING.md](ONBOARDING.md) (in Spanish).
- Use it: [docs/USO.md](docs/USO.md) (in Spanish).

## Developing the plugin

Node 22 + TypeScript (ESM). Install dependencies with `npm install` and run every check
(typecheck, lint, format, tests) with `npm run check`; `npm run check:plugin` also validates the
plugin. Decisions are in `docs/adr/`, conventions in `CLAUDE.md` and `.claude/rules/`.

The `secret-scan` hook blocks agent commits that add secrets. To bypass it for one session (a
human decision, after checking it is a false positive), launch `BRUJULA_ALLOW_SECRETS=1 claude`.
