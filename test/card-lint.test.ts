import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkCard } from "../plugin/skills/tarjeta/scripts/check-card.mjs";
import { lintCard } from "../src/mcp/card-lint.js";
import { CARD_SECTIONS, CARD_STANDARD, LEGACY_SECTIONS } from "../src/mcp/standard.js";

const EXPECTED_STANDARD = `# Work item quality standard

A card is ready when someone who did not write it can implement and verify it without asking.
Say each thing once: no story that restates the title, no definition of done that restates the criteria.
Write the headings in Spanish, in this order:
1. Title: an outcome, not an activity ("Users can reset their password", not "Password work").
2. Por qué (required): 2-3 lines: the problem, who suffers it and why now.
3. Qué cambia (required): the scope, what changes and where; tables are welcome.
4. Cómo (optional): short steps, only when there is an operation to run; include how to roll back.
5. Hecho cuando (required): 2-6 checkable criteria, Given/When/Then (Dado/Cuando/Entonces) or a verifiable list.
6. Riesgo (optional): only real risks, each one with its mitigation.
7. Footer line (required): "**Fuera de alcance:** … · **Estimación:** … · **Dependencias:** …" (size XS-XL or 1-13; "ninguna" is valid).

INVEST check: Independent, Negotiable, Valuable, Estimable, Small, Testable.
If a card fails INVEST (usually Small or Testable), propose a split instead of polishing it.
`;

const complete = `# Los usuarios restablecen su contraseña

## Por qué
Hoy hay que pedirlo a soporte y tarda un día.

## Qué cambia
Un enlace "He olvidado mi contraseña" en el login.

## Hecho cuando
- **Dado** un usuario registrado, **cuando** pide el enlace, **entonces** recibe un correo.
- **Dado** un correo desconocido, **cuando** pide el enlace, **entonces** ve el mismo mensaje.

**Fuera de alcance:** doble factor · **Estimación:** S · **Dependencias:** ninguna
`;

const REQUIRED = CARD_SECTIONS.filter((s) => s.required).map((s) => s.id);

