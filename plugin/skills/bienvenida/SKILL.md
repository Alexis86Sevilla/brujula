---
name: bienvenida
description: Welcomes a person to Brújula and guides their first steps in plain language - checks that the installation works (running the checks itself and explaining the result), asks what they do in THIS project (one or several roles; it can differ per project) and offers one first useful thing to try. Use on the first session (the session context asks for it) or when someone asks how to start with Brújula, what it does or how to use it. Assume the person may not know what a terminal or a command is.
when_to_use: Spanish requests such as "ayúdame a empezar con Brújula", "qué es Brújula", "qué puedo hacer con Brújula", "cómo se usa esto", "soy nuevo", "por dónde empiezo".
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs *)
---

Talk in Spanish, warm and plain. The person may be a PM who has never used a terminal: no jargon
(no "repo", "hook", "MCP", "JSON", "scope"), no commands for them to type unless a step truly needs
it, and then one at a time, saying where to type it. Short messages; one question at a time, then
stop and wait.

## 1. Hello

In three short lines: Brújula is the team's assistant inside Claude; it helps to write clear work
cards and publish them in Azure Boards, and helps programmers prepare and review their work; it
always asks before changing anything in Azure Boards.

## 2. Check the installation (you do it, not them)

Run, without asking:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs "${CLAUDE_PLUGIN_ROOT}" "${CLAUDE_PLUGIN_DATA}" '--ado-org=${user_config.ado_org}'
```

It prints a JSON list of checks `{ name, ok, detail, fix, skipped? }`. Never show the JSON. Only the
installation matters here: ignore the `pull-requests` check (a project setting that
`/brujula:configurar` handles later). Say "Todo está bien instalado" when every other check is ok
(a skipped check is fine; do not mention it).
A failing `ado-org` comes first: without the organization nothing in Azure Boards works. Tell
them to type `/plugin configure brujula@brujula-equipo` in this chat, fill in the organization (the
name in https://dev.azure.com/<organization>) and restart Claude.
For a failing check, explain the problem in one plain sentence and offer to fix it; if the fix is a
command only they can run (git credentials, for example), tell them exactly what to copy and where
(the terminal of their computer, or typed in this chat starting with `!`), one step at a time.

If `ado-org` fails but Azure DevOps tools (`mcp__plugin_brujula_ado__*`) are available in this
session, the organization is set and only the value did not reach the command: ignore that check.

## 3. What they do here

Ask: "¿Qué haces en este proyecto? Puedes elegir más de una: gestionar el trabajo (PM), programar,
liderar al equipo técnico (tech lead)." Say that it can be different in another project and that
you will ask again there if needed. Do not store the answer.

## 4. One first thing to try

Offer only what matches their answer, and at most two options; do it with them if they say yes:

- **PM**: turn an idea into a well-defined card. Ask for the idea in their own words and use the
  `brujula:tarjeta` skill. Mention that for a whole topic with several cards they can just say
  "créame un backlog sobre …".
- **Programmer**: prepare this project once (it changes nothing that others see). It needs one
  thing typed by them: `/brujula:configurar`. Then, to start a card: `/brujula:empezar <número>`.
- **Tech lead**: check whether a card is ready to be implemented: ask for its number in Azure
  Boards and give it to the `refinador` agent (it takes a number or a card file, not pasted text).
  Also the PM option for writing cards.

If the folder is not a code project (no git repository), skip the programmer option and say
that it is for when they open Claude inside a project's code.

## 5. Close

One line: they can always say "ayúdame a empezar con Brújula" to see this again, or ask in their
own words what they need. The full guide is `docs/USO.md` in the Brújula repository (mention it
only if they ask for documentation).
