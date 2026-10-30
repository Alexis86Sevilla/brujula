export interface CardSection {
  /** Stable kebab-case identifier, used in lint output. */
  id: string;
  /** English name, as shown in CARD_STANDARD. */
  name: string;
  description: string;
  /** Extra headings (Spanish and English variants) accepted for this section; matching ignores case and accents. */
  aliases: string[];
}

/** The 9 sections every work item must have. Single source of truth for CARD_STANDARD and the linter. */
export const CARD_SECTIONS: readonly CardSection[] = [
  {
    id: "title",
    name: "Title",
    description: 'an outcome, not an activity ("Users can reset their password", not "Password work").',
    aliases: ["Título"],
  },
  {
    id: "story",
    name: "Story or problem statement",
    description: '"As <who> I want <what> so that <why>", or a plain problem statement.',
    aliases: ["Story", "Problem statement", "Historia", "Problema", "Historia o problema"],
  },
  {
    id: "context",
    name: "Context and links",
    description: "why now, related items, wiki pages, ADRs.",
    aliases: ["Context", "Contexto", "Contexto y enlaces"],
  },
  {
    id: "acceptance-criteria",
    name: "Acceptance criteria",
    description: "Given/When/Then, each one testable.",
    aliases: ["Criterios de aceptación", "Criterios de aceptacion"],
  },
  {
    id: "out-of-scope",
    name: "Out of scope",
    description: "what this card deliberately does not do.",
    aliases: ["Fuera de alcance"],
  },
  {
    id: "definition-of-done",
    name: "Definition of done",
    description: "tests, docs, review, deployment as applicable.",
    aliases: ["Definición de hecho", "Definicion de hecho", "Definition of done (DoD)"],
  },
  {
    id: "estimate",
    name: "Estimate/size",
    description: "one value, with the assumption behind it.",
    aliases: ["Estimate", "Size", "Estimación", "Tamaño"],
  },
  {
    id: "dependencies",
    name: "Dependencies",
    description: "other cards, teams or systems it needs.",
    aliases: ["Dependencias"],
  },
  {
    id: "risks",
    name: "Risks",
    description: "what could make it bigger or fail.",
    aliases: ["Riesgos"],
  },
];

const STANDARD_TAIL = `
INVEST check: Independent, Negotiable, Valuable, Estimable, Small, Testable.
If a card fails INVEST (usually Small or Testable), propose a split instead of polishing it.
`;

/** The work item ("tarjeta") quality standard used across the course, generated from CARD_SECTIONS. */
export const CARD_STANDARD = `# Work item quality standard

A card is ready when it has ALL of these sections:
${CARD_SECTIONS.map((s, i) => `${i + 1}. ${s.name}: ${s.description}`).join("\n")}
${STANDARD_TAIL}`;
