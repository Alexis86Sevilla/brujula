import { describe, expect, it } from "vitest";
import { chunkId } from "../../src/ingest/chunk-id.js";
import type { Chunk } from "../../src/ingest/types.js";

const base: Chunk = {
  docPath: "Guias/Despliegue.md",
  headingPath: ["Guía", "Instalar"],
  text: "## Instalar\n\nPaso uno.",
  startLine: 5,
  endLine: 7,
};

describe("chunkId", () => {
  it("is a 16-char lowercase hex string", () => {
    expect(chunkId(base)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic", () => {
    expect(chunkId({ ...base })).toBe(chunkId(base));
  });

  it("does not change when only the line numbers change (an unrelated edit above)", () => {
    expect(chunkId({ ...base, startLine: 40, endLine: 42 })).toBe(chunkId(base));
  });

  it("changes when the text, the path or the heading path change", () => {
    const ids = new Set([
      chunkId(base),
      chunkId({ ...base, text: base.text + "!" }),
      chunkId({ ...base, docPath: "Otra.md" }),
      chunkId({ ...base, headingPath: ["Guía", "Usar"] }),
    ]);
    expect(ids.size).toBe(4);
  });

  it("does not confuse ['a b'] with ['a','b']", () => {
    expect(chunkId({ ...base, headingPath: ["a b"] })).not.toBe(chunkId({ ...base, headingPath: ["a", "b"] }));
  });
});
