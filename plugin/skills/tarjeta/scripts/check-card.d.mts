// Types for check-card.mjs, so src/mcp/card-lint.ts and the tests can import it.
export interface CardCheck {
  ok: boolean;
  /** Human-readable problems, one per rule broken; empty when ok. */
  errors: string[];
}

export function checkCard(markdown: string): CardCheck;
