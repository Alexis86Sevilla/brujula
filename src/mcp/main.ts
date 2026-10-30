import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createSearchFn } from "../rag/search.js";
import { createServer } from "./server.js";

const root = process.env.BRUJULA_ROOT ?? process.cwd();
const search = createSearchFn(root);

// stdout belongs to the protocol. Log ONLY to stderr.
serveStdio(() => createServer({ root, search }), {
  onerror: (error) => console.error("brujula MCP error:", error),
});
console.error(`brujula MCP server on stdio (root: ${root})`);
