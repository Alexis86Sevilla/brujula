import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMarkdown } from "../../src/ingest/loader.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "brujula-loader-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content, "utf8");
  return path;
}

describe("loadMarkdown", () => {
  it("parses frontmatter, strips it from the body and reports where the body starts", async () => {
    const path = write("guia.md", "---\ntitle: Guía de despliegue\ntags: [ci, azure]\n---\n# Otro título\n\nTexto.\n");
    const doc = await loadMarkdown(path);
    expect(doc.frontmatter).toEqual({ title: "Guía de despliegue", tags: ["ci", "azure"] });
    expect(doc.title).toBe("Guía de despliegue");
    expect(doc.body.startsWith("# Otro título")).toBe(true);
    expect(doc.bodyStartLine).toBe(5);
    expect(doc.path).toBe(path);
  });

  it("uses the first H1 as title when there is no frontmatter", async () => {
    const doc = await loadMarkdown(write("a.md", "Intro\n\n# Arquitectura\n\nTexto\n"));
    expect(doc.frontmatter).toEqual({});
    expect(doc.title).toBe("Arquitectura");
    expect(doc.bodyStartLine).toBe(1);
  });

  it("falls back to the file name without extension", async () => {
    const doc = await loadMarkdown(write("sin-titulo.md", "Solo texto.\n"));
    expect(doc.title).toBe("sin-titulo");
  });

  it("ignores a # line inside a fenced code block when looking for the title", async () => {
    const doc = await loadMarkdown(write("code.md", "```bash\n# esto es un comentario\n```\n"));
    expect(doc.title).toBe("code");
  });

  it("normalizes CRLF line endings", async () => {
    const doc = await loadMarkdown(write("crlf.md", "# Hola\r\n\r\nLínea\r\n"));
    expect(doc.body).not.toContain("\r");
    expect(doc.title).toBe("Hola");
  });

  it("rejects with a message that names the file when the frontmatter is not valid YAML", async () => {
    const path = write("roto.md", "---\ntitle: [sin cerrar\n---\n# X\n");
    await expect(loadMarkdown(path)).rejects.toThrow(/frontmatter/i);
    await expect(loadMarkdown(path)).rejects.toThrow(path);
  });
});
