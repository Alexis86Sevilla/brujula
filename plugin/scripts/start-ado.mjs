#!/usr/bin/env node
// plugin/scripts/start-ado.mjs
// Usage: node start-ado.mjs <package@version> <org> --authentication <method> [server args...]
// Starts the Azure DevOps MCP server with npm's npx, the same way on Windows and Linux/WSL: it runs
// npx-cli.js with this Node, so Windows needs no `cmd /c` wrapper. The login method comes from the
// plugin's userConfig (ado_auth): "interactive" (browser sign-in, the default) or "azcli".
// BRUJULA_ADO_DRY_RUN=1 prints the resolved command as JSON instead of running it (tests).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const METHODS = ["interactive", "azcli"];
const args = process.argv.slice(2);

// An unset userConfig value may arrive empty or as its literal placeholder: use the default.
const at = args.indexOf("--authentication");
if (at !== -1) {
  const method = args[at + 1] ?? "";
  if (!METHODS.includes(method)) {
    if (method && !method.startsWith("${")) {
      console.error(`[brujula] unknown login method "${method}", using interactive (browser)`);
    }
    if (at + 1 < args.length) args[at + 1] = "interactive";
    else args.push("interactive");
  }
}

// npm ships npx-cli.js next to node: <dir>/node_modules on Windows, <dir>/../lib/node_modules elsewhere.
const nodeDir = dirname(process.execPath);
const npxCli = [
  join(nodeDir, "node_modules", "npm", "bin", "npx-cli.js"),
  join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
].find(existsSync);

const command = npxCli ? process.execPath : "npx";
const commandArgs = [...(npxCli ? [npxCli] : []), "-y", ...args];

if (process.env.BRUJULA_ADO_DRY_RUN === "1") {
  console.log(JSON.stringify({ command, args: commandArgs }));
  process.exit(0);
}

// stdout carries the MCP protocol: inherit every stream untouched.
const child = spawn(command, commandArgs, { stdio: "inherit", shell: !npxCli && process.platform === "win32" });
child.on("error", (err) => {
  console.error(`[brujula] cannot start the Azure DevOps server: ${err.message}`);
  process.exit(1);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
