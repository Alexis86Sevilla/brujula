import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createServer } from "./server.js";

const root = process.env.BRUJULA_ROOT ?? process.cwd();

// stdout belongs to the protocol. Log ONLY to stderr.
serveStdio(() => createServer({ root }), {
  onerror: (error) => console.error("brujula MCP error:", error),
});
console.error(`brujula MCP server on stdio (root: ${root})`);
