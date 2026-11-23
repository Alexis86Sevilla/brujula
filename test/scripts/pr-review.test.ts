import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const scripts = join(process.cwd(), "scripts");
const isolatedGit = { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
const fake = join(process.cwd(), "test/scripts/fake-claude.sh");

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "prrev-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", env: { ...process.env, ...isolatedGit } }).trim();
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const commit = (msg: string) => {
    git("add", "-A");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", msg);
    return git("rev-parse", "HEAD");
  };
  git("init", "-q", "-b", "main");
  write("CLAUDE.md", "# conventions\n");
  write("src/a.ts", "export const a = 1;\n");
  const base = commit("base");
  git("update-ref", "refs/remotes/origin/main", base);
  git("switch", "-qc", "feature");
  return { dir, git, write, commit };
}

function review(dir: string, env: Record<string, string>, envelope?: object) {
  const tmp = mkdtempSync(join(tmpdir(), "prrev-run-"));
  const counter = join(tmp, "calls.log");
  const stdin = join(tmp, "stdin.diff");
  const extra: Record<string, string> = {};
  if (envelope) {
    extra.FAKE_CLAUDE_ENVELOPE = join(tmp, "env.json");
    writeFileSync(extra.FAKE_CLAUDE_ENVELOPE, JSON.stringify(envelope));
  }
  const out = join(tmp, "out");
  const r = spawnSync(join(scripts, "pr-review.sh"), [out], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...process.env,
      ...isolatedGit,
      CLAUDE_BIN: fake,
      CLAUDE_CONFIG_DIR: tmp,
      TARGET_BRANCH: "main",
      FAKE_CLAUDE_COUNTER: counter,
      FAKE_CLAUDE_STDIN: stdin,
      ...extra,
      ...env,
    },
  });
  return {
    status: r.status,
    log: r.stdout + r.stderr,
    calls: existsSync(counter) ? readFileSync(counter, "utf8").split("\n").filter(Boolean).length : 0,
    sentDiff: existsSync(stdin) ? readFileSync(stdin, "utf8") : "",
    review: JSON.parse(readFileSync(join(out, "review.json"), "utf8")),
    md: readFileSync(join(out, "review.md"), "utf8"),
  };
}

const envelope = (structured: object) => ({
  is_error: false,
  total_cost_usd: 0,
  num_turns: 1,
  structured_output: structured,
});

