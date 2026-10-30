import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer, stubSearch, type SearchFn } from "../src/mcp/server.js";

let root: string;
let client: Client;
let server: ReturnType<typeof createServer>;

async function connect(search: SearchFn = stubSearch) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  server = createServer({ root, search });
  await server.connect(serverTransport);
  client = new Client({ name: "test-harness", version: "1.0.0" });
  await client.connect(clientTransport);
}

const firstText = (r: { content: unknown }) => (r.content as { text: string }[])[0].text;

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
    expect(tools.map((t) => t.name).sort()).toEqual(["brujula_adr_create", "brujula_conventions", "brujula_search_docs"]);
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
    const b = await client.callTool({ name: "brujula_adr_create", arguments: { ...args, title: "Second decision here" } });
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

  it("brujula_search_docs reports the stub honestly", async () => {
    await connect();
    const r = await client.callTool({ name: "brujula_search_docs", arguments: { query: "deploy process" } });
    expect(r.isError).toBe(true);
    expect(firstText(r)).toContain("module 7");
  });

  it("brujula_search_docs formats hits with source and lines", async () => {
    await connect(async () => [
      { source: "wiki/deploy.md", heading: "Rollback", startLine: 10, endLine: 22, score: 0.5, text: "Run the rollback job." },
    ]);
    const r = await client.callTool({ name: "brujula_search_docs", arguments: { query: "rollback" } });
    expect(firstText(r)).toContain("wiki/deploy.md:10-22 (Rollback)");
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