import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { listTopics, readTopic } from "./conventions.js";

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true as const });

/** A factory: serveStdio may call it more than once, so it must return a NEW McpServer each time. */
export function createServer(root: string = process.cwd()): McpServer {
  const server = new McpServer({ name: "brujula", version: "0.1.0" });

  server.registerTool(
    "brujula_conventions",
    {
      title: "Team conventions",
      description:
        "Returns the team's coding and workflow conventions (the rules files of this repo). " +
        "Call without 'topic' to list the available topics, then call again with one of them. " +
        "Use it BEFORE writing code in an area you have not touched in this session.",
      inputSchema: z.object({
        topic: z.string().optional().describe("Topic name from the list, e.g. 'claude-md' or 'mcp'. Omit to list topics."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ topic }) => {
      const topics = await listTopics(root);
      if (!topic) return text(`Available topics: ${topics.join(", ")}`);
      const body = await readTopic(root, topic);
      if (body === null) {
        return fail(`Unknown topic '${topic}'. Valid topics: ${topics.join(", ")}. Call again with one of them.`);
      }
      return text(body);
    },
  );

  return server;
}