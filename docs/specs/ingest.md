# Ingest: markdown loader and chunker

## Goal
Turn a folder of markdown pages (the team wiki) into chunks that can later be embedded
and cited. A citation must point to a file, a heading path and a line range.

## Non-goals
- No embeddings, no storage, no CLI. Those come in later modules.
- No HTML.

## Types
See `src/ingest/types.ts`: `MarkdownDoc` and `Chunk`.

## loadMarkdown(path): Promise<MarkdownDoc>
- Reads UTF-8, normalizes CRLF to LF.
- Parses YAML frontmatter. `body` is the file without the frontmatter block.
- `bodyStartLine` is the 1-based file line where `body` starts (1 without frontmatter).
- `title`: frontmatter `title` (non-empty string) > first `# ` heading outside code fences > file name without extension.
- Invalid frontmatter rejects with `Invalid frontmatter in <path>: ...`. It must reject every time, not only the first.

## chunkMarkdown(doc, { maxChars = 800, overlapLines = 2 }): Chunk[]
- A new section starts at every ATX heading (`#` to `######`) outside fenced code blocks (``` or ~~~).
- `headingPath` is the stack of heading titles; a heading pops every entry of the same or deeper level.
- Text before the first heading is a section with `headingPath = []`.
- A section with no content besides its own heading line produces no chunk.
- A section is split into blocks (paragraph = consecutive non-blank lines; fenced block = one block).
  Blocks are packed greedily while the chunk stays <= `maxChars`. The heading line always stays with the first block.
- A fenced block is never split, even if it exceeds `maxChars`.
- Setext headings: a non-blank, non-fenced line followed by a line of only `=` (level 1) or only `-` (level 2)
  (up to 3 leading spaces, trailing spaces allowed) is a heading; its title is the first line trimmed. The section
  starts at the title line and the heading spans both lines. A `---` line preceded by a blank line (or at body start)
  is a thematic break, not a heading. Lines inside fenced blocks never form headings. A table row (line starting
  with `|`) is never a setext title.
- Tables: consecutive lines whose first non-space character is `|` form one table block, separate from adjacent
  paragraph lines even without a blank line between them. A table block is never split, even if it exceeds
  `maxChars`. Overlap never starts inside a table: if the computed overlap start falls inside a table block, the
  chunk gets no overlap (it starts at its first block).
- `maxChars` counts new content only. Overlap is extra.
- Overlap: a chunk after the first one of a section repeats the last `overlapLines` NON-BLANK lines of the previous chunk:
  walk back from `prev.endLine` counting non-blank lines; `startLine` is the line of the last one counted (blank lines
  between them stay in `text` but are not counted). With `overlapLines = 0` the next chunk starts at its first block.
  A chunk never starts on a blank line: skip leading blank lines. Overlap never crosses a section boundary.
- `startLine`/`endLine` are 1-based, inclusive, relative to the original file, and
  `text` is exactly those lines joined by `\n`, without leading or trailing blank lines.

## findMarkdownFiles(root, { ignoreDirs })
Sorted, root-relative, POSIX-separated paths of `*.md` files (extension case-insensitive).
Default ignored directory names: `.git`, `.attachments`, `node_modules`.

## chunkId(chunk): string
First 16 hex chars of a SHA-256 over `docPath`, `headingPath` and `text`. Line numbers must NOT affect it.