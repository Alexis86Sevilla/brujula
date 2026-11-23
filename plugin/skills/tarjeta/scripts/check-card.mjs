#!/usr/bin/env node
// Validates a work item ("tarjeta") written in markdown against the Brújula quality standard.
// Usage: node check-card.mjs <file.md>        -> JSON on stdout, exit 0 (valid) or 1 (invalid)
//        cat card.md | node check-card.mjs -  -> same, reading stdin
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// [normalised heading, label, required]
const SECTIONS = [
  ["por que", "Por qué", true],
  ["que cambia", "Qué cambia", true],
  ["como", "Cómo", false],
  ["hecho cuando", "Hecho cuando", true],
  ["riesgo", "Riesgo", false],
];
const ALIASES = new Map([["riesgos", "riesgo"]]);
// Headings of the old heavy format and where their content goes now.
const LEGACY = new Map([
  ["historia", ["Historia", "## Por qué"]],
  ["contexto", ["Contexto", "## Por qué"]],
  ["criterios de aceptacion", ["Criterios de aceptación", "## Hecho cuando"]],
  ["definicion de hecho", ["Definición de hecho", "## Hecho cuando"]],
  ["fuera de alcance", ["Fuera de alcance", "the footer line"]],
  ["estimacion", ["Estimación", "the footer line"]],
  ["dependencias", ["Dependencias", "the footer line"]],
]);
const FOOTER_LABELS = [
  ["fuera de alcance", "Fuera de alcance"],
  ["estimacion", "Estimación"],
  ["dependencias", "Dependencias"],
];
const FOOTER_HINT = "**Fuera de alcance:** … · **Estimación:** … · **Dependencias:** …";
const SIZES = new Set(["xs", "s", "m", "l", "xl", "1", "2", "3", "5", "8", "13"]);
// TODO/TBD are case-sensitive: "todo" is an everyday Spanish word.
const PLACEHOLDER = /(<[^>\n]+>|\bTODO\b|\bTBD\b|\b[Ll][Oo][Rr][Ee][Mm]\b)/;
const ITEM = /^([-*+]|\d+[.)])\s+\S/;

/** Text without inline code, where values like `VAR=<new>` are legitimate. */
const prose = (s) => s.replace(/`[^`\n]*`/g, "");

/** Returns { out, est, dep } when the line is the footer, else null. */
function parseFooter(line) {
  const plain = norm(line.replace(/[*_]/g, ""));
  const at = FOOTER_LABELS.map(([key]) => plain.indexOf(`${key}:`));
  if (at.some((i) => i < 0) || !(at[0] < at[1] && at[1] < at[2])) return null;
  const value = (k) => {
    const start = at[k] + FOOTER_LABELS[k][0].length + 1;
    const end = k < 2 ? at[k + 1] : plain.length;
    return plain.slice(start, end).replace(/[·|]\s*$/, "").trim();
  };
  return [value(0), value(1), value(2)];
}

export function checkCard(markdown) {
  const errors = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  // Split into H1 + H2 sections, ignoring headings and the footer inside code fences.
  let inFence = false;
  const h1 = [];
  const sections = new Map();
  const legacy = [];
  let footer = null;
  let footerLine = "";
  let current = null;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{1,2})\s+(.+?)\s*$/.exec(line);
    const f = !m && footer === null ? parseFooter(line) : null;
    if (m && m[1] === "#") {
      h1.push(m[2]);
      current = null;
    } else if (m) {
      const key = norm(m[2]);
      current = ALIASES.get(key) ?? key;
      if (LEGACY.has(current)) legacy.push(current);
      sections.set(current, []);
    } else if (f) {
      footer = f;
      footerLine = line;
    } else if (current !== null) {
      sections.get(current).push(line);
    }
  }

  if (h1.length !== 1) errors.push(`expected exactly one H1 title, found ${h1.length}`);
  else {
    const t = h1[0];
    if (t.length < 8 || t.length > 100) errors.push("title must be 8-100 characters");
    if (PLACEHOLDER.test(prose(t))) errors.push("title contains a placeholder");
  }

  for (const key of legacy) {
    const [label, use] = LEGACY.get(key);
    errors.push(`old-format section: ## ${label} (use ${use})`);
  }

  for (const [key, label, required] of SECTIONS) {
    const body = sections.get(key);
    if (!body) {
      if (required) errors.push(`missing section: ## ${label}`);
      continue;
    }
    const text = body.join("\n").trim();
    if (text === "") errors.push(`empty section: ## ${label}`);
    else if (PLACEHOLDER.test(prose(text))) errors.push(`placeholder left in section: ## ${label}`);
  }

  const why = sections.get("por que");
  if (why) {
    const n = why.filter((l) => l.trim() !== "").length;
    if (n > 4) errors.push(`## Por qué must be at most 4 lines, found ${n}`);
  }

  const done = sections.get("hecho cuando");
  if (done) {
    const n = done.filter((l) => ITEM.test(l)).length;
    if (n < 2 || n > 6) errors.push(`## Hecho cuando needs 2-6 checkable items, found ${n}`);
  }

  const risk = sections.get("riesgo");
  if (risk) {
    const items = risk.filter((l) => ITEM.test(l));
    const units = items.length > 0 ? items : [risk.join(" ")];
    if (units.some((u) => !/\bmitigaci[oó]n\b|\bmitigation\b/i.test(u)))
      errors.push('## Riesgo: every risk needs its mitigation ("mitigación: ...")');
  }

  if (!footer) errors.push(`missing footer line: ${FOOTER_HINT}`);
  else {
    FOOTER_LABELS.forEach(([, label], i) => {
      if (footer[i] === "") errors.push(`footer: empty value for ${label}`);
    });
    if (PLACEHOLDER.test(prose(footerLine))) errors.push("placeholder left in footer line");
    const words = footer[1].split(/[\s:,.;()]+/).filter(Boolean);
    if (footer[1] !== "" && !words.some((w) => SIZES.has(w)))
      errors.push("footer: Estimación must contain a size: XS, S, M, L, XL or 1/2/3/5/8/13");
  }

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
