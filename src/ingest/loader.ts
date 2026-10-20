import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import type { MarkdownDoc } from "./types.js";

const frontmatterSchema = z.record(z.string(), z.unknown());

export async function loadMarkdown(path: string): Promise<MarkdownDoc> {
  const raw = await readFile(path, "utf8");
  const source = raw.replace(/\r\n/g, "\n");

  let parsed: { data: unknown; content: string };
  try {
    // Passing options disables gray-matter's cache, which stores the file before
    // parsing and would make a second load of invalid frontmatter succeed.
    parsed = matter(source, {});
  } catch (error) {
    throw new Error(`Invalid frontmatter in ${path}: ${errorMessage(error)}`, {
      cause: error,
    });
  }

  const result = frontmatterSchema.safeParse(parsed.data ?? {});
  if (!result.success) {
    throw new Error(`Invalid frontmatter in ${path}: ${result.error.message}`);
  }
  const frontmatter = result.data;
  const body = parsed.content;
  const header = source.slice(0, source.length - body.length);
  const bodyStartLine = header.split("\n").length;

  return {
    path,
    frontmatter,
    body,
    bodyStartLine,
    title: resolveTitle(frontmatter, body, path),
  };
}

function resolveTitle(frontmatter: Record<string, unknown>, body: string, path: string): string {
  const fromFrontmatter = frontmatter.title;
  if (typeof fromFrontmatter === "string" && fromFrontmatter.trim() !== "") {
    return fromFrontmatter;
  }
  return firstH1(body) ?? basename(path, extname(path));
}

function firstH1(body: string): string | undefined {
  let fence: string | undefined;
  for (const line of body.split("\n")) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (fence === undefined) {
        fence = marker;
      } else if (marker[0] === fence[0] && marker.length >= fence.length) {
        fence = undefined;
      }
      continue;
    }
    if (fence !== undefined) continue;
    const heading = /^# +(.+?)\s*#*\s*$/.exec(line)?.[1];
    if (heading) return heading;
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
