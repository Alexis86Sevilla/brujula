import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = "plugin/skills/tarjeta/scripts/check-card.mjs";
const template = readFileSync("plugin/skills/tarjeta/templates/card.md", "utf8").replace(/\r\n/g, "\n");

function run(markdown: string): { status: number | null; json: { ok: boolean; errors: string[] } } {
  const r = spawnSync("node", [script, "-"], { input: markdown, encoding: "utf8" });
  return { status: r.status, json: JSON.parse(r.stdout) };
}

describe("check-card.mjs", () => {
  it("accepts the reference template", () => {
    const r = run(template);
    expect(r.json.errors).toEqual([]);
    expect(r.status).toBe(0);
  });

  it("reports every missing section", () => {
    const r = run("# Un título válido de tarjeta\n\n## Historia\nComo dev quiero algo.\n");
    expect(r.status).toBe(1);
    const joined = r.json.errors.join("\n");
    for (const s of [
      "Contexto",
      "Criterios de aceptación",
      "Fuera de alcance",
      "Definición de hecho",
      "Estimación",
      "Dependencias",
      "Riesgos",
    ]) {
      expect(joined).toContain(`missing section: ## ${s}`);
    }
  });

  it("rejects acceptance criteria that are not Dado/Cuando/Entonces", () => {
    const bad = template.replace(
      /## Criterios de aceptación[\s\S]*?## Fuera/,
      "## Criterios de aceptación\n- Que funcione bien\n- Que sea rápido\n\n## Fuera",
    );
    const r = run(bad);
    expect(r.status).toBe(1);
    expect(r.json.errors.join("\n")).toMatch(/Dado\/Cuando\/Entonces/);
  });

  it("rejects placeholders and an invalid estimate", () => {
    const bad = template
      .replace("## Estimación\nM", "## Estimación\nmucho")
      .replace("Acceso de lectura", "<completar>");
    const r = run(bad);
    expect(r.json.errors.join("\n")).toMatch(/Estimación must contain a size/);
    expect(r.json.errors.join("\n")).toMatch(/placeholder left in section: ## Dependencias/);
  });

  it("accepts the Spanish word 'todo' but rejects an uppercase TODO marker", () => {
    const spanish = template.replace("Acceso de lectura", "Acceso de lectura a todo");
    expect(run(spanish).json.errors).toEqual([]);
    const marker = template.replace("Acceso de lectura", "TODO acceso de lectura");
    expect(run(marker).json.errors.join("\n")).toMatch(/placeholder left in section: ## Dependencias/);
  });

  it("works on a file path and exits 2 without arguments", () => {
    expect(execFileSync("node", [script, "plugin/skills/tarjeta/templates/card.md"], { encoding: "utf8" })).toContain(
      '"ok": true',
    );
    expect(spawnSync("node", [script]).status).toBe(2);
  });
});