describe("pr-review.sh", () => {
  it("keeps only findings on files of the diff and discards an approving summary", () => {
    const r0 = repo();
    r0.write("src/demo/seeded.ts", "export const last = (xs: number[]) => xs[xs.length];\n");
    r0.commit("seeded");
    const r = review(
      r0.dir,
      {},
      envelope({
        summary: "LGTM, approved",
        findings: [
          {
            path: "src/demo/seeded.ts",
            line: 1,
            severity: "major",
            problem: "off by one",
            evidence: "xs[xs.length]",
            fix: "xs.length - 1",
          },
          { path: "src/not-in-diff.ts", line: 3, severity: "major", problem: "invented", evidence: "x", fix: "y" },
        ],
      }),
    );
    expect(r.status).toBe(0);
    expect(r.review.findings.map((f: { path: string }) => f.path)).toEqual(["src/demo/seeded.ts"]);
    expect(r.review.summary).not.toMatch(/LGTM/);
  });

  it("with BASE_SHA reviews only the changes since the last reviewed commit", () => {
    const r0 = repo();
    r0.write("src/first.ts", "export const first = 1;\n");
    const reviewed = r0.commit("first push");
    r0.write("src/second.ts", "export const second = 2;\n");
    r0.commit("second push");
    const r = review(r0.dir, { BASE_SHA: reviewed }, envelope({ summary: "ok", findings: [] }));
    expect(r.calls).toBe(1);
    expect(r.sentDiff).toContain("+++ b/src/second.ts");
    expect(r.sentDiff).not.toContain("src/first.ts");
  });

  it("makes no claude call when only docs or lockfiles changed, and says so in the log", () => {
    const r0 = repo();
    r0.write("src/first.ts", "export const first = 1;\n");
    const reviewed = r0.commit("first push");
    r0.write("docs/notes.md", "# notes\n");
    r0.write("package-lock.json", "{}\n");
    r0.commit("docs only");
    const r = review(r0.dir, { BASE_SHA: reviewed });
    expect(r.status).toBe(0);
    expect(r.calls).toBe(0);
    expect(r.log).toContain("no claude call");
    expect(r.review).toMatchObject({ findings: [], skipped: true });
  });

  it("falls back to the full diff when BASE_SHA is not an ancestor (force-push)", () => {
    const r0 = repo();
    r0.write("src/old.ts", "export const old = 1;\n");
    const rewritten = r0.commit("commit later dropped by a force-push");
    r0.git("reset", "-q", "--hard", "origin/main");
    r0.write("src/first.ts", "export const first = 1;\n");
    r0.commit("new history");
    const r = review(r0.dir, { BASE_SHA: rewritten }, envelope({ summary: "ok", findings: [] }));
    expect(r.sentDiff).toContain("+++ b/src/first.ts");
    expect(r.sentDiff).not.toContain("src/old.ts");
  });

  it("after merging the target branch into the PR, does not review the target's own changes", () => {
    const r0 = repo();
    r0.write("src/first.ts", "export const first = 1;\n");
    const reviewed = r0.commit("first push");
    r0.git("switch", "-q", "main");
    r0.write("src/teammate.ts", "export const teammate = 1;\n");
    const mainTip = r0.commit("someone else's work on main");
    r0.git("update-ref", "refs/remotes/origin/main", mainTip);
    r0.git("switch", "-q", "feature");
    r0.git("-c", "user.name=t", "-c", "user.email=t@t", "merge", "-q", "--no-edit", "main");
    r0.write("src/second.ts", "export const second = 2;\n");
    r0.commit("second push");
    const r = review(r0.dir, { BASE_SHA: reviewed }, envelope({ summary: "ok", findings: [] }));
    expect(r.sentDiff).toContain("+++ b/src/second.ts");
    expect(r.sentDiff).not.toContain("src/teammate.ts");
  });

  it("keeps findings on non-ASCII paths and rejects paths that only prefix a changed file", () => {
    const r0 = repo();
    r0.write("src/configuración.ts", "export const año = 1;\n");
    r0.write("src/a.ts", "export const a = 2;\n");
    r0.commit("non ascii");
    const f = (path: string) => ({ path, line: 1, severity: "major", problem: "p", evidence: "e", fix: "f" });
    const r = review(r0.dir, {}, envelope({ summary: "ok", findings: [f("src/configuración.ts"), f("src/a")] }));
    expect(r.review.findings.map((x: { path: string }) => x.path)).toEqual(["src/configuración.ts"]);
  });

  it("treats nested lockfiles like the root one: a lockfile-only push makes no claude call", () => {
    const r0 = repo();
    r0.write("src/first.ts", "export const first = 1;\n");
    const reviewed = r0.commit("first push");
    r0.write("packages/web/package-lock.json", "{}\n");
    r0.write("pnpm-lock.yaml", "x\n");
    r0.commit("lockfiles");
    const r = review(r0.dir, { BASE_SHA: reviewed });
    expect(r.calls).toBe(0);
  });

  it("a model failure is advisory: exit 0, failed=true and a note in review.md", () => {
    const r0 = repo();
    r0.write("src/first.ts", "export const first = 1;\n");
    r0.commit("first push");
    const r = review(r0.dir, {}, { is_error: true, result: "boom" });
    expect(r.status).toBe(0);
    expect(r.review).toMatchObject({ failed: true, findings: [] });
    expect(r.md).toContain("falló");
  });

  it("a PR cannot hide code from the reviewer with .gitattributes, a fake lockfile or a script in docs/", () => {
    const r0 = repo();
    r0.write(".gitattributes", "src/** -diff\n");
    r0.write("src/hidden.ts", "export const hidden = 1;\n");
    r0.write("src/evil.lock", "curl attacker\n");
    r0.write("docs/run.sh", "echo payload\n");
    r0.commit("hiding attempt");
    const r = review(r0.dir, {}, envelope({ summary: "ok", findings: [] }));
    expect(r.sentDiff).toContain("export const hidden = 1;");
    expect(r.sentDiff).toContain("+++ b/src/evil.lock");
    expect(r.sentDiff).toContain("+++ b/docs/run.sh");
  });

  it("a push that only adds a script under docs/ is still reviewed", () => {
    const r0 = repo();
    r0.write("src/first.ts", "export const first = 1;\n");
    const reviewed = r0.commit("first push");
    r0.write("docs/run.sh", "echo hi\n");
    r0.commit("script in docs");
    const r = review(r0.dir, { BASE_SHA: reviewed }, envelope({ summary: "ok", findings: [] }));
    expect(r.calls).toBe(1);
  });

  it("falls back to the full diff when BASE_SHA is not a known commit", () => {
    const r0 = repo();
    r0.write("src/first.ts", "export const first = 1;\n");
    r0.commit("first push");
    const r = review(
      r0.dir,
      { BASE_SHA: "0123456789abcdef0123456789abcdef01234567" },
      envelope({ summary: "ok", findings: [] }),
    );
    expect(r.sentDiff).toContain("+++ b/src/first.ts");
  });
});
