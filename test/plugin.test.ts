// test/plugin.test.ts
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scriptsDir } from "./hooks/helpers.js";

const root = join(import.meta.dirname, "..");
const plugin = join(root, "plugin");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

// The hooks of module 4 (plus secret-scan). verifier-bash-guard.sh stays in the project with its agent.
const HOOKS = [
  "session-context.sh",
  "user-prompt.sh",
  "protect-paths.sh",
  "guard-bash.sh",
  "secret-scan.sh",
  "format-file.sh",
  "quality-gate.sh",
  "confirm-ado-write.sh",
  "notify.sh",
];
const SKILLS = [
  "backlog",
  "bienvenida",
  "configurar",
  "doctor",
  "empezar",
  "explica-modulo",
  "pr-prep",
  "publicar",
  "sprint-sync",
  "tareas",
  "tarjeta",
  "tarjeta-a-boards",
];
const AGENTS = ["explorer.md", "refinador.md", "revisor.md"];

function frontmatter(path: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---/.exec(readFileSync(path, "utf8"));
  if (!match?.[1]) throw new Error(`${path}: missing frontmatter`);
  return Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => /^([\w-]+):\s*(.*)$/.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1], m[2]]),
  );
}

function hookCommands(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(hookCommands);
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) =>
      key === "command" && typeof value === "string" ? [value] : hookCommands(value),
    );
  }
  return [];
}

/** Every text file of the plugin that Claude reads (skills, agents, hooks, MCP config), without build output. */
function textFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (["dist", "runtime", "node_modules", ".data"].includes(name)) return [];
    if (statSync(path).isDirectory()) return textFiles(path);
    return /\.(md|json|sh|mjs)$/.test(name) ? [path] : [];
  });
}

describe("plugin manifest", () => {
  const manifest = readJson(join(plugin, ".claude-plugin/plugin.json"));

  it("has a kebab-case name and a semver version", () => {
    expect(manifest.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.description).toBeTruthy();
  });

  it("matches its marketplace entry", () => {
    const marketplace = readJson(join(root, ".claude-plugin/marketplace.json"));
    const entry = marketplace.plugins.find((p: { name: string }) => p.name === manifest.name);
    expect(entry, "entry name must equal manifest name").toBeDefined();
    expect(entry.version, "set version in plugin.json only").toBeUndefined();
    expect(existsSync(join(root, entry.source, ".claude-plugin/plugin.json"))).toBe(true);
  });
});

describe("plugin components", () => {
  it("every skill has SKILL.md with matching name and a description", () => {
    const skills = readdirSync(join(plugin, "skills")).filter((d) => statSync(join(plugin, "skills", d)).isDirectory());
    expect(skills).toEqual(expect.arrayContaining(SKILLS));
    for (const dir of skills) {
      const fm = frontmatter(join(plugin, "skills", dir, "SKILL.md"));
      expect(fm.name, `${dir}: name`).toBe(dir);
      expect(fm.description?.length, `${dir}: description`).toBeGreaterThan(20);
    }
  });

  it("every agent has name and description", () => {
    const agents = readdirSync(join(plugin, "agents")).filter((f) => f.endsWith(".md"));
    expect(agents).toEqual(expect.arrayContaining(AGENTS));
    for (const file of agents) {
      const fm = frontmatter(join(plugin, "agents", file));
      expect(fm.name, `${file}: name`).toBeTruthy();
      expect(fm.description, `${file}: description`).toBeTruthy();
    }
  });

  it("no agent relies on frontmatter that plugins ignore (hooks, mcpServers, permissionMode)", () => {
    for (const file of readdirSync(join(plugin, "agents")).filter((f) => f.endsWith(".md"))) {
      const fm = frontmatter(join(plugin, "agents", file));
      for (const field of ["hooks", "mcpServers", "permissionMode"]) {
        expect(fm[field], `${file}: '${field}' is silently ignored in a plugin agent`).toBeUndefined();
      }
    }
  });

  it("skills refer to other skills with the plugin prefix (/brujula:<skill>)", () => {
    const bare = new RegExp(`(^|[^a-z:_{}/.-])/(${SKILLS.join("|")})\\b`);
    for (const file of textFiles(join(plugin, "skills")).filter((f) => f.endsWith(".md"))) {
      expect(readFileSync(file, "utf8"), `${file}: use /brujula:<skill>`).not.toMatch(bare);
    }
  });

  it("no skill points back at the project's .claude/ folder", () => {
    for (const file of textFiles(join(plugin, "skills")).filter((f) => f.endsWith(".md"))) {
      const text = readFileSync(file, "utf8");
      expect(text, `${file}: use \${CLAUDE_SKILL_DIR} or \${CLAUDE_PLUGIN_ROOT}`).not.toMatch(
        /\.claude\/skills|\$\{CLAUDE_PROJECT_DIR\}\/\.claude/,
      );
    }
  });
});

