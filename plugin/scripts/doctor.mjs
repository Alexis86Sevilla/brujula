#!/usr/bin/env node
// plugin/scripts/doctor.mjs
// Usage: node doctor.mjs <plugin-root> <plugin-data> [marketplace-url]
// Prints a JSON array of checks { name, ok, detail, fix, skipped? } on stdout. Exit 1 if any check fails.
// Paths come as arguments: commands run from a skill do not inherit CLAUDE_PLUGIN_ROOT/DATA.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MARKETPLACE = "https://github.com/Alexis86Sevilla/brujula.git";
const [root, data, url = DEFAULT_MARKETPLACE] = process.argv.slice(2);
if (!root || !data) {
  console.error("usage: doctor.mjs <plugin-root> <plugin-data> [marketplace-url]");
  process.exit(2);
}

const checks = [];
const check = (name, ok, detail, fix) => checks.push({ name, ok, detail, fix: ok ? "" : fix });
/** A check this environment cannot run: not a failure, but the user must run `how` themselves. */
const skip = (name, detail) => checks.push({ name, ok: true, skipped: true, detail, fix: "" });

// 1. Node 22 or newer (the bundled server targets node22).
const major = Number(process.versions.node.split(".")[0]);
check("node-version", major >= 22, `node ${process.versions.node}`, "nvm install 22 && nvm alias default 22");

// 2. The marketplace can be cloned without prompts (that is how Claude Code runs git).
const git = spawnSync("git", ["ls-remote", "--", url, "HEAD"], {
  encoding: "utf8",
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  timeout: 20_000,
});
const verify = `GIT_TERMINAL_PROMPT=0 git ls-remote "${url}" HEAD`;
// Inside Claude Code's sandbox on WSL, git cannot reach the Windows credential manager: that says
// nothing about the user's real access, so the check is skipped instead of failed.
if (git.status !== 0 && /UtilBindVsockAnyPort|No such device or address/.test(git.stderr ?? "")) {
  skip(
    "marketplace-git",
    `cannot be checked from inside Claude Code's sandbox (no access to your git credentials); run in a terminal: ${verify}`,
  );
} else {
  check(
    "marketplace-git",
    git.status === 0 && /^[0-9a-f]{40}\s+HEAD/m.test(git.stdout),
    git.status === 0 ? `reachable: ${url}` : `git ls-remote failed: ${(git.stderr || "timeout").trim().split("\n")[0]}`,
    `configure Git Credential Manager or SSH (docs/credenciales.md), then verify: ${verify}`,
  );
}

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

// 4. The project says whether it uses pull requests (guard-bash.sh and pr-prep read it). The format
// lives in lib/project-config.sh: shared .claude/brujula.json plus personal .claude/brujula.local.json.
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const config = spawnSync(
  "bash",
  [join(dirname(fileURLToPath(import.meta.url)), "lib", "project-config.sh"), projectDir],
  {
    encoding: "utf8",
  },
);
const declare =
  "run /brujula:configurar, or: mkdir -p .claude && echo '{ \"pullRequests\": true }' > .claude/brujula.local.json" +
  "   # personal, never versioned; .claude/brujula.json shares it with the team; false if there are no pull requests";
if (config.status !== 0) {
  check("pull-requests", false, (config.stderr || "cannot read the project settings").trim(), declare);
} else {
  const usesPrs = JSON.parse(config.stdout).pullRequests;
  check(
    "pull-requests",
    typeof usesPrs === "boolean",
    typeof usesPrs !== "boolean"
      ? `not declared in .claude/brujula.json or .claude/brujula.local.json of ${projectDir}`
      : usesPrs
        ? "this project uses pull requests: pushing to main is blocked"
        : "this project does not use pull requests: pushing to main is allowed",
    declare,
  );
}

console.log(JSON.stringify(checks, null, 2));
process.exit(checks.every((c) => c.ok) ? 0 : 1);
