export interface CardSection {
  /** Stable kebab-case identifier, used in lint output. */
  id: string;
  /** Spanish heading used in cards (or the line label for the footer). */
  name: string;
  required: boolean;
  description: string;
  /** Extra headings (Spanish and English variants) accepted for this section; matching ignores case and accents. */
  aliases: string[];
}

/** The sections of a work item. Single source of truth for CARD_STANDARD and the linter. */
export const CARD_SECTIONS: readonly CardSection[] = [
  {
    id: "title",
    name: "Title",
    required: true,
    description: 'an outcome, not an activity ("Users can reset their password", not "Password work").',
    aliases: ["Título"],
  },
  {
    id: "why",
    name: "Por qué",
    required: true,
    description: "2-3 lines: the problem, who suffers it and why now.",
    aliases: ["Why"],
  },
  {
    id: "what-changes",
    name: "Qué cambia",
    required: true,
    description: "the scope, what changes and where; tables are welcome.",
    aliases: ["What changes", "Scope", "Alcance"],
  },
  {
    id: "how",
    name: "Cómo",
    required: false,
    description: "short steps, only when there is an operation to run; include how to roll back.",
    aliases: ["How", "Pasos"],
  },
  {
    id: "done-when",
    name: "Hecho cuando",
    required: true,
    description: "2-6 checkable criteria, Given/When/Then (Dado/Cuando/Entonces) or a verifiable list.",
    aliases: ["Done when"],
  },
  {
    id: "risk",
    name: "Riesgo",
    required: false,
    description: "only real risks, each one with its mitigation.",
    aliases: ["Riesgos", "Risk", "Risks"],
  },
  {
    id: "footer",
    name: "Footer line",
    required: true,
    description:
      '"**Fuera de alcance:** … · **Estimación:** … · **Dependencias:** …" (size XS-XL or 1-13; "ninguna" is valid).',
    aliases: [],
  },
];

/** Headings of the old heavy format (before v0.3.0), reported so cards do not drift back to it. */
export const LEGACY_SECTIONS: ReadonlyMap<string, string[]> = new Map([
  ["story", ["Historia", "Story", "Problema", "Historia o problema", "Problem statement"]],
  ["context", ["Contexto", "Context", "Contexto y enlaces"]],
  ["acceptance-criteria", ["Criterios de aceptación", "Acceptance criteria"]],
  ["out-of-scope", ["Fuera de alcance", "Out of scope"]],
  ["definition-of-done", ["Definición de hecho", "Definition of done"]],
  ["estimate", ["Estimación", "Estimate", "Tamaño", "Size"]],
  ["dependencies", ["Dependencias", "Dependencies"]],
]);

const STANDARD_TAIL = `
INVEST check: Independent, Negotiable, Valuable, Estimable, Small, Testable.
If a card fails INVEST (usually Small or Testable), propose a split instead of polishing it.
`;

const label = (s: CardSection): string =>
  s.id === "title" ? s.name : `${s.name} (${s.required ? "required" : "optional"})`;

/** The work item ("tarjeta") quality standard used across the course, generated from CARD_SECTIONS. */
export const CARD_STANDARD = `# Work item quality standard

A card is ready when someone who did not write it can implement and verify it without asking.
Say each thing once: no story that restates the title, no definition of done that restates the criteria.
Write the headings in Spanish, in this order:
${CARD_SECTIONS.map((s, i) => `${i + 1}. ${label(s)}: ${s.description}`).join("\n")}
${STANDARD_TAIL}`;
