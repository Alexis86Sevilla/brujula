import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const MAX_CHARS = 8_000;

/** Topics = basenames of .claude/rules/*.md, plus "claude-md" for the root CLAUDE.md. */
export async function listTopics(root: string): Promise<string[]> {
  let files: string[] = [];
  try {
    files = await readdir(join(root, ".claude", "rules"));
  } catch {
    // no rules directory yet
  }
  const topics = files.filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
  return ["claude-md", ...topics.sort()];
}

/** Returns the content of a topic, or null if it is not a known topic.
 *  The topic is matched against the directory listing, never joined into a path directly. */
export async function readTopic(root: string, topic: string): Promise<string | null> {
  const known = await listTopics(root);
  if (!known.includes(topic)) return null;
  const file = topic === "claude-md" ? join(root, "CLAUDE.md") : join(root, ".claude", "rules", `${topic}.md`);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return null;
  }
  return text.length > MAX_CHARS
    ? `${text.slice(0, MAX_CHARS)}\n\n[truncated at ${MAX_CHARS} characters; open ${file} for the rest]`
    : text;
}