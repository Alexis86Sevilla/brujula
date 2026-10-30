/** Contract every chunk must fulfil: without source and lines there is no verifiable citation. */
export interface Chunk {
  /** Path relative to the corpus root, with forward slashes. */
  source: string;
  /** Heading breadcrumb, e.g. "Deploy > Rollback". Empty string before the first heading. */
  heading: string;
  /** 1-based, inclusive. */
  startLine: number;
  /** 1-based, inclusive. */
  endLine: number;
  text: string;
}

export interface SearchHit {
  source: string;
  heading: string;
  startLine: number;
  endLine: number;
  /** Higher is better (negated BM25). */
  score: number;
  text: string;
}

export type SearchFn = (query: string, limit: number) => Promise<SearchHit[]>;
