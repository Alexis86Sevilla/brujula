import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scriptsDir } from "./hooks/helpers.js";

const doctor = join(scriptsDir, "doctor.mjs");

type Check = { name: string; ok: boolean; detail: string; fix: string; skipped?: boolean };

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

function run(
  root: string,
  data: string,
  url: string,
  projectDir = project('{ "pullRequests": true }'),
  env: Record<string, string> = {},
) {
  const r = spawnSync(process.execPath, [doctor, root, data, url], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir, ...env },
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

  it("skips the marketplace check, without failing, when git cannot reach the credential helper (Claude Code's sandbox)", () => {
    const root = pluginRoot();
    const data = mkdtempSync(join(tmpdir(), "data-"));
    const bin = mkdtempSync(join(tmpdir(), "fake-git-"));
    // What git prints inside the sandbox on WSL: the Windows credential manager is out of reach.
    writeFileSync(
      join(bin, "git"),
      "#!/bin/sh\n" +
        "echo '<3>WSL (14 - ) ERROR: UtilBindVsockAnyPort:309: socket failed 1' >&2\n" +
        "echo \"fatal: could not read Password for 'https://x@dev.azure.com/o/p/_git/r': No such device or address\" >&2\n" +
        "exit 128\n",
      { mode: 0o755 },
    );
    const url = "https://dev.azure.com/o/p/_git/r";
    const r = run(root, data, url, project('{ "pullRequests": true }'), { PATH: `${bin}:${process.env.PATH}` });
    const git = byName(r.checks, "marketplace-git");
    expect(git).toMatchObject({ ok: true, skipped: true, fix: "" });
    expect(git?.detail).toContain("cannot be checked from inside Claude Code's sandbox");
    expect(git?.detail).toContain(`GIT_TERMINAL_PROMPT=0 git ls-remote "${url}" HEAD`);
    for (const d of [root, data, bin]) rmSync(d, { recursive: true, force: true });
  });

  it("reads the personal .claude/brujula.local.json too", () => {
    const root = pluginRoot();
    const data = mkdtempSync(join(tmpdir(), "data-"));
    const dir = project();
    mkdirSync(join(dir, ".claude"));
    writeFileSync(join(dir, ".claude/brujula.local.json"), '{ "pullRequests": false }');
    expect(byName(run(root, data, marketplace(), dir).checks, "pull-requests")).toMatchObject({
      ok: true,
      detail: "this project does not use pull requests: pushing to main is allowed",
    });
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
      detail: `not declared in .claude/brujula.json or .claude/brujula.local.json of ${unset}`,
    });
    expect(byName(r.checks, "pull-requests")?.fix).toContain("/brujula:configurar");
    expect(byName(r.checks, "pull-requests")?.fix).toContain(".claude/brujula.local.json");
    expect(r.status).not.toBe(0);
    for (const d of [root, data, url, without, unset]) rmSync(d, { recursive: true, force: true });
  });

  it("checks the Node version", () => {
    const r = run(pluginRoot(), mkdtempSync(join(tmpdir(), "data-")), marketplace());
    expect(byName(r.checks, "node-version")).toMatchObject({ ok: true });
  });
});
