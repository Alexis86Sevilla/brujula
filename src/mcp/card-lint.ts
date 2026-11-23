import { CARD_SECTIONS, LEGACY_SECTIONS } from "./standard.js";

export interface LintResult {
  ok: boolean;
  /** Ids (from CARD_SECTIONS) of required sections with no heading (or no footer line). */
  missing: string[];
  /** Ids of sections whose heading exists but whose body has no content. */
  empty: string[];
  /** Ids (from LEGACY_SECTIONS) of old heavy-format headings found in the card. */
  legacy: string[];
  /** True when "Hecho cuando" has 2-6 list items. */
  criteria: boolean;
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
const LEGACY_BY_HEADING = new Map<string, string>(
  [...LEGACY_SECTIONS].flatMap(([id, headings]) => headings.map((h) => [normalise(h), id] as const)),
);

/** True when the line is the footer: "Fuera de alcance: … · Estimación: … · Dependencias: …". */
function isFooter(line: string): boolean {
  const plain = normalise(line.replace(/[*_]/g, ""));
  const at = ["fuera de alcance:", "estimacion:", "dependencias:"].map((k) => plain.indexOf(k));
  return at.every((i) => i >= 0) && at[0]! < at[1]! && at[1]! < at[2]!;
}

/** Pure card linter: checks structure only (required sections present and filled, 2-6 criteria). */
export function lintCard(markdown: string): LintResult {
  const bodies = new Map<string, string[]>();
  const legacy: string[] = [];
  let inFence = false;
  let current: string[] | null = null;
  let seenH1 = false;

  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,2})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m?.[1] === "#") {
      current = null;
      if (!seenH1) {
        seenH1 = true;
        bodies.set("title", [m[2] ?? ""]);
      }
    } else if (m) {
      const heading = normalise(m[2] ?? "");
      const id = ID_BY_HEADING.get(heading);
      const old = LEGACY_BY_HEADING.get(heading);
      if (old && !legacy.includes(old)) legacy.push(old);
      if (id && id !== "title" && id !== "footer" && !bodies.has(id)) {
        current = [];
        bodies.set(id, current);
      } else {
        current = null;
      }
    } else if (!bodies.has("footer") && isFooter(line)) {
      bodies.set("footer", [line]);
    } else if (current) {
      current.push(line);
    }
  }

  const missing: string[] = [];
  const empty: string[] = [];
  for (const s of CARD_SECTIONS) {
    const body = bodies.get(s.id);
    if (!body) {
      if (s.required) missing.push(s.id);
    } else if (body.join("\n").trim() === "") empty.push(s.id);
  }

  const done = bodies.get("done-when") ?? [];
  const items = done.filter((l) => /^([-*+]|\d+[.)])\s+\S/.test(l)).length;
  const criteria = items >= 2 && items <= 6;

  return {
    ok: missing.length === 0 && empty.length === 0 && legacy.length === 0 && criteria,
    missing,
    empty,
    legacy,
    criteria,
  };
}
