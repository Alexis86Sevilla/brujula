#!/usr/bin/env node
// plugin/scripts/doctor.mjs
// Usage: node doctor.mjs <plugin-root> <plugin-data> [marketplace-url]
// Prints a JSON array of checks { name, ok, detail, fix, skipped? } on stdout. Exit 1 if any check fails.
// Paths come as arguments: commands run from a skill do not inherit CLAUDE_PLUGIN_ROOT/DATA.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
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

// 1b. The Azure CLI is optional: the default login is the browser (userConfig ado_auth). It is only
// reported, never failed, because the chosen method is not readable from here. The login itself is
// not checked either: inside Claude Code's sandbox az cannot read ~/.azure and always says to log in.
const onPath = (tool) => spawnSync("bash", ["-c", `command -v ${tool}`], { encoding: "utf8" }).status === 0;
check(
  "azure-cli",
  true,
  onPath("az")
    ? "Azure CLI installed (used by the azcli login)"
    : "Azure CLI not installed: not needed with the browser login (the default); only if you chose azcli, install it and run az login (https://learn.microsoft.com/cli/azure/install-azure-cli)",
  "",
);

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

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// 4. The installed plugin is the marketplace's version. The marketplace is pinned to a tag: Claude
// Code copies the project's tag (.claude/settings.json) to its registry only when it starts, and
// `marketplace update` refreshes the registered tag, so the order of the update steps matters.
const MARKETPLACE = "brujula-equipo";
const readJsonOr = (file, fallback) => {
  try {
    const value = JSON.parse(readFileSync(file, "utf8"));
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
  }
};
const versionOf = (pluginDir) => readJsonOr(join(pluginDir, ".claude-plugin", "plugin.json"), {}).version;
const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
const known = readJsonOr(join(configDir, "plugins", "known_marketplaces.json"), {})[MARKETPLACE];
const update =
  `claude plugin update brujula@${MARKETPLACE} --scope user && claude plugin update brujula@${MARKETPLACE} --scope project` +
  "   # then close Claude and open it again";
if (!known || typeof known.installLocation !== "string") {
  skip("plugin-version", `not installed from the ${MARKETPLACE} marketplace: nothing to compare`);
} else {
  const knownRef = known.source?.ref;
  const projectRef = readJsonOr(join(projectDir, ".claude", "settings.json"), {}).extraKnownMarketplaces?.[MARKETPLACE]
    ?.source?.ref;
  const entry = (readJsonOr(join(known.installLocation, ".claude-plugin", "marketplace.json"), {}).plugins ?? []).find(
    (p) => p?.name === "brujula",
  );
  const marketVersion =
    typeof entry?.source === "string" ? versionOf(join(known.installLocation, entry.source)) : undefined;
  const installed = versionOf(root);
  if (projectRef && knownRef && projectRef !== knownRef) {
    check(
      "plugin-version",
      false,
      `this project asks for the marketplace at ${projectRef}, but Claude Code still has ${knownRef} registered`,
      `close Claude and open it again in this project, then run in a terminal: claude plugin marketplace update ${MARKETPLACE} && ${update}`,
    );
  } else if (!marketVersion || !installed) {
    skip("plugin-version", `cannot read the installed or the marketplace version (installed: ${installed ?? "?"})`);
  } else {
    check(
      "plugin-version",
      installed === marketVersion,
      installed === marketVersion
        ? `installed ${installed}, the marketplace's version`
        : `installed ${installed}, but the marketplace has ${marketVersion}`,
      update,
    );
  }
}

// 5. The project says whether it uses pull requests (guard-bash.sh and pr-prep read it). The format
// lives in lib/project-config.sh: shared .claude/brujula.json plus personal .claude/brujula.local.json.
const inRepo =
  spawnSync("git", ["-C", projectDir, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" }).status === 0;
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
if (!inRepo) {
  // A folder that is not a code project (a PM's documents, say): there is nothing to push.
  skip("pull-requests", `not a code project (no git repository in ${projectDir}): nothing to declare`);
} else if (config.status !== 0) {
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
