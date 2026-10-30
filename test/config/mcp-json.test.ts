import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const root = resolve(import.meta.dirname, "../..");
const raw = readFileSync(resolve(root, ".mcp.json"), "utf8");
const config = z
  .object({
    mcpServers: z.object({
      ado: z.object({
        type: z.string(),
        command: z.string(),
        args: z.array(z.string()),
        env: z.record(z.string(), z.string()).optional(),
      }),
    }),
  })
  .parse(JSON.parse(raw));

describe(".mcp.json", () => {
  const ado = config.mcpServers.ado;

  it("declares the azure-devops server over stdio", () => {
    expect(ado).toBeDefined();
    expect(ado.type).toBe("stdio");
    expect(ado.args).toContain("${ADO_ORG}");
  });

  it("pins the package version (no floating latest)", () => {
    const pkg = ado.args.find((a) => a.startsWith("@azure-devops/mcp"));
    expect(pkg).toMatch(/^@azure-devops\/mcp@\d+\.\d+\.\d+/);
  });

  it("limits domains and always includes core", () => {
    const i = ado.args.indexOf("-d");
    expect(i).toBeGreaterThan(-1);
    const domains = ado.args.slice(i + 1);
    expect(domains).toContain("core");
    expect(domains).not.toContain("pipelines");
  });

  it("contains no literal secrets", () => {
    expect(raw).not.toMatch(/(ghp_|AKIA|sk-ant-|Bearer\s+[A-Za-z0-9]|PERSONAL_ACCESS_TOKEN|ADO_MCP_AUTH_TOKEN)/);
    expect(raw).not.toMatch(/[a-z2-7]{52}/);
  });
});
