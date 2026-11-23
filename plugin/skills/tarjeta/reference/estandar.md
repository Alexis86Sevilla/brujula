# Work item quality standard (Brújula)

A card is ready when someone who did not write it can implement and verify it without asking.

| Section | Rule |
|---|---|
| Title (H1) | An outcome, not a task. Bad: "Implement search endpoint". Good: "Teammates find a wiki page by asking a question". 8-100 characters. |
| Historia | "Como <rol>, quiero <capacidad>, para <beneficio>" or a problem statement with who suffers it and how often. |
| Contexto | Why now, links to pages or ADRs that exist, what was tried. No invented links. |
| Criterios de aceptación | One bullet per scenario: **Dado** ..., **cuando** ..., **entonces** .... Independently testable. At least one error or edge case. Observable behaviour, not implementation. |
| Fuera de alcance | Things a reader could reasonably assume are included but are not. |
| Definición de hecho | Checklist (`- [ ]`): tests, docs, review. At least two items. |
| Estimación | One size: XS, S, M, L, XL (or 1, 2, 3, 5, 8, 13). L/XL means "split it first". |
| Dependencias | Other cards, access, people, decisions. "Ninguna" is a valid answer. |
| Riesgos | What can go wrong and one mitigation each. |

INVEST check before finishing: Independent, Negotiable, Valuable, Estimable, Small, Testable.
If a card fails Small or Testable, split it or sharpen the acceptance criteria.