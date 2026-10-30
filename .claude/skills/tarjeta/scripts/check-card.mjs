#!/usr/bin/env node
// Validates a work item ("tarjeta") written in markdown against the Brújula quality standard.
// Usage: node check-card.mjs <file.md>        -> JSON on stdout, exit 0 (valid) or 1 (invalid)
//        cat card.md | node check-card.mjs -  -> same, reading stdin
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const REQUIRED = [
  ["historia", "Historia"],
  ["contexto", "Contexto"],
  ["criterios de aceptacion", "Criterios de aceptación"],
  ["fuera de alcance", "Fuera de alcance"],
  ["definicion de hecho", "Definición de hecho"],
  ["estimacion", "Estimación"],
  ["dependencias", "Dependencias"],
  ["riesgos", "Riesgos"],
];
const SIZES = new Set(["xs", "s", "m", "l", "xl", "1", "2", "3", "5", "8", "13"]);
// TODO/TBD are case-sensitive: "todo" is an everyday Spanish word.
const PLACEHOLDER = /(<[^>\n]+>|\bTODO\b|\bTBD\b|\b[Ll][Oo][Rr][Ee][Mm]\b)/;

export function checkCard(markdown) {
  const errors = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  // Split into H1 + H2 sections, ignoring headings inside code fences.
  let inFence = false;
  const h1 = [];
  const sections = new Map();
  let current = null;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const m = !inFence && /^(#{1,2})\s+(.+?)\s*$/.exec(line);
    if (m && m[1] === "#") {
      h1.push(m[2]);
      current = null;
    } else if (m) {
      current = norm(m[2]);
      sections.set(current, []);
    } else if (current !== null) {
      sections.get(current).push(line);
    }
  }

  if (h1.length !== 1) errors.push(`expected exactly one H1 title, found ${h1.length}`);
  else {
    const t = h1[0];
    if (t.length < 8 || t.length > 100) errors.push("title must be 8-100 characters");
    if (PLACEHOLDER.test(t)) errors.push("title contains a placeholder");
  }

  for (const [key, label] of REQUIRED) {
    const body = sections.get(key);
    if (!body) {
      errors.push(`missing section: ## ${label}`);
      continue;
    }
    const text = body.join("\n").trim();
    if (text === "") errors.push(`empty section: ## ${label}`);
    else if (PLACEHOLDER.test(text)) errors.push(`placeholder left in section: ## ${label}`);
  }

  const ac = sections.get("criterios de aceptacion");
  if (ac) {
    const items = ac.filter((l) => /^\s*([-*]|\d+\.)\s+/.test(l)).map(norm);
    const gwt = items.filter(
      (l) =>
        (/\bdado\b/.test(l) && /\bcuando\b/.test(l) && /\bentonces\b/.test(l)) ||
        (/\bgiven\b/.test(l) && /\bwhen\b/.test(l) && /\bthen\b/.test(l)),
    );
    if (gwt.length < 2) errors.push("## Criterios de aceptación needs at least 2 Dado/Cuando/Entonces scenarios (one per bullet)");
    if (gwt.length < items.length) errors.push("every acceptance criterion must be a full Dado/Cuando/Entonces bullet");
  }

  const est = sections.get("estimacion");
  if (est) {
    const first = norm(est.join(" ").replace(/[*_`]/g, "")).split(/[\s:,.;()]+/).filter(Boolean);
    if (!first.some((w) => SIZES.has(w))) errors.push("## Estimación must contain a size: XS, S, M, L, XL or 1/2/3/5/8/13");
  }

  const dod = sections.get("definicion de hecho");
  if (dod && dod.filter((l) => /^\s*[-*]\s+(\[.\]\s+)?\S/.test(l)).length < 2)
    errors.push("## Definición de hecho needs at least 2 checklist items");

  return { ok: errors.length === 0, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: check-card.mjs <file.md | ->");
    process.exit(2);
  }
  const md = readFileSync(arg === "-" ? 0 : arg, "utf8");
  const result = checkCard(md);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}