import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { closeDb, openDb } from "../src/rag/db.js";
import { defaultDbPath } from "../src/rag/index-docs.js";
import { searchDocs } from "../src/rag/search.js";

const caseSchema = z.array(
  z.object({
    question: z.string(),
    /** Source file that must appear in the top k; null = the docs do NOT cover it (must abstain). */
    expected: z.string().nullable(),
  }),
);

const root = process.env.BRUJULA_ROOT ?? process.cwd();
const file = process.argv[2] ?? "eval/rag-cases.json";
const k = Number(process.env.EVAL_K ?? 5);
const minHit = Number(process.env.EVAL_MIN_HIT ?? 0.8);
const minAbstain = Number(process.env.EVAL_MIN_ABSTAIN ?? 1);

const dbPath = defaultDbPath(root);
if (!existsSync(dbPath)) {
  console.error("No index found. Run `npm run rag:index` first.");
  process.exit(2);
}
const cases = caseSchema.parse(JSON.parse(readFileSync(file, "utf8")));
const db = openDb(dbPath, { readOnly: true });

let answerable = 0;
let hit = 0;
let unanswerable = 0;
let abstained = 0;
for (const c of cases) {
  const results = searchDocs(db, c.question, { limit: k });
  const top = results[0];
  const score = top ? top.score.toFixed(2) : "-";
  if (c.expected === null) {
    unanswerable++;
    const ok = results.length === 0;
    if (ok) abstained++;
    console.log(
      `${ok ? "OK  " : "FAIL"} abstain  ${c.question}${ok ? "" : `  (returned ${top?.source}, score ${score})`}`,
    );
  } else {
    answerable++;
    const rank = results.findIndex((r) => r.source === c.expected);
    if (rank >= 0) hit++;
    console.log(
      `${rank >= 0 ? "OK  " : "FAIL"} hit@${k}    ${c.question}  (rank ${rank >= 0 ? rank + 1 : "none"}, best score ${score})`,
    );
  }
}
closeDb(db);

const hitRate = answerable ? hit / answerable : 1;
const abstainRate = unanswerable ? abstained / unanswerable : 1;
console.log(`hit@${k}: ${hit}/${answerable} = ${hitRate.toFixed(2)} (min ${minHit})`);
console.log(`abstention accuracy: ${abstained}/${unanswerable} = ${abstainRate.toFixed(2)} (min ${minAbstain})`);
process.exit(hitRate >= minHit && abstainRate >= minAbstain ? 0 : 1);
