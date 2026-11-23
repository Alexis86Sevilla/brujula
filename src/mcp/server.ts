import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { createAdr } from "./adr.js";
import { lintCard } from "./card-lint.js";
import { listTopics, readTopic } from "./conventions.js";
import { CARD_STANDARD } from "./standard.js";

/** Must equal "version" in plugin/.claude-plugin/plugin.json (test/server.test.ts checks it). */
export const SERVER_VERSION = "0.3.1";

/** Max characters accepted by brujula_card_lint; checked in the handler so the error can guide the model. */
export const MAX_CARD_CHARS = 100_000;

export interface ServerDeps {
  root: string;
}

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const fail = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true as const });

/** A factory: serveStdio may call it more than once, so it must return a NEW McpServer each time. */
export function createServer(deps: ServerDeps = { root: process.cwd() }): McpServer {
  const server = new McpServer(
    { name: "brujula", version: SERVER_VERSION },
    {
      instructions:
        "Brujula: team toolkit. Use brujula_conventions before coding in an unfamiliar area, brujula_adr_create only when the user has decided something, " +
        "brujula_card_lint whenever the user asks to review or check a work item or card draft.",
    },
  );

  server.registerTool(
    "brujula_conventions",
    {
      title: "Team conventions",
      description:
        "Returns the team's coding and workflow conventions (the rules files of this repo). " +
        "Call without 'topic' to list the available topics, then call again with one of them. " +
        "Use it BEFORE writing code in an area you have not touched in this session.",
      inputSchema: z.object({
        topic: z
          .string()
          .optional()
          .describe("Topic name from the list, e.g. 'claude-md' or 'mcp-server'. Omit to list topics."),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ topic }) => {
      const topics = await listTopics(deps.root);
      if (!topic) return text(`Available topics: ${topics.join(", ")}`);
      const body = await readTopic(deps.root, topic);
      if (body === null) {
        return fail(`Unknown topic '${topic}'. Valid topics: ${topics.join(", ")}. Call again with one of them.`);
      }
      return text(body);
    },
  );

  server.registerTool(
    "brujula_adr_create",
    {
      title: "Create an ADR",
      description:
        "Writes a new Architecture Decision Record to docs/adr/NNNN-slug.md and returns its path. " +
        "Only call it when the user has explicitly decided something worth recording. " +
        "Never edits existing ADRs. If a decision replaces an older one, say so in 'context'.",
      inputSchema: z.object({
        title: z.string().min(5).max(100).describe("Short imperative title, e.g. 'Publish the plugin from a git tag'"),
        context: z.string().min(20).describe("The forces at play: problem, constraints, alternatives considered"),
        decision: z.string().min(10).describe("What was decided, in one or two sentences, active voice"),
        consequences: z.string().min(10).describe("What gets easier, what gets harder, what to revisit"),
        status: z.enum(["proposed", "accepted"]).default("proposed"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (input) => {
      try {
        const path = await createAdr(deps.root, input);
        return text(`Created ${path}. Show it to the user and ask them to review before committing.`);
      } catch (e) {
        return fail(`Could not create the ADR: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "brujula_card_lint",
    {
      title: "Lint a work item card",
      description:
        "Checks a work item (tarjeta) draft in Markdown against the team card standard, with the same rules as the " +
        "tarjeta skill: one H1 title, required sections (Por qué, Qué cambia, Hecho cuando) present and filled, " +
        "Por qué in at most 4 lines, 2-6 criteria in Hecho cuando, a mitigation for every risk, the footer line " +
        "(Fuera de alcance · Estimación with a size · Dependencias), no placeholders and no old heavy-format headings. " +
        "Call it whenever the user asks to review, check or validate a card, ticket, user story or PBI " +
        "(e.g. 'revisa esta tarjeta', 'valida este work item'), and before refining or publishing one. " +
        "Pass the full card Markdown. Returns every broken rule in 'errors'; it checks form, not whether the content is right " +
        "(for that, use the refinador agent).",
      inputSchema: z.strictObject({
        markdown: z
          .string()
          .describe("The full card as Markdown: H1 title and H2 sections, English or Spanish headings"),
      }),
      outputSchema: z.object({
        ok: z.boolean().describe("True when the card breaks no rule (errors is empty)"),
        missing: z.array(z.string()).describe("Ids of required sections with no heading (or no footer line)"),
        empty: z.array(z.string()).describe("Ids of sections whose heading has no content"),
        legacy: z
          .array(z.string())
          .describe("Ids of old heavy-format headings (Historia, Definición de hecho...) to merge into the new ones"),
        criteria: z.boolean().describe("True when Hecho cuando has 2-6 checkable items"),
        errors: z.array(z.string()).describe("Every rule the card breaks, one sentence each, ready to show the user"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ markdown }) => {
      if (markdown.length > MAX_CARD_CHARS) {
        return fail(
          `The card is ${markdown.length} characters; the limit is ${MAX_CARD_CHARS}. ` +
            "A work item should be far smaller: send only the card, or split it into smaller cards, and call again.",
        );
      }
      const result = lintCard(markdown);
      const summary = result.ok
        ? "Card OK: it follows the card standard."
        : [
            "Card NOT ready.",
            result.legacy.length ? `Old-format sections to merge into the new ones: ${result.legacy.join(", ")}.` : "",
            ...result.errors.map((e) => `- ${e}`),
          ]
            .filter(Boolean)
            .join("\n");
      return { content: [{ type: "text" as const, text: summary }], structuredContent: result };
    },
  );

  server.registerResource(
    "card-standard",
    "brujula://standard/card",
    {
      title: "Work item quality standard",
      description: "The sections every work item must have",
      mimeType: "text/markdown",
    },
    async (uri) => ({ contents: [{ uri: uri.href, text: CARD_STANDARD }] }),
  );

  server.registerResource(
    "rules",
    new ResourceTemplate("brujula://rules/{topic}", {
      list: async () => ({
        resources: (await listTopics(deps.root)).map((t) => ({ uri: `brujula://rules/${t}`, name: `Rules: ${t}` })),
      }),
    }),
    { title: "Team rules", description: "One rules file per topic", mimeType: "text/markdown" },
    async (uri, { topic }) => {
      const body = await readTopic(deps.root, String(topic));
      if (body === null) throw new Error(`Unknown topic '${String(topic)}'`);
      return { contents: [{ uri: uri.href, text: body }] };
    },
  );

  server.registerPrompt(
    "refinar_tarjeta",
    {
      title: "Refine a work item",
      description: "Turns a rough idea or an existing card into a card that meets the team standard",
      argsSchema: z.object({
        idea: z.string().describe("The rough idea, or the current card text"),
      }),
    },
    ({ idea }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Refine this into a work item that meets the standard below. ` +
              `List what is missing or ambiguous BEFORE writing the card, and ask me only about real gaps. ` +
              `Do not invent facts about the system.\n\n${CARD_STANDARD}\n\n## Input\n${idea}`,
          },
        },
      ],
    }),
  );

  return server;
}