describe("plugin hooks", () => {
  // BRUJULA_TEST_HOOKS points at a draft hooks.json (plugin/hooks is protected from the agent).
  const hooks = readJson(resolve(process.env.BRUJULA_TEST_HOOKS ?? join(plugin, "hooks/hooks.json")));
  const commands = hookCommands(hooks);

  it("wraps events in a 'hooks' key and wires every hook through run-hook.sh", () => {
    expect(hooks.hooks, "hooks.json must wrap events in a 'hooks' key").toBeDefined();
    const wired = commands.map((c) => /^"\$\{CLAUDE_PLUGIN_ROOT\}"\/scripts\/run-hook\.sh ([\w.-]+)$/.exec(c)?.[1]);
    expect(wired.every(Boolean), `unexpected command form in ${JSON.stringify(commands)}`).toBe(true);
    expect(wired).toEqual(expect.arrayContaining(HOOKS));
  });

  it("every wired script exists and is executable", () => {
    for (const path of ["run-hook.sh", ...commands.map((c) => c.split(" ").pop() ?? "")]) {
      const file = join(scriptsDir, path);
      expect(existsSync(file), `${file} exists`).toBe(true);
      expect(statSync(file).mode & 0o111, `${file} is executable`).not.toBe(0);
    }
  });

  it("run-hook.sh runs generic hooks anywhere and honours BRUJULA_HOOKS_OFF", () => {
    const project = mkdtempSync(join(tmpdir(), "not-brujula-")); // no package.json, no node_modules
    const run = (script: string, env: Record<string, string> = {}) =>
      spawnSync(join(scriptsDir, "run-hook.sh"), [script], {
        input: JSON.stringify({
          hook_event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command: "rm -rf /tmp/x" },
        }),
        encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: project, ...env },
      });
    expect(run("guard-bash.sh").stdout).toContain('"deny"');
    expect(run("guard-bash.sh", { BRUJULA_HOOKS_OFF: "1" })).toMatchObject({ status: 0, stdout: "" });
  });

  it("records the quality gate's starting point on every user prompt", () => {
    const prompt = (hooks.hooks.UserPromptSubmit ?? []) as { hooks: { command: string }[] }[];
    expect(prompt.some((e) => e.hooks.some((h) => h.command.endsWith(" quality-gate.sh")))).toBe(true);
  });

  it("asks before any write of the ado MCP server, through a PreToolUse matcher", () => {
    const pre = (hooks.hooks.PreToolUse ?? []) as { matcher: string; hooks: { command: string }[] }[];
    const entry = pre.find((e) => e.hooks.some((h) => h.command.endsWith(" confirm-ado-write.sh")));
    expect(entry?.matcher).toBe("mcp__plugin_brujula_ado__.*");
  });

  it("BRUJULA_HOOKS_OFF never disables the Azure DevOps write confirmation", () => {
    const r = spawnSync(join(scriptsDir, "run-hook.sh"), ["confirm-ado-write.sh"], {
      input: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "mcp__plugin_brujula_ado__wit_work_item_write",
        tool_input: { action: "create" },
      }),
      encoding: "utf8",
      env: { ...process.env, BRUJULA_HOOKS_OFF: "1" },
    });
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision).toBe("ask");
  });

  it("BRUJULA_HOOKS_OFF never disables the .env guard", () => {
    const project = mkdtempSync(join(tmpdir(), "hooks-off-"));
    const r = spawnSync(join(scriptsDir, "run-hook.sh"), ["protect-paths.sh"], {
      input: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: { file_path: join(project, ".env") },
      }),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: project, BRUJULA_HOOKS_OFF: "1" },
    });
    expect(r.status).toBe(2);
  });

  it("run-hook.sh skips the Node-stack hooks in a project without those tools", () => {
    const project = mkdtempSync(join(tmpdir(), "not-node-"));
    for (const script of ["format-file.sh", "quality-gate.sh"]) {
      const r = spawnSync(join(scriptsDir, "run-hook.sh"), [script], {
        input: JSON.stringify({ hook_event_name: "Stop", tool_input: { file_path: join(project, "a.ts") } }),
        encoding: "utf8",
        env: { ...process.env, CLAUDE_PROJECT_DIR: project },
      });
      expect(r, script).toMatchObject({ status: 0, stdout: "", stderr: "" });
    }
  });
});

