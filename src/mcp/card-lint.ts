import { CARD_SECTIONS } from "./standard.js";

export interface LintResult {
  ok: boolean;
  /** Ids (from CARD_SECTIONS) of sections with no heading. */
  missing: string[];
  /** Ids of sections whose heading exists but whose body has no content. */
  empty: string[];
  /** True when the acceptance criteria have at least one full Given/When/Then (or Dado/Cuando/Entonces) criterion. */
  gwt: boolean;
}

const normalise = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s:.#]+$/g, "")
    .trim();

const ID_BY_HEADING = new Map<string, string>(
  CARD_SECTIONS.flatMap((s) => [s.name, ...s.aliases].map((h) => [normalise(h), s.id] as const)),
);

const GWT_SETS = [
  [/\bgiven\b/, /\bwhen\b/, /\bthen\b/],
  [/\bdado\b/, /\bcuando\b/, /\bentonces\b/],
];

/** Splits criteria into list items (with continuation lines) or paragraphs. */
function criteria(body: string[]): string[] {
  const items: string[] = [];
  let open = false; // true while continuation lines may extend the last item
  for (const line of body) {
    if (line.trim() === "") {
      open = false;
    } else if (open && !/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      items[items.length - 1] += ` ${line}`;
    } else {
      items.push(line);
      open = true;
    }
  }
  return items;
}

/** Pure card linter: checks structure only (sections present, non-empty, Given/When/Then). */
export function lintCard(markdown: string): LintResult {
  const bodies = new Map<string, string[]>();
  let inFence = false;
  let current: string[] | null = null;
  let seenH1 = false;

  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const m = inFence ? null : /^(#{1,2})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m?.[1] === "#") {
      current = null;
      if (!seenH1) {
        seenH1 = true;
        bodies.set("title", [m[2] ?? ""]);
      }
    } else if (m) {
      const id = ID_BY_HEADING.get(normalise(m[2] ?? ""));
      if (id && id !== "title" && !bodies.has(id)) {
        current = [];
        bodies.set(id, current);
      } else {
        current = null;
      }
    } else if (current) {
      current.push(line);
    }
  }

  const missing: string[] = [];
  const empty: string[] = [];
  for (const s of CARD_SECTIONS) {
    const body = bodies.get(s.id);
    if (!body) missing.push(s.id);
    else if (body.join("\n").trim() === "") empty.push(s.id);
  }

  let gwt = true;
  const ac = bodies.get("acceptance-criteria");
  if (ac) {
    gwt = criteria(ac).some((c) => {
      const lower = c.toLowerCase();
      return GWT_SETS.some((set) => set.every((re) => re.test(lower)));
    });
  }
  // Missing or empty criteria cannot satisfy Given/When/Then.
  if (!ac || ac.join("").trim() === "") gwt = false;

  return { ok: missing.length === 0 && empty.length === 0 && gwt, missing, empty, gwt };
}
