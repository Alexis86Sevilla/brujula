import { describe, expect, it } from "vitest";
import { runHook } from "./helpers.js";

const stop = (stop_hook_active = false) => ({ hook_event_name: "Stop", stop_hook_active });
const force = { BRUJULA_GATE_FORCE: "1" };

describe("quality-gate hook", () => {
  it("passes when typecheck and tests pass", () => {
    const r = runHook("quality-gate.sh", stop(), { ...force, BRUJULA_TYPECHECK_CMD: "true", BRUJULA_TEST_CMD: "true" });
    expect(r.code).toBe(0);
  });

  it("blocks with exit 2 and the log tail when typecheck fails", () => {
    const r = runHook("quality-gate.sh", stop(), {
      ...force,
      BRUJULA_TYPECHECK_CMD: "echo 'TS2322 boom'; exit 1",
      BRUJULA_TEST_CMD: "true",
    });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("Typecheck fails");
    expect(r.stderr).toContain("TS2322 boom");
  });

  it("lets the turn end when BRUJULA_GATE_OFF=1 even if everything fails", () => {
    const r = runHook("quality-gate.sh", stop(), {
      ...force,
      BRUJULA_GATE_OFF: "1",
      BRUJULA_TYPECHECK_CMD: "exit 1",
      BRUJULA_TEST_CMD: "exit 1",
    });
    expect(r.code).toBe(0);
    expect(r.stderr).toBe("");
  });

  it("blocks with exit 2 when tests fail", () => {
    const r = runHook("quality-gate.sh", stop(), {
      ...force,
      BRUJULA_TYPECHECK_CMD: "true",
      BRUJULA_TEST_CMD: "echo 'FAIL chunk.test.ts'; exit 1",
    });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("FAIL chunk.test.ts");
  });

  it("does not block again when already continuing because of the hook", () => {
    const r = runHook("quality-gate.sh", stop(true), {
      ...force,
      BRUJULA_TYPECHECK_CMD: "exit 1",
      BRUJULA_TEST_CMD: "exit 1",
    });
    expect(r.code).toBe(0);
  });
});
