export interface WalkOptions {
  /** Directory names to skip at any depth. Default: [".git", ".attachments", "node_modules"]. */
  ignoreDirs?: string[];
}

export async function findMarkdownFiles(_root: string, _opts: WalkOptions = {}): Promise<string[]> {
  throw new Error("not implemented");
}
