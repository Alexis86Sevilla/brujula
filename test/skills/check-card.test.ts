import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = "plugin/skills/tarjeta/scripts/check-card.mjs";
const template = readFileSync("plugin/skills/tarjeta/templates/card.md", "utf8").replace(/\r\n/g, "\n");
const good = readFileSync("test/fixtures/cards/good.md", "utf8");

function run(markdown: string): { status: number | null; json: { ok: boolean; errors: string[] } } {
  const r = spawnSync("node", [script, "-"], { input: markdown, encoding: "utf8" });
  return { status: r.status, json: JSON.parse(r.stdout) };
}
const errorsOf = (markdown: string): string => run(markdown).json.errors.join("\n");
const withDone = (items: string[]): string =>
  template.replace(/## Hecho cuando\n[\s\S]*?\n\n## Riesgo/, `## Hecho cuando\n${items.join("\n")}\n\n## Riesgo`);

describe("check-card.mjs", () => {
  it("accepts the reference template", () => {
    const r = run(template);
    expect(r.json.errors).toEqual([]);
    expect(r.status).toBe(0);
  });

  it("accepts a card without the optional Cómo and Riesgo sections", () => {
    expect(run(good).json.errors).toEqual([]);
  });

  it("reports every missing required section and the footer line", () => {
    const r = run("# Un título válido de tarjeta\n");
    expect(r.status).toBe(1);
    const joined = r.json.errors.join("\n");
    for (const s of ["Por qué", "Qué cambia", "Hecho cuando"]) expect(joined).toContain(`missing section: ## ${s}`);
    expect(joined).toContain("missing footer line");
    expect(joined).not.toContain("## Cómo");
    expect(joined).not.toContain("## Riesgo");
  });

  it("rejects the old heavy-format headings and names the replacement", () => {
    const joined = errorsOf(
      `${template}\n## Historia\nComo usuario quiero algo.\n\n## Definición de hecho\n- [ ] Tests\n`,
    );
    expect(joined).toContain("old-format section: ## Historia (use ## Por qué)");
    expect(joined).toContain("old-format section: ## Definición de hecho (use ## Hecho cuando)");
  });

  it("accepts a plain verifiable list in Hecho cuando and requires 2-6 items", () => {
    expect(run(withDone(["- [ ] El log no muestra errores.", "- [ ] El pedido de prueba se cobra."])).json.ok).toBe(
      true,
    );
    expect(errorsOf(withDone(["- Solo uno."]))).toContain("## Hecho cuando needs 2-6 checkable items, found 1");
    const seven = Array.from({ length: 7 }, (_, i) => `- Criterio ${i + 1}.`);
    expect(errorsOf(withDone(seven))).toContain("## Hecho cuando needs 2-6 checkable items, found 7");
  });

  it("requires a mitigation for every risk", () => {
    const bad = template.replace("; mitigación: no revocar hasta comprobar los tres servicios", "");
    expect(errorsOf(bad)).toContain("## Riesgo: every risk needs its mitigation");
  });

  it("limits Por qué to four lines", () => {
    const long = template.replace("## Por qué\n", "## Por qué\nUna.\nDos.\nTres.\n");
    expect(errorsOf(long)).toContain("## Por qué must be at most 4 lines, found 5");
  });

  it("checks the footer line: labels, values and size", () => {
    expect(errorsOf(template.replace("**Estimación:** S", "**Estimación:** mucho"))).toContain(
      "footer: Estimación must contain a size: XS, S, M, L, XL or 1/2/3/5/8/13",
    );
    expect(errorsOf(template.replace("**Estimación:** S", "**Estimación:** 4 h (talla M)"))).toBe("");
    expect(
      errorsOf(template.replace(" · **Dependencias:** acceso de administrador a la consola de la pasarela", "")),
    ).toContain("missing footer line");
    expect(
      errorsOf(
        template.replace("**Fuera de alcance:** limpiar el log donde apareció la clave", "**Fuera de alcance:**"),
      ),
    ).toContain("footer: empty value for Fuera de alcance");
  });

  it("accepts the footer before an extra Preguntas abiertas section", () => {
    expect(errorsOf(`${template}\n## Preguntas abiertas\n- ¿Quién tiene acceso a la consola?\n`)).toBe("");
  });

  it("flags placeholders in prose but not inside inline code", () => {
    expect(errorsOf(template.replace("API de pedidos", "<completar>"))).toContain(
      "placeholder left in section: ## Qué cambia",
    );
    expect(errorsOf(template.replace("`PAYMENTS_API_KEY`", "`PAYMENTS_API_KEY=<nueva>`"))).toBe("");
    expect(errorsOf(template.replace("**Estimación:** S", "**Estimación:** <talla>"))).toContain(
      "placeholder left in footer line",
    );
  });

  it("accepts the Spanish word 'todo' but rejects an uppercase TODO marker", () => {
    expect(errorsOf(template.replace("Primero en QA", "Todo primero en QA"))).toBe("");
    expect(errorsOf(template.replace("Primero en QA", "TODO primero en QA"))).toContain(
      "placeholder left in section: ## Cómo",
    );
  });

  it("works on a file path and exits 2 without arguments", () => {
    expect(execFileSync("node", [script, "plugin/skills/tarjeta/templates/card.md"], { encoding: "utf8" })).toContain(
      '"ok": true',
    );
    expect(spawnSync("node", [script]).status).toBe(2);
  });
});
