export interface MarkdownDoc {
  /** Path as given to the loader. */
  path: string;
  frontmatter: Record<string, unknown>;
  /** Markdown without the frontmatter block, LF line endings. */
  body: string;
  /** 1-based line of the file where `body` starts. */
  bodyStartLine: number;
  title: string;
}

export interface Chunk {
  docPath: string;
  /** Heading titles from the outermost to the innermost, e.g. ["Guía", "Instalar"]. */
  headingPath: string[];
  text: string;
  /** 1-based, inclusive, relative to the original file. */
  startLine: number;
  endLine: number;
}
