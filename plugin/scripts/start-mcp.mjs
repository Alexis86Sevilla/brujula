#!/usr/bin/env node
// plugin/scripts/start-mcp.mjs
// Installs native runtime deps (if any) into CLAUDE_PLUGIN_DATA once, then runs the bundled MCP server.
//   start-mcp.mjs                 -> MCP server on stdio (what .mcp.json runs)
//   start-mcp.mjs --install-only  -> install dependencies and exit
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.env.CLAUDE_PLUGIN_ROOT ?? dirname(dirname(fileURLToPath(import.meta.url)));
const data = process.env.CLAUDE_PLUGIN_DATA ?? join(root, ".data"); // fallback for local runs
const log = (msg) => console.error(`[brujula] ${msg}`); // stdout is reserved for JSON-RPC
const [mode] = process.argv.slice(2);

mkdirSync(data, { recursive: true });
const runtimeFile = join(root, "runtime", "package.json");
const runtimeJson = readFileSync(runtimeFile, "utf8");
const deps = Object.keys(JSON.parse(runtimeJson).dependencies ?? {});
// Native modules are built per Node ABI, so the ABI is part of the stamp.
const stamp = join(
  data,
  `.deps-${createHash("sha256").update(runtimeJson).update(process.versions.modules).digest("hex").slice(0, 12)}`,
);

if (deps.length > 0 && !existsSync(stamp)) {
  log(`installing ${deps.join(", ")} into ${data} (first run, can take a few minutes)`);
  copyFileSync(runtimeFile, join(data, "package.json"));
  const res = spawnSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--prefix", data], {
    stdio: ["ignore", 2, 2], // npm stdout goes to stderr
  });
  if (res.status !== 0) {
    log("npm install failed; see output above");
    process.exit(1);
  }
  writeFileSync(stamp, new Date().toISOString());
}

// Run the bundle next to node_modules so ESM resolution finds the native packages.
copyFileSync(join(root, "dist", "server.mjs"), join(data, "server.mjs"));

if (mode === "--install-only") {
  log("dependencies ready");
  process.exit(0);
}

const child = spawn(process.execPath, [join(data, "server.mjs")], {
  stdio: "inherit",
  // The project is the working directory; state lives in CLAUDE_PLUGIN_DATA (survives plugin updates).
  cwd: process.env.BRUJULA_ROOT ?? process.cwd(),
  env: process.env,
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