/** The environment of this test run without the user's BRUJULA_* switches (e.g. BRUJULA_GATE_OFF=1 claude). */
const withoutBrujulaVars = () =>
  Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("BRUJULA_")));

describe("quality-gate in a Node project", () => {
  // A project with package.json, tsc and vitest, whose tsc fails the way it does without a tsconfig.json.
  function nodeProject(withTsconfig: boolean): string {
    const project = mkdtempSync(join(tmpdir(), "node-proj-"));
    writeFileSync(join(project, "package.json"), "{}");
    mkdirSync(join(project, "node_modules/.bin"), { recursive: true });
    for (const bin of ["tsc", "vitest"]) {
      writeFileSync(join(project, "node_modules/.bin", bin), "#!/bin/sh\necho 'error TS5058'\nexit 1\n", {
        mode: 0o755,
      });
    }
    if (withTsconfig) writeFileSync(join(project, "tsconfig.json"), "{}");
    return project;
  }
  const gate = (project: string) =>
    spawnSync(join(scriptsDir, "run-hook.sh"), ["quality-gate.sh"], {
      input: JSON.stringify({ hook_event_name: "Stop" }),
      encoding: "utf8",
      env: { ...withoutBrujulaVars(), CLAUDE_PROJECT_DIR: project, BRUJULA_GATE_FORCE: "1" },
    });

  it("does not run where the project has no root tsconfig.json (a monorepo, say)", () => {
    const project = nodeProject(false);
    expect(gate(project)).toMatchObject({ status: 0, stderr: "" });
    rmSync(project, { recursive: true, force: true });
  });

  it("still blocks the turn where the project has a tsconfig.json and the typecheck fails", () => {
    const project = nodeProject(true);
    const r = gate(project);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("Typecheck fails");
    rmSync(project, { recursive: true, force: true });
  });
});

describe("MCP servers of the plugin", () => {
  const mcp = readJson(join(plugin, ".mcp.json"));

  it("uses plugin tool names everywhere (mcp__plugin_brujula_<server>__<tool>)", () => {
    const files = [...textFiles(plugin), join(root, ".claude/settings.json")].filter(existsSync);
    for (const file of files) {
      expect(readFileSync(file, "utf8"), `${file}: bare MCP name never matches a plugin server`).not.toMatch(
        /mcp__(ado|brujula)__/,
      );
    }
  });

  it("pins the Azure DevOps server and takes the organization from userConfig", () => {
    const args: string[] = mcp.mcpServers.ado.args;
    const pkg = args.find((a) => a.startsWith("@azure-devops/mcp"));
    expect(pkg).toMatch(/^@azure-devops\/mcp@\d+\.\d+\.\d+$/);
    expect(args).toContain("${user_config.ado_org}");
    expect(args.slice(args.indexOf("-d") + 1)).toEqual(
      expect.arrayContaining(["core", "work", "work-items", "repositories", "wiki"]),
    );
    expect(readFileSync(join(plugin, ".mcp.json"), "utf8"), "no secrets in .mcp.json").not.toMatch(
      /ghp_|Bearer|[a-z2-7]{52}/,
    );
    const pinFile = join(root, "scripts/ado-mcp.version");
    if (existsSync(pinFile)) expect(pkg).toBe(`@azure-devops/mcp@${readFileSync(pinFile, "utf8").trim()}`);
  });

  it("gives the brujula server the open project as its root", () => {
    expect(mcp.mcpServers.brujula.env.BRUJULA_ROOT).toBe("${CLAUDE_PROJECT_DIR}");
  });

  it("ships the built server, the runtime manifest and the launcher", () => {
    for (const path of ["dist/server.mjs", "runtime/package.json", "scripts/start-mcp.mjs"]) {
      expect(existsSync(join(plugin, path)), path).toBe(true);
    }
  });

  it("only references files inside the plugin", () => {
    for (const server of Object.values<{ args?: string[] }>(mcp.mcpServers)) {
      for (const arg of server.args ?? []) {
        if (!arg.startsWith("${CLAUDE_PLUGIN_ROOT}/")) continue;
        expect(existsSync(join(plugin, arg.replace("${CLAUDE_PLUGIN_ROOT}/", ""))), arg).toBe(true);
      }
    }
  });
});
