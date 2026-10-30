import { indexCorpus } from "../src/rag/index-docs.js";

const root = process.env.BRUJULA_ROOT ?? process.cwd();
const dir = process.env.RAG_DIR ?? "docs";
const report = await indexCorpus({ root, dir });
console.log(
  `indexed ${dir}/: ${report.added} added, ${report.updated} updated, ${report.removed} removed, ` +
    `${report.unchanged} unchanged; ${report.chunks} chunks (${report.rejectedChunks} rejected as credential-like)`,
);
