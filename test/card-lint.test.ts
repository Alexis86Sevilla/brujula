import { describe, expect, it } from "vitest";
import { lintCard } from "../src/mcp/card-lint.js";
import { CARD_SECTIONS, CARD_STANDARD } from "../src/mcp/standard.js";

const ORIGINAL_STANDARD = `# Work item quality standard

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

const complete = `# Los usuarios restablecen su contraseña

## Historia
Como usuario quiero restablecer mi contraseña.

## Contexto
Hoy hay que pedirlo a soporte.

## Criterios de aceptación
- **Dado** un usuario registrado, **cuando** pide el enlace, **entonces** recibe un correo.

## Fuera de alcance
- Doble factor.

## Definición de hecho
- [ ] Tests

## Estimación
S

## Dependencias
- Ninguna.

## Riesgos
- Correos en spam.
`;

describe("CARD_STANDARD", () => {
  it("is byte-identical to the original text", () => {
    expect(CARD_STANDARD).toBe(ORIGINAL_STANDARD);
  });
  it("has 9 sections with unique kebab-case ids", () => {
    expect(CARD_SECTIONS).toHaveLength(9);
    expect(new Set(CARD_SECTIONS.map((s) => s.id)).size).toBe(9);
    for (const s of CARD_SECTIONS) expect(s.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});

describe("lintCard", () => {
  it("accepts a complete Spanish card", () => {
    expect(lintCard(complete)).toEqual({ ok: true, missing: [], empty: [], gwt: true });
  });

  it("reports everything missing for an empty card", () => {
    const r = lintCard("");
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(CARD_SECTIONS.map((s) => s.id));
    expect(r.gwt).toBe(false);
  });

  it("flags headings with empty bodies and a blank title", () => {
    const r = lintCard("# \n\n## Historia\n\n## Criterios de aceptación\n   \n## Riesgos\n- x\n");
    expect(r.empty).toEqual(expect.arrayContaining(["title", "story", "acceptance-criteria"]));
    expect(r.missing).toContain("context");
    expect(r.gwt).toBe(false);
  });

  it("accepts English headings and Given/When/Then, case and accent insensitive", () => {
    const md = complete
      .replace("Criterios de aceptación", "ACCEPTANCE CRITERIA")
      .replace(/Dado.*\n/, "- GIVEN a user, when asking, then mail.\n")
      .replace("Estimación", "Estimate/size");
    expect(lintCard(md).ok).toBe(true);
    expect(lintCard(complete.replace("aceptación", "ACEPTACION")).ok).toBe(true);
  });

  it("requires all three keywords in a single criterion", () => {
    const md = complete.replace(/- \*\*Dado.*\n/, "- Dado un usuario\n- cuando pide\n- entonces recibe\n");
    const r = lintCard(md);
    expect(r.gwt).toBe(false);
    expect(r.ok).toBe(false);
  });

  it("accepts a Given/When/Then paragraph without bullets", () => {
    const md = complete.replace(
      /- \*\*Dado.*\n/,
      "Dado un usuario,\ncuando pide el enlace,\nentonces recibe un correo.\n",
    );
    expect(lintCard(md).gwt).toBe(true);
  });

  it("ignores headings inside code fences", () => {
    const md = complete.replace("## Riesgos\n- Correos en spam.\n", "```\n## Riesgos\n- x\n```\n");
    expect(lintCard(md).empty.concat(lintCard(md).missing)).toContain("risks");
  });

  it("handles CRLF", () => {
    expect(lintCard(complete.replace(/\n/g, "\r\n")).ok).toBe(true);
  });
});
