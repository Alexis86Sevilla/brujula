---
name: tarjeta
description: Turns a rough idea into a short, fully defined Azure Boards work item written in markdown (outcome title, why, what changes, optional steps, 2-6 checkable done-when criteria, optional risk, and a footer line with out of scope, estimate and dependencies) and validates it with a checker script. Use when the user asks to write, define, refine or prepare ONE card, ticket, work item, user story or PBI from an idea, a bug report or a conversation; for several cards about a topic use the backlog skill.
when_to_use: Spanish requests such as "crea una tarjeta", "redacta esta historia de usuario", "define este PBI", "prepárame el ticket", "convierte esto en una tarjeta bien definida", "escribe los criterios de aceptación de esta idea".
argument-hint: [rough idea]
allowed-tools: Read Glob Write Bash(node *check-card.mjs*)
---

# Tarjeta

Rough idea received: $ARGUMENTS

## Procedure

1. If the idea above is empty, ask for it in one sentence and stop.
2. Read [reference/estandar.md](reference/estandar.md) (the quality standard) and the example
   [templates/card.md](templates/card.md). The example is illustrative: never copy its facts.
3. Ask at most three clarifying questions, in a single message, and only about what is missing:
   who benefits, why now, how success will be observed. If the idea is already clear, skip this step.
4. Write the card in Spanish to `<dir>/<slug>.md` (`<slug>` is kebab-case from the title) using
   the headings of the template. `<dir>` is `docs/cards` when that folder already exists in the
   current project (the team keeps its cards there); otherwise `${CLAUDE_PLUGIN_DATA}/cards`, so no
   file is left in a repository that is not yours or in a folder that is not a project. Drop `## Cómo` when there is no operation to run and `## Riesgo`
   when there is no real risk. Say each thing once, but keep every operational detail.
5. Run `node ${CLAUDE_SKILL_DIR}/scripts/check-card.mjs <dir>/<slug>.md`.
   Exit code 1 means the card is invalid: fix every listed error and run it again.
   Try at most three times; if it still fails, show the remaining errors to the user.
6. Never invent facts: links, ADR numbers, people, dates, metrics. If you do not know something,
   add it to an extra section `## Preguntas abiertas` instead of guessing.
7. Reply with the card itself (its full markdown, so the user reads it without opening a file), then
   one line with the checker result, the open questions if any, and one line saying where it was
   saved and that `/brujula:tarjeta-a-boards <path>` publishes it in Azure Boards after a yes.