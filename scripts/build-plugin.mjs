// scripts/build-plugin.mjs
// Bundles the MCP server into plugin/dist/ and writes plugin/runtime/package.json.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Packages with native binaries: installed at first run by the launcher, never bundled.
// Brujula's search runs on node:sqlite (built into Node 22), so this list is empty today.
const NATIVE = [];

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const runtime = Object.fromEntries(
  Object.entries({ ...pkg.dependencies, ...pkg.optionalDependencies }).filter(([name]) => NATIVE.includes(name)),
);

await build({
  // src/mcp/main.ts starts the server (serveStdio); server.ts only exports createServer.
  entryPoints: { server: "src/mcp/main.ts" },
  outdir: "plugin/dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: Object.keys(runtime),
  // Some bundled CommonJS dependencies call require() at runtime.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "warning",
});

mkdirSync("plugin/runtime", { recursive: true });
writeFileSync(
  "plugin/runtime/package.json",
  JSON.stringify({ name: "brujula-runtime", private: true, type: "module", dependencies: runtime }, null, 2) + "\n",
);
console.error(`built plugin/dist/server.mjs; runtime deps: ${Object.keys(runtime).join(", ") || "(none)"}`);
