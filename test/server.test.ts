import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../src/mcp/server.js";

let root: string;
let client: Client;
let server: ReturnType<typeof createServer>;

async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  server = createServer({ root });
  await server.connect(serverTransport);
  client = new Client({ name: "test-harness", version: "1.0.0" });
  await client.connect(clientTransport);
}

const firstText = (r: { content: unknown }) => (r.content as { text: string }[])[0]?.text ?? "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "brujula-"));
  await mkdir(join(root, ".claude", "rules"), { recursive: true });
  await writeFile(join(root, ".claude", "rules", "mcp.md"), "# MCP rules\nNever console.log in stdio servers.\n");
  await writeFile(join(root, "CLAUDE.md"), "# Brujula\n");
});

afterEach(async () => {
  await client?.close();
  await server?.close();
});

describe("tools", () => {
  it("lists the three tools", async () => {
    await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["brujula_adr_create", "brujula_card_lint", "brujula_conventions"]);
  });

  it("brujula_conventions lists topics and serves one", async () => {
    await connect();
    const list = await client.callTool({ name: "brujula_conventions", arguments: {} });
    expect(firstText(list)).toContain("claude-md, mcp");
    const one = await client.callTool({ name: "brujula_conventions", arguments: { topic: "mcp" } });
    expect(firstText(one)).toContain("Never console.log");
  });

  it("brujula_conventions rejects unknown topics and path traversal with a guiding error", async () => {
    await connect();
    for (const topic of ["nope", "../../etc/passwd"]) {
      const r = await client.callTool({ name: "brujula_conventions", arguments: { topic } });
      expect(r.isError).toBe(true);
      expect(firstText(r)).toContain("Valid topics: claude-md, mcp");
    }
  });

  it("brujula_adr_create writes numbered files", async () => {
    await connect();
    const args = {
      title: "Use SQLite for the docs index",
      context: "We need a local index with no services to run.",
      decision: "Use better-sqlite3 with FTS5 and sqlite-vec.",
      consequences: "Native module to build; single file to back up.",
    };
    const a = await client.callTool({ name: "brujula_adr_create", arguments: args });
    expect(firstText(a)).toContain("docs/adr/0001-use-sqlite-for-the-docs-index.md");
    const b = await client.callTool({
      name: "brujula_adr_create",
      arguments: { ...args, title: "Second decision here" },
    });
    expect(firstText(b)).toContain("docs/adr/0002-second-decision-here.md");
    const file = await readFile(join(root, "docs/adr/0001-use-sqlite-for-the-docs-index.md"), "utf8");
    expect(file).toContain("# ADR-0001: Use SQLite for the docs index");
    expect(file).toContain("- Status: proposed");
  });

  it("brujula_adr_create returns a validation error for a bad input", async () => {
    await connect();
    const r = await client.callTool({ name: "brujula_adr_create", arguments: { title: "x" } });
    expect(r.isError).toBe(true);
  });
});

describe("brujula_card_lint", () => {
  const lint = (markdown: string) => client.callTool({ name: "brujula_card_lint", arguments: { markdown } });
  const complete = [
    "# Los usuarios restablecen su contraseña",
    "## Por qué\nHoy hay que pedirlo a soporte.",
    "## Qué cambia\nUn enlace en el login.",
    "## Hecho cuando\n- **Dado** un usuario, **cuando** pide el enlace, **entonces** recibe un correo.\n- [ ] El enlace caduca en 1 h.",
    "**Fuera de alcance:** doble factor · **Estimación:** S · **Dependencias:** ninguna",
  ].join("\n\n");

  it("is advertised as read-only with an output schema", async () => {
    await connect();
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "brujula_card_lint");
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?.outputSchema).toBeDefined();
  });

  it("reports every required section missing for an empty card", async () => {
    await connect();
    const r = await lint("");
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ ok: false, criteria: false });
    expect((r.structuredContent as { missing: string[] }).missing).toHaveLength(5);
    expect(firstText(r)).toContain("NOT ready");
  });

  it("accepts a complete Spanish card", async () => {
    await connect();
    const r = await lint(complete);
    expect(r.structuredContent).toEqual({ ok: true, missing: [], empty: [], legacy: [], criteria: true });
  });

  it("flags headings with empty bodies", async () => {
    await connect();
    const r = await lint("# Titulo valido de tarjeta\n\n## Por qué\n\n## Qué cambia\n  \n");
    const sc = r.structuredContent as { ok: boolean; empty: string[]; missing: string[] };
    expect(sc.ok).toBe(false);
    expect(sc.empty).toEqual(["why", "what-changes"]);
    expect(sc.missing).toContain("footer");
  });

  it("names old heavy-format headings in the summary", async () => {
    await connect();
    const r = await lint(`${complete}\n\n## Historia\nComo usuario quiero algo.`);
    expect(r.structuredContent).toMatchObject({ ok: false, legacy: ["story"] });
    expect(firstText(r)).toContain("Old-format sections to merge into the new ones: story.");
  });

  it("returns a guided isError (no exception) for a 1 MB input", async () => {
    await connect();
    const r = await lint("x".repeat(1_000_000));
    expect(r.isError).toBe(true);
    expect(firstText(r)).toContain("limit is 100000");
  });
});

describe("resources and prompts", () => {
  it("serves the card standard and a rules template", async () => {
    await connect();
    const std = await client.readResource({ uri: "brujula://standard/card" });
    expect(JSON.stringify(std.contents)).toContain("INVEST");
    const rule = await client.readResource({ uri: "brujula://rules/mcp" });
    expect(JSON.stringify(rule.contents)).toContain("MCP rules");
  });

  it("refinar_tarjeta embeds the idea and the standard", async () => {
    await connect();
    const p = await client.getPrompt({ name: "refinar_tarjeta", arguments: { idea: "login con SSO" } });
    const body = JSON.stringify(p.messages);
    expect(body).toContain("login con SSO");
    expect(body).toContain("Given/When/Then");
  });
});
