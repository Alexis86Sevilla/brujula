#!/usr/bin/env node
// plugin/scripts/doctor.mjs
// Usage: node doctor.mjs <plugin-root> <plugin-data> [marketplace-url]
// Prints a JSON array of checks { name, ok, detail, fix } on stdout. Exit 1 if any check fails.
// Paths come as arguments: commands run from a skill do not inherit CLAUDE_PLUGIN_ROOT/DATA.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_MARKETPLACE = "https://github.com/Alexis86Sevilla/brujula.git";
const [root, data, url = DEFAULT_MARKETPLACE] = process.argv.slice(2);
if (!root || !data) {
  console.error("usage: doctor.mjs <plugin-root> <plugin-data> [marketplace-url]");
  process.exit(2);
}

const checks = [];
const check = (name, ok, detail, fix) => checks.push({ name, ok, detail, fix: ok ? "" : fix });

// 1. Node 22 or newer (the bundled server targets node22 and uses node:sqlite).
const major = Number(process.versions.node.split(".")[0]);
check("node-version", major >= 22, `node ${process.versions.node}`, "nvm install 22 && nvm alias default 22");

// 2. The marketplace can be cloned without prompts (that is how Claude Code runs git).
const git = spawnSync("git", ["ls-remote", url, "HEAD"], {
  encoding: "utf8",
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  timeout: 20_000,
});
check(
  "marketplace-git",
  git.status === 0 && /^[0-9a-f]{40}\s+HEAD/m.test(git.stdout),
  git.status === 0 ? `reachable: ${url}` : `git ls-remote failed: ${(git.stderr || "timeout").trim().split("\n")[0]}`,
  `configure Git Credential Manager or SSH (docs/credenciales.md), then verify: GIT_TERMINAL_PROMPT=0 git ls-remote "${url}" HEAD`,
);

// 3. Runtime dependencies declared in runtime/package.json are installed in the data dir.
const runtimeFile = join(root, "runtime", "package.json");
let deps = [];
try {
  deps = Object.keys(JSON.parse(readFileSync(runtimeFile, "utf8")).dependencies ?? {});
} catch {
  check("runtime-manifest", false, `cannot read ${runtimeFile}`, "claude plugin update brujula@brujula-equipo");
}
const missing = deps.filter((d) => !existsSync(join(data, "node_modules", d, "package.json")));
check(
  "runtime-deps",
  missing.length === 0,
  deps.length === 0
    ? "no native runtime dependencies"
    : missing.length === 0
      ? `installed: ${deps.join(", ")}`
      : `missing in ${data}: ${missing.join(", ")}`,
  `CLAUDE_PLUGIN_DATA="${data}" node "${join(root, "scripts/start-mcp.mjs")}" --install-only`,
);

console.log(JSON.stringify(checks, null, 2));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