describe("CARD_STANDARD", () => {
  it("matches the agreed light format text", () => {
    expect(CARD_STANDARD).toBe(EXPECTED_STANDARD);
  });
  it("has 7 sections with unique kebab-case ids, 5 of them required", () => {
    expect(CARD_SECTIONS).toHaveLength(7);
    expect(new Set(CARD_SECTIONS.map((s) => s.id)).size).toBe(7);
    for (const s of CARD_SECTIONS) expect(s.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(REQUIRED).toEqual(["title", "why", "what-changes", "done-when", "footer"]);
  });
});

describe("lintCard", () => {
  it("accepts a complete Spanish card", () => {
    expect(lintCard(complete)).toEqual({ ok: true, missing: [], empty: [], legacy: [], criteria: true, errors: [] });
  });

  it("reports every required section missing for an empty card", () => {
    const r = lintCard("");
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(REQUIRED);
    expect(r.criteria).toBe(false);
  });

  it("flags headings with empty bodies and a blank title", () => {
    const r = lintCard("# \n\n## Por qué\n\n## Hecho cuando\n   \n## Riesgo\n- x\n");
    expect(r.empty).toEqual(expect.arrayContaining(["title", "why", "done-when"]));
    expect(r.missing).toEqual(["what-changes", "footer"]);
    expect(r.criteria).toBe(false);
  });

  it("reports old heavy-format headings as legacy", () => {
    const r = lintCard(`${complete}\n## Historia\nComo usuario...\n\n## Definición de hecho\n- [ ] Tests\n`);
    expect(r.legacy).toEqual(["story", "definition-of-done"]);
    expect(r.ok).toBe(false);
  });

  it("accepts a plain checklist and requires 2-6 criteria", () => {
    expect(
      lintCard(complete.replace(/- \*\*Dado.*\n- \*\*Dado.*\n/, "- [ ] Llega el correo.\n- [ ] Caduca en 1 h.\n")).ok,
    ).toBe(true);
    expect(lintCard(complete.replace(/- \*\*Dado.*\n(?=- \*\*Dado)/, "")).criteria).toBe(false);
    const seven = Array.from({ length: 7 }, (_, i) => `- Criterio ${i + 1}.`).join("\n");
    expect(lintCard(complete.replace(/- \*\*Dado[\s\S]*?\n\n/, `${seven}\n\n`)).criteria).toBe(false);
  });

  it("accepts English headings, case and accent insensitive", () => {
    const md = complete
      .replace("Por qué", "WHY")
      .replace("Qué cambia", "que cambia")
      .replace("Hecho cuando", "Done when");
    expect(lintCard(md).ok).toBe(true);
  });

  it("ignores headings and the footer inside code fences", () => {
    const md = complete.replace(
      /\*\*Fuera[^\n]*\n/,
      "```\n**Fuera de alcance:** x · **Estimación:** S · **Dependencias:** y\n```\n",
    );
    expect(lintCard(md).missing).toEqual(["footer"]);
  });

  it("handles CRLF", () => {
    expect(lintCard(complete.replace(/\n/g, "\r\n")).ok).toBe(true);
  });
});

describe("the two validators agree", () => {
  const cards = {
    template: readFileSync("plugin/skills/tarjeta/templates/card.md", "utf8"),
    good: readFileSync("test/fixtures/cards/good.md", "utf8"),
    bad: readFileSync("test/fixtures/cards/bad.md", "utf8"),
  };
  it.each(Object.entries(cards))("%s gets the same verdict from check-card.mjs and lintCard", (name, md) => {
    const skill = checkCard(md).ok;
    expect(lintCard(md).ok).toBe(skill);
    expect(skill).toBe(name !== "bad");
  });

  const heading = (from: string, to: string) => complete.replace(`## ${from}\n`, `## ${to}\n`);
  const cases: [string, string, boolean][] = [
    [
      "English headings",
      heading("Por qué", "Why").replace("## Qué cambia", "## What changes").replace("## Hecho cuando", "## Done when"),
      true,
    ],
    ["trailing colon and hashes", heading("Por qué", "Por qué:").replace("## Qué cambia", "## Qué cambia ##"), true],
    ["a risk without mitigation", `${complete}\n## Riesgo\n- Puede fallar el correo.\n`, false],
    ["a risk with mitigation", `${complete}\n## Riesgo\n- Puede fallar el correo. Mitigación: reintento.\n`, true],
    ["an estimate without size", complete.replace("**Estimación:** S", "**Estimación:** pendiente"), false],
    ["a placeholder", complete.replace("Un enlace", "Un <enlace>"), false],
    ["a repeated section", `${complete}\n## Por qué\nOtra razón.\n`, false],
    ["no H1 title", complete.replace(/^# .*\n/, ""), false],
  ];
  it.each(cases)("%s: same verdict from both", (_name, md, expected) => {
    expect(checkCard(md).ok).toBe(expected);
    expect(lintCard(md).ok).toBe(expected);
  });

  const aliases = CARD_SECTIONS.filter((s) => !["title", "footer"].includes(s.id)).flatMap((s) =>
    s.aliases.map((a) => [s.name, a] as const),
  );
  it.each(aliases)("check-card.mjs accepts %s written as '%s'", (name, alias) => {
    const md = complete.includes(`## ${name}\n`)
      ? heading(name, alias)
      : `${complete}\n## ${alias}\n- Paso uno. Mitigación: ninguna necesaria.\n`;
    expect(checkCard(md)).toEqual({ ok: true, errors: [] });
  });

  const legacy = [...LEGACY_SECTIONS.values()].flat();
  it.each(legacy)("both reject the old heading '%s'", (old) => {
    const md = `${complete}\n## ${old}\nTexto.\n`;
    expect(checkCard(md).ok).toBe(false);
    expect(lintCard(md).ok).toBe(false);
  });
});
