# Work item quality standard (Brújula)

A card is ready when someone who did not write it can implement and verify it without asking.
Say each thing once: the title already states the outcome, so no user story that repeats it; the
criteria already say when it is done, so no definition of done that repeats them. Keep every
operational detail (variable names, commands, rollback, how to verify); cut only repetition.

| Section | Rule |
|---|---|
| Title (H1) | An outcome, not a task. Bad: "Implement search endpoint". Good: "Teammates find a wiki page by asking a question". 8-100 characters. |
| `## Por qué` (required) | 2-3 lines, at most 4: the problem, who suffers it, why now. Links only if they exist. |
| `## Qué cambia` (required) | The scope: what changes and where (services, files, variables). Tables and lists are welcome. |
| `## Cómo` (optional) | Short numbered steps, only when there is an operation to run (deploy, migration, rotation). Include the rollback. |
| `## Hecho cuando` (required) | 2-6 checkable items: **Dado** ... **cuando** ... **entonces** ..., or a verifiable list (`- [ ]`). At least one error or edge case. Observable behaviour, concrete values. |
| `## Riesgo` (optional) | Only real risks, each one with "mitigación: ...". Omit the section when there are none. |
| Footer line (required) | One line: `**Fuera de alcance:** ... · **Estimación:** ... · **Dependencias:** ...`. Size XS, S, M, L, XL (or 1, 2, 3, 5, 8, 13); L/XL means "split it first". "ninguna" is a valid dependency. |

Unknown facts go in an extra `## Preguntas abiertas` section, after the footer line.
The old headings (Historia, Contexto, Criterios de aceptación, Definición de hecho, Fuera de alcance,
Estimación, Dependencias as sections) are rejected by the checker.

INVEST check before finishing: Independent, Negotiable, Valuable, Estimable, Small, Testable.
If a card fails Small or Testable, split it or sharpen "Hecho cuando".
