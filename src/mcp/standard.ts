/** The work item ("tarjeta") quality standard used across the course. Single source of truth. */
export const CARD_STANDARD = `# Work item quality standard

A card is ready when it has ALL of these sections:
1. Title: an outcome, not an activity ("Users can reset their password", not "Password work").
2. Story or problem statement: "As <who> I want <what> so that <why>", or a plain problem statement.
3. Context and links: why now, related items, wiki pages, ADRs.
4. Acceptance criteria: Given/When/Then, each one testable.
5. Out of scope: what this card deliberately does not do.
6. Definition of done: tests, docs, review, deployment as applicable.
7. Estimate/size: one value, with the assumption behind it.
8. Dependencies: other cards, teams or systems it needs.
9. Risks: what could make it bigger or fail.

INVEST check: Independent, Negotiable, Valuable, Estimable, Small, Testable.
If a card fails INVEST (usually Small or Testable), propose a split instead of polishing it.
`;
