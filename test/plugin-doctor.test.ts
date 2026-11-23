import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const doctor = join(import.meta.dirname, "../plugin/scripts/doctor.mjs");

type Check = { name: string; ok: boolean; detail: string; fix: string };

/** A plugin root whose runtime manifest declares one native dependency. */
function pluginRoot() {
  const root = mkdtempSync(join(tmpdir(), "plugroot-"));
  mkdirSync(join(root, "runtime"));
  writeFileSync(
    join(root, "runtime/package.json"),
    JSON.stringify({ name: "brujula-runtime", dependencies: { "fake-native": "1.0.0" } }),
  );
  return root;
}

/** A local git repository standing in for the marketplace (no network). */
function marketplace() {
  const dir = mkdtempSync(join(tmpdir(), "market-"));
  execFileSync("git", ["init", "-q", "-b", "main", dir]);
  execFileSync("git", [
    "-C",
    dir,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    "c",
  ]);
  return dir;
}

/** A project directory, optionally with a .claude/brujula.json. */
function project(config?: string) {
  const dir = mkdtempSync(join(tmpdir(), "project-"));
  if (config !== undefined) {
    mkdirSync(join(dir, ".claude"));
    writeFileSync(join(dir, ".claude/brujula.json"), config);
  }
  return dir;
}

function run(root: string, data: string, url: string, projectDir = project('{ "pullRequests": true }')) {
  const r = spawnSync(process.execPath, [doctor, root, data, url], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
  });
  return { status: r.status, checks: JSON.parse(r.stdout) as Check[] };
}

const byName = (checks: Check[], name: string) => checks.find((c) => c.name === name);

describe("doctor.mjs", () => {
  it("fails on an empty data dir and gives the exact command that installs the runtime deps", () => {
    const root = pluginRoot();
    const data = mkdtempSync(join(tmpdir(), "data-"));
    const r = run(root, data, marketplace());
    expect(r.status).not.toBe(0);
    const deps = byName(r.checks, "runtime-deps");
    expect(deps).toMatchObject({ ok: false });
    expect(deps?.fix).toBe(`CLAUDE_PLUGIN_DATA="${data}" node "${join(root, "scripts/start-mcp.mjs")}" --install-only`);
  });

  it("passes when the data dir has every runtime dependency and the marketplace is reachable", () => {
    const root = pluginRoot();
    const data = mkdtempSync(join(tmpdir(), "data-"));
    mkdirSync(join(data, "node_modules/fake-native"), { recursive: true });
    writeFileSync(join(data, "node_modules/fake-native/package.json"), "{}");
    const r = run(root, data, marketplace());
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.status).toBe(0);
  });

  it("reports an unreachable marketplace with a copyable verification command", () => {
    const root = pluginRoot();
    const data = mkdtempSync(join(tmpdir(), "data-"));
    const missing = join(tmpdir(), "no-such-marketplace-repo");
    const r = run(root, data, missing);
    const git = byName(r.checks, "marketplace-git");
    expect(git?.ok).toBe(false);
    expect(git?.fix).toContain(`GIT_TERMINAL_PROMPT=0 git ls-remote "${missing}" HEAD`);
  });

  it("reports whether the project uses pull requests and how to declare it when unset", () => {
    const root = pluginRoot();
    const data = mkdtempSync(join(tmpdir(), "data-"));
    const url = marketplace();
    const without = project('{ "pullRequests": false }');
    expect(byName(run(root, data, url, without).checks, "pull-requests")).toMatchObject({
      ok: true,
      detail: "this project does not use pull requests: pushing to main is allowed",
    });
    const unset = project();
    const r = run(root, data, url, unset);
    expect(byName(r.checks, "pull-requests")).toMatchObject({
      ok: false,
      detail: `not declared in ${join(unset, ".claude/brujula.json")}`,
    });
    expect(byName(r.checks, "pull-requests")?.fix).toBe(
      `echo '{ "pullRequests": true }' > .claude/brujula.json   # or false if this project does not use pull requests`,
    );
    expect(r.status).not.toBe(0);
    for (const d of [root, data, url, without, unset]) rmSync(d, { recursive: true, force: true });
  });

  it("checks the Node version", () => {
    const r = run(pluginRoot(), mkdtempSync(join(tmpdir(), "data-")), marketplace());
    expect(byName(r.checks, "node-version")).toMatchObject({ ok: true });
  });
});
