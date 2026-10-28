# brujula

Node 22 + TypeScript (ESM) project.

Install dependencies with `npm install`.
Run every check (typecheck, lint, format, tests) with `npm run check`.

The `secret-scan` hook blocks agent commits that add secrets. To bypass it for one session (a
human decision, after checking it is a false positive), launch `BRUJULA_ALLOW_SECRETS=1 claude`.
