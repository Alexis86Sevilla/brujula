import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer, stubSearch } from "./server.js";

const root = process.env.BRUJULA_ROOT ?? process.cwd();

// stdout belongs to the protocol. Log ONLY to stderr.
serveStdio(() => createServer({ root, search: stubSearch }), {
  onerror: (error) => console.error("brujula MCP error:", error),
});
console.error(`brujula MCP server on stdio (root: ${root})`);
